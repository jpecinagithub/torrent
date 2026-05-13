# Torrent Web App — Design Spec

**Date:** 2026-05-13
**Status:** Approved

---

## Overview

Personal self-hosted web application that replicates the core functionality of qBittorrent. Accessible from any browser on the local network. Single user, no authentication required.

**Core features:**
- Add torrents via magnet link or `.torrent` file upload
- View torrent list with real-time progress, speeds, and peer count
- Pause, resume, and delete torrents
- Global download/upload speed limits
- Detail panel per torrent with stats and speed graph

---

## Architecture

**Pattern:** Monorepo with two workspaces — `server` and `client`.

```
torrent-app/
  server/          ← Node.js + Express + WebTorrent
    src/
      routes/      ← REST API endpoints
      torrent/     ← WebTorrent service wrapper
      db/          ← SQLite schema and queries
      socket/      ← Socket.io event handlers
    index.ts       ← Entry point
  client/          ← React + Vite + Tailwind
    src/
      components/  ← TorrentTable, DetailPanel, SpeedBar, AddDialog
      hooks/       ← useSocket, useTorrents
      api/         ← REST client (fetch wrapper)
    index.html
  downloads/       ← Downloaded files land here
  package.json     ← npm workspaces root
```

**Data flow:**
1. Browser sends REST requests to add/remove/pause/resume torrents
2. Backend delegates to WebTorrent engine
3. WebTorrent communicates with the BitTorrent network (trackers, DHT, peers)
4. Backend emits real-time progress events to browser via Socket.io
5. Browser updates UI reactively from socket events

---

## Stack

### Backend
| Package | Version | Role |
|---|---|---|
| Node.js | 20+ | Runtime |
| TypeScript | 5+ | Language |
| Express | 5 | HTTP server + REST API |
| WebTorrent | latest | BitTorrent engine |
| Socket.io | 4 | Real-time progress events |
| better-sqlite3 | latest | Persistent torrent state |
| multer | latest | `.torrent` file uploads |

### Frontend
| Package | Version | Role |
|---|---|---|
| React | 18 | UI framework |
| Vite | 5 | Build tool + dev server |
| TypeScript | 5+ | Language |
| Tailwind CSS | 3 | Styling |
| TanStack Table | 8 | Dense torrent table |
| Recharts | 2 | Real-time speed graph |
| socket.io-client | 4 | Real-time connection |

---

## Data Model

### SQLite — `torrents` table

```sql
CREATE TABLE torrents (
  id           TEXT PRIMARY KEY,  -- info hash (40 hex chars)
  name         TEXT NOT NULL,
  size         INTEGER NOT NULL,  -- total bytes
  status       TEXT NOT NULL,     -- downloading | seeding | paused | completed
  progress     REAL DEFAULT 0,    -- 0.0 to 1.0
  download_dir TEXT NOT NULL,
  magnet_uri   TEXT,
  added_at     INTEGER NOT NULL   -- unix timestamp
);
```

Runtime state (speeds, peers, eta) is never persisted — it comes from WebTorrent live and is broadcast via Socket.io only.

---

## REST API

| Method | Route | Body | Description |
|---|---|---|---|
| `GET` | `/api/torrents` | — | List all torrents |
| `POST` | `/api/torrents` | `{ magnet }` or multipart `.torrent` | Add torrent |
| `DELETE` | `/api/torrents/:hash?deleteFiles=true` | — | Remove torrent; `deleteFiles=true` also deletes downloaded files |
| `PATCH` | `/api/torrents/:hash/pause` | — | Pause torrent |
| `PATCH` | `/api/torrents/:hash/resume` | — | Resume torrent |
| `PATCH` | `/api/settings/speed` | `{ downloadLimit, uploadLimit }` | Set global speed limits (bytes/s, 0 = unlimited) |

### Error responses

| Status | Condition |
|---|---|
| `400` | Invalid magnet URI or malformed `.torrent` file |
| `404` | Torrent hash not found |
| `409` | Torrent already exists (duplicate info hash) |
| `507` | Insufficient storage space |

---

## Socket.io Events (server → client)

| Event | Payload | Frequency |
|---|---|---|
| `torrent:progress` | `{ hash, progress, downloadSpeed, uploadSpeed, peers, eta }` | Every 1s per active torrent |
| `torrent:added` | `{ torrent }` | On add |
| `torrent:removed` | `{ hash }` | On remove |
| `torrent:status` | `{ hash, status }` | On status change |
| `torrent:error` | `{ hash, message }` | On engine error |

---

## UI Layout

**Single-page app with three zones:**

```
┌─────────────────────────────────────────────────────┐
│  Toolbar: [+ Add] [⏸ Pause all] [▶ Resume all]  ↓↑  │
├──────────┬──────────────────────────────────────────┤
│ Sidebar  │  Torrent Table                           │
│          │  Name | Size | Progress | Status | Speeds│
│ All (4)  │  ─────────────────────────────────────── │
│ DL  (2)  │  row...                                  │
│ Seed (1) │  row...                                  │
│ Pause(1) │  row...                                  │
│ Done (1) │                                          │
│          ├──────────────────────────────────────────┤
│ Settings │  Detail Panel (selected torrent)         │
│          │  Downloaded | Uploaded | Ratio | ETA     │
│          │  [speed graph]                           │
├──────────┴──────────────────────────────────────────┤
│  Status bar: N torrents | Free space | ↓ x | ↑ y   │
└─────────────────────────────────────────────────────┘
```

**Visual style:** Dark mode (Catppuccin Mocha palette), monospace font for numbers, dense row height (~32px), progress bars inline in table cells.

---

## Error Handling

| Scenario | Backend | Frontend |
|---|---|---|
| Invalid magnet | `400` response | Toast notification |
| Duplicate torrent | `409` response | Toast notification |
| Disk full | `torrent:error` socket event | Row turns red, error badge |
| Lost connectivity to peers | WebTorrent retries automatically | Speed shows 0, peers shows 0 |
| Server restart | Torrents reloaded from SQLite on startup | — |

On server startup, all `downloading` or `paused` torrents stored in SQLite are re-added to the WebTorrent engine to resume their state.

---

## Testing

Minimal suite appropriate for a personal project:

| Scope | Tool | Approach |
|---|---|---|
| REST endpoints | Vitest + Supertest | Integration tests against real SQLite (no mocks) |
| WebTorrent service | Vitest | Small public-domain test torrents |
| Frontend | Manual | Browser testing of core flows |

**Core flows to verify manually:**
1. Add torrent via magnet → appears in list → progress updates
2. Add torrent via `.torrent` file upload → same flow
3. Pause → resume → delete
4. Set speed limits → verify they apply
5. Server restart → torrents persist and resume

---

## Out of Scope (v1)

- User authentication
- Multi-user support
- Torrent search / Jackett integration
- RSS auto-download
- Labels and categories
- Scheduler (time-based speed limits)
- Remote access / reverse proxy setup
