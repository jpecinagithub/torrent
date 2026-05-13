# Torrent Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted torrent web app with real-time progress using Node.js + Express + WebTorrent on the backend and React + Vite on the frontend.

**Architecture:** Monorepo with two npm workspaces (`server` and `client`). The server wraps WebTorrent in a service class, exposes a REST API via Express, and pushes live progress via Socket.io. The React client consumes both.

**Tech Stack:** Node.js 20, TypeScript 5, Express 5, WebTorrent 1.x (CJS), Socket.io 4, better-sqlite3, React 18, Vite 5, Tailwind CSS 3, TanStack Table 8, Recharts 2.

---

## File Map

```
torrent-app/
  package.json                          ← npm workspaces root
  .gitignore
  downloads/                            ← created at runtime

  server/
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      types.ts                          ← TorrentRecord, ProgressPayload, etc.
      index.ts                          ← Express + Socket.io bootstrap + startup reload
      db/
        schema.ts                       ← CREATE TABLE + open DB
        queries.ts                      ← insert/select/update/delete helpers
      torrent/
        service.ts                      ← WebTorrentService class
      routes/
        torrents.ts                     ← /api/torrents REST handlers
        settings.ts                     ← /api/settings/speed handler
      socket/
        handlers.ts                     ← Socket.io event setup + progress interval
    tests/
      torrents.test.ts                  ← Supertest integration tests

  client/
    package.json
    vite.config.ts
    tailwind.config.ts
    postcss.config.ts
    index.html
    src/
      types.ts                          ← TorrentRow, ProgressEvent (shared shape)
      main.tsx
      App.tsx
      api/
        client.ts                       ← fetch wrapper for REST API
      hooks/
        useSocket.ts                    ← Socket.io connection + event subscriptions
        useTorrents.ts                  ← combined state: REST list + socket updates
      components/
        Toolbar.tsx
        Sidebar.tsx
        TorrentTable.tsx
        DetailPanel.tsx
        SpeedChart.tsx
        AddTorrentDialog.tsx
        StatusBar.tsx
        Toast.tsx
```

---

## Task 1: Monorepo root scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `downloads/.gitkeep`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "torrent-app",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
downloads/*
!downloads/.gitkeep
*.db
.env
.superpowers/
```

- [ ] **Step 3: Create downloads placeholder**

```bash
mkdir downloads
echo "" > downloads/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git init
git add package.json .gitignore downloads/.gitkeep
git commit -m "chore: monorepo root scaffold"
```

---

## Task 2: Server package scaffold

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`

- [ ] **Step 1: Create server/package.json**

```json
{
  "name": "server",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^9.6.0",
    "express": "^5.0.1",
    "multer": "^1.4.5-lts.1",
    "socket.io": "^4.7.5",
    "webtorrent": "^1.9.7"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/express": "^5.0.0",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.0.0",
    "@types/webtorrent": "^0.109.8",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "tsx": "^4.19.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create server/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Install server dependencies**

```bash
cd server && npm install
```

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "chore: server package scaffold"
```

---

## Task 3: Shared server types

**Files:**
- Create: `server/src/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export type TorrentStatus = 'downloading' | 'seeding' | 'paused' | 'completed'

export interface TorrentRecord {
  id: string           // info hash
  name: string
  size: number         // bytes
  status: TorrentStatus
  progress: number     // 0.0 to 1.0
  download_dir: string
  magnet_uri: string | null
  added_at: number     // unix timestamp ms
}

export interface ProgressPayload {
  hash: string
  progress: number
  downloadSpeed: number  // bytes/s
  uploadSpeed: number    // bytes/s
  peers: number
  eta: number            // seconds, -1 if unknown
}

export interface SpeedSettings {
  downloadLimit: number  // bytes/s, 0 = unlimited
  uploadLimit: number
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/types.ts
git commit -m "feat: shared server types"
```

---

## Task 4: Database setup

**Files:**
- Create: `server/src/db/schema.ts`
- Create: `server/src/db/queries.ts`
- Create: `server/tests/db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/tests/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '../src/db/schema'
import { insertTorrent, getTorrents, getTorrent, updateStatus, deleteTorrent } from '../src/db/queries'
import type { TorrentRecord } from '../src/types'
import Database from 'better-sqlite3'

let db: Database.Database

beforeEach(() => {
  db = openDb(':memory:')
})

afterEach(() => {
  db.close()
})

const sample: TorrentRecord = {
  id: 'abc123',
  name: 'Test Torrent',
  size: 1024,
  status: 'downloading',
  progress: 0.5,
  download_dir: '/downloads',
  magnet_uri: 'magnet:?xt=urn:btih:abc123',
  added_at: Date.now(),
}

describe('insertTorrent', () => {
  it('inserts and retrieves a torrent', () => {
    insertTorrent(db, sample)
    const result = getTorrent(db, 'abc123')
    expect(result?.name).toBe('Test Torrent')
    expect(result?.progress).toBe(0.5)
  })

  it('throws on duplicate id', () => {
    insertTorrent(db, sample)
    expect(() => insertTorrent(db, sample)).toThrow()
  })
})

describe('getTorrents', () => {
  it('returns all torrents', () => {
    insertTorrent(db, sample)
    insertTorrent(db, { ...sample, id: 'def456', name: 'Another' })
    expect(getTorrents(db)).toHaveLength(2)
  })
})

describe('updateStatus', () => {
  it('updates status and progress', () => {
    insertTorrent(db, sample)
    updateStatus(db, 'abc123', 'paused', 0.5)
    expect(getTorrent(db, 'abc123')?.status).toBe('paused')
  })
})

describe('deleteTorrent', () => {
  it('removes the torrent', () => {
    insertTorrent(db, sample)
    deleteTorrent(db, 'abc123')
    expect(getTorrent(db, 'abc123')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npm test -- tests/db.test.ts
```

Expected: FAIL — `Cannot find module '../src/db/schema'`

- [ ] **Step 3: Create server/src/db/schema.ts**

```typescript
import Database from 'better-sqlite3'

export function openDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS torrents (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      size         INTEGER NOT NULL,
      status       TEXT NOT NULL,
      progress     REAL DEFAULT 0,
      download_dir TEXT NOT NULL,
      magnet_uri   TEXT,
      added_at     INTEGER NOT NULL
    )
  `)
  return db
}
```

- [ ] **Step 4: Create server/src/db/queries.ts**

```typescript
import Database from 'better-sqlite3'
import type { TorrentRecord, TorrentStatus } from '../types'

export function insertTorrent(db: Database.Database, t: TorrentRecord): void {
  db.prepare(`
    INSERT INTO torrents (id, name, size, status, progress, download_dir, magnet_uri, added_at)
    VALUES (@id, @name, @size, @status, @progress, @download_dir, @magnet_uri, @added_at)
  `).run(t)
}

export function getTorrents(db: Database.Database): TorrentRecord[] {
  return db.prepare('SELECT * FROM torrents ORDER BY added_at DESC').all() as TorrentRecord[]
}

export function getTorrent(db: Database.Database, id: string): TorrentRecord | undefined {
  return db.prepare('SELECT * FROM torrents WHERE id = ?').get(id) as TorrentRecord | undefined
}

export function updateStatus(
  db: Database.Database,
  id: string,
  status: TorrentStatus,
  progress: number
): void {
  db.prepare('UPDATE torrents SET status = ?, progress = ? WHERE id = ?').run(status, progress, id)
}

export function deleteTorrent(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM torrents WHERE id = ?').run(id)
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd server && npm test -- tests/db.test.ts
```

Expected: PASS — 6 tests

- [ ] **Step 6: Commit**

```bash
git add server/src/db/ server/tests/db.test.ts
git commit -m "feat: SQLite schema and queries"
```

---

## Task 5: WebTorrent service

**Files:**
- Create: `server/src/torrent/service.ts`

- [ ] **Step 1: Create service.ts**

```typescript
import WebTorrent from 'webtorrent'
import type { TorrentRecord, ProgressPayload, SpeedSettings } from '../types'

type ProgressCallback = (payload: ProgressPayload) => void
type StatusCallback = (hash: string, status: 'seeding' | 'completed' | 'downloading') => void
type ErrorCallback = (hash: string, message: string) => void

export class WebTorrentService {
  private client: WebTorrent.Instance
  onProgress: ProgressCallback = () => {}
  onStatus: StatusCallback = () => {}
  onError: ErrorCallback = () => {}

  constructor() {
    this.client = new WebTorrent()
    this.client.on('error', (err) => console.error('[WebTorrent]', err))
  }

  add(magnetOrBuffer: string | Buffer, downloadDir: string): Promise<TorrentRecord> {
    return new Promise((resolve, reject) => {
      const opts = { path: downloadDir }
      const torrent = this.client.add(magnetOrBuffer as string, opts)

      torrent.on('error', (err: Error) => reject(err))

      torrent.on('metadata', () => {
        const record: TorrentRecord = {
          id: torrent.infoHash,
          name: torrent.name,
          size: torrent.length,
          status: 'downloading',
          progress: torrent.progress,
          download_dir: downloadDir,
          magnet_uri: torrent.magnetURI,
          added_at: Date.now(),
        }
        resolve(record)
      })

      torrent.on('done', () => {
        this.onStatus(torrent.infoHash, 'completed')
      })

      torrent.on('upload', () => {
        if (torrent.done) this.onStatus(torrent.infoHash, 'seeding')
      })
    })
  }

  remove(hash: string, deleteFiles: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.remove(hash, { destroyStore: deleteFiles }, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  pause(hash: string): void {
    const t = this.client.get(hash)
    if (t) t.pause()
  }

  resume(hash: string): void {
    const t = this.client.get(hash)
    if (t) t.resume()
  }

  setSpeedLimits(settings: SpeedSettings): void {
    this.client.throttleDownload(settings.downloadLimit || -1)
    this.client.throttleUpload(settings.uploadLimit || -1)
  }

  getProgress(hash: string): ProgressPayload | null {
    const t = this.client.get(hash)
    if (!t) return null
    return {
      hash: t.infoHash,
      progress: t.progress,
      downloadSpeed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      peers: t.numPeers,
      eta: t.timeRemaining > 0 ? Math.round(t.timeRemaining / 1000) : -1,
    }
  }

  getActiveHashes(): string[] {
    return this.client.torrents
      .filter((t) => !t.paused)
      .map((t) => t.infoHash)
  }

  destroy(): Promise<void> {
    return new Promise((resolve) => this.client.destroy(resolve))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/torrent/service.ts
git commit -m "feat: WebTorrent service wrapper"
```

---

## Task 6: Socket.io handlers

**Files:**
- Create: `server/src/socket/handlers.ts`

- [ ] **Step 1: Create handlers.ts**

```typescript
import type { Server as IOServer } from 'socket.io'
import type { WebTorrentService } from '../torrent/service'

export function setupSocket(io: IOServer, torrentService: WebTorrentService): void {
  // Broadcast progress every second to all connected clients
  setInterval(() => {
    const hashes = torrentService.getActiveHashes()
    for (const hash of hashes) {
      const payload = torrentService.getProgress(hash)
      if (payload) io.emit('torrent:progress', payload)
    }
  }, 1000)

  // Wire service callbacks to socket events
  torrentService.onStatus = (hash, status) => {
    io.emit('torrent:status', { hash, status })
  }

  torrentService.onError = (hash, message) => {
    io.emit('torrent:error', { hash, message })
  }

  io.on('connection', (socket) => {
    console.log('[Socket.io] client connected:', socket.id)
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/socket/handlers.ts
git commit -m "feat: socket.io progress handlers"
```

---

## Task 7: REST routes — torrents

**Files:**
- Create: `server/src/routes/torrents.ts`

- [ ] **Step 1: Create routes/torrents.ts**

```typescript
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import type { Server as IOServer } from 'socket.io'
import type Database from 'better-sqlite3'
import { insertTorrent, getTorrents, getTorrent, updateStatus, deleteTorrent } from '../db/queries'
import type { WebTorrentService } from '../torrent/service'

const upload = multer({ storage: multer.memoryStorage() })

export function torrentRouter(
  db: Database.Database,
  torrentService: WebTorrentService,
  io: IOServer,
  downloadDir: string
): Router {
  const router = Router()

  // GET /api/torrents
  router.get('/', (_req, res) => {
    res.json(getTorrents(db))
  })

  // POST /api/torrents  (magnet or .torrent file)
  router.post('/', upload.single('torrent'), async (req, res) => {
    try {
      const magnet: string | undefined = req.body?.magnet
      const file: Buffer | undefined = req.file?.buffer

      if (!magnet && !file) {
        return res.status(400).json({ error: 'Provide a magnet URI or .torrent file' })
      }

      const input = (magnet ?? file) as string | Buffer
      const record = await torrentService.add(input, downloadDir)

      if (getTorrent(db, record.id)) {
        return res.status(409).json({ error: 'Torrent already exists' })
      }

      insertTorrent(db, record)
      io.emit('torrent:added', { torrent: record })
      res.status(201).json(record)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      res.status(400).json({ error: msg })
    }
  })

  // DELETE /api/torrents/:hash
  router.delete('/:hash', async (req, res) => {
    const { hash } = req.params
    const deleteFiles = req.query.deleteFiles === 'true'

    if (!getTorrent(db, hash)) {
      return res.status(404).json({ error: 'Torrent not found' })
    }

    await torrentService.remove(hash, deleteFiles)
    deleteTorrent(db, hash)
    io.emit('torrent:removed', { hash })
    res.status(204).send()
  })

  // PATCH /api/torrents/:hash/pause
  router.patch('/:hash/pause', (req, res) => {
    const { hash } = req.params
    if (!getTorrent(db, hash)) return res.status(404).json({ error: 'Torrent not found' })
    torrentService.pause(hash)
    updateStatus(db, hash, 'paused', getTorrent(db, hash)!.progress)
    io.emit('torrent:status', { hash, status: 'paused' })
    res.json({ status: 'paused' })
  })

  // PATCH /api/torrents/:hash/resume
  router.patch('/:hash/resume', (req, res) => {
    const { hash } = req.params
    if (!getTorrent(db, hash)) return res.status(404).json({ error: 'Torrent not found' })
    torrentService.resume(hash)
    updateStatus(db, hash, 'downloading', getTorrent(db, hash)!.progress)
    io.emit('torrent:status', { hash, status: 'downloading' })
    res.json({ status: 'downloading' })
  })

  return router
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/torrents.ts
git commit -m "feat: torrents REST routes"
```

---

## Task 8: REST routes — settings

**Files:**
- Create: `server/src/routes/settings.ts`

- [ ] **Step 1: Create routes/settings.ts**

```typescript
import { Router } from 'express'
import type { WebTorrentService } from '../torrent/service'

export function settingsRouter(torrentService: WebTorrentService): Router {
  const router = Router()

  // PATCH /api/settings/speed
  router.patch('/speed', (req, res) => {
    const { downloadLimit, uploadLimit } = req.body
    if (typeof downloadLimit !== 'number' || typeof uploadLimit !== 'number') {
      return res.status(400).json({ error: 'downloadLimit and uploadLimit must be numbers' })
    }
    torrentService.setSpeedLimits({ downloadLimit, uploadLimit })
    res.json({ downloadLimit, uploadLimit })
  })

  return router
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/settings.ts
git commit -m "feat: settings REST route"
```

---

## Task 9: Express entry point

**Files:**
- Create: `server/src/index.ts`

- [ ] **Step 1: Create index.ts**

```typescript
import express from 'express'
import { createServer } from 'http'
import { Server as IOServer } from 'socket.io'
import path from 'path'
import { openDb } from './db/schema'
import { getTorrents, updateStatus } from './db/queries'
import { WebTorrentService } from './torrent/service'
import { torrentRouter } from './routes/torrents'
import { settingsRouter } from './routes/settings'
import { setupSocket } from './socket/handlers'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000
const DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_DIR ?? '../downloads')
const DB_PATH = process.env.DB_PATH ?? 'torrents.db'

const app = express()
const httpServer = createServer(app)
const io = new IOServer(httpServer, { cors: { origin: '*' } })

app.use(express.json())

const db = openDb(DB_PATH)
const torrentService = new WebTorrentService()

// Reload persisted torrents on startup
async function reloadTorrents() {
  const torrents = getTorrents(db).filter(
    (t) => t.status === 'downloading' || t.status === 'paused'
  )
  for (const t of torrents) {
    try {
      const input = t.magnet_uri ?? t.id
      await torrentService.add(input, t.download_dir)
      if (t.status === 'paused') torrentService.pause(t.id)
    } catch {
      updateStatus(db, t.id, 'paused', t.progress)
    }
  }
  console.log(`[Startup] Reloaded ${torrents.length} torrents`)
}

// Routes
app.use('/api/torrents', torrentRouter(db, torrentService, io, DOWNLOAD_DIR))
app.use('/api/settings', settingsRouter(torrentService))

// Serve client build in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve('../client/dist')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

setupSocket(io, torrentService)

reloadTorrents().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`)
  })
})

process.on('SIGINT', async () => {
  await torrentService.destroy()
  db.close()
  process.exit(0)
})
```

- [ ] **Step 2: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: Express + Socket.io entry point with startup reload"
```

---

## Task 10: REST integration tests

**Files:**
- Create: `server/tests/torrents.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createServer } from 'http'
import { Server as IOServer } from 'socket.io'
import { openDb } from '../src/db/schema'
import { WebTorrentService } from '../src/torrent/service'
import { torrentRouter } from '../src/routes/torrents'
import { settingsRouter } from '../src/routes/settings'
import { setupSocket } from '../src/socket/handlers'
import path from 'path'

let app: express.Express
let httpServer: ReturnType<typeof createServer>
let torrentService: WebTorrentService

beforeAll(async () => {
  app = express()
  app.use(express.json())
  httpServer = createServer(app)
  const io = new IOServer(httpServer)
  const db = openDb(':memory:')
  torrentService = new WebTorrentService()
  const downloadDir = path.resolve('./tests/fixtures')

  app.use('/api/torrents', torrentRouter(db, torrentService, io, downloadDir))
  app.use('/api/settings', settingsRouter(torrentService))
  setupSocket(io, torrentService)

  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
})

afterAll(async () => {
  await torrentService.destroy()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

describe('GET /api/torrents', () => {
  it('returns empty array initially', async () => {
    const res = await request(app).get('/api/torrents')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('POST /api/torrents', () => {
  it('returns 400 with no body', async () => {
    const res = await request(app).post('/api/torrents').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })
})

describe('PATCH /api/settings/speed', () => {
  it('accepts valid speed limits', async () => {
    const res = await request(app)
      .patch('/api/settings/speed')
      .send({ downloadLimit: 0, uploadLimit: 0 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ downloadLimit: 0, uploadLimit: 0 })
  })

  it('returns 400 with invalid body', async () => {
    const res = await request(app)
      .patch('/api/settings/speed')
      .send({ downloadLimit: 'fast' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/torrents/:hash', () => {
  it('returns 404 for unknown hash', async () => {
    const res = await request(app).delete('/api/torrents/nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/torrents/:hash/pause', () => {
  it('returns 404 for unknown hash', async () => {
    const res = await request(app).patch('/api/torrents/nonexistent/pause')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd server && npm test -- tests/torrents.test.ts
```

Expected: PASS — all 6 tests (these don't require live torrents)

- [ ] **Step 3: Commit**

```bash
git add server/tests/torrents.test.ts
git commit -m "test: REST API integration tests"
```

---

## Task 11: Client scaffold

**Files:**
- Create: `client/package.json`
- Create: `client/vite.config.ts`
- Create: `client/tailwind.config.ts`
- Create: `client/postcss.config.ts`
- Create: `client/index.html`

- [ ] **Step 1: Create client/package.json**

```json
{
  "name": "client",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-table": "^8.17.3",
    "recharts": "^2.12.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.6",
    "typescript": "^5.4.0",
    "vite": "^5.3.5"
  }
}
```

- [ ] **Step 2: Create client/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
```

- [ ] **Step 3: Create client/tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Catppuccin Mocha
        base: '#1e1e2e',
        mantle: '#181825',
        crust: '#11111b',
        surface0: '#313244',
        surface1: '#45475a',
        overlay0: '#6c7086',
        text: '#cdd6f4',
        subtext: '#a6adc8',
        blue: '#89b4fa',
        green: '#a6e3a1',
        red: '#f38ba8',
        yellow: '#f9e2af',
        peach: '#fab387',
        mauve: '#cba6f7',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 4: Create client/postcss.config.ts**

```typescript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="es" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Torrent App</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-crust text-text font-mono">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Install client dependencies**

```bash
cd client && npm install
```

- [ ] **Step 7: Commit**

```bash
git add client/
git commit -m "chore: client scaffold with Vite + React + Tailwind Catppuccin"
```

---

## Task 12: Client shared types

**Files:**
- Create: `client/src/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export type TorrentStatus = 'downloading' | 'seeding' | 'paused' | 'completed'

export interface TorrentRow {
  id: string
  name: string
  size: number
  status: TorrentStatus
  progress: number
  download_dir: string
  magnet_uri: string | null
  added_at: number
  // live data from socket
  downloadSpeed: number
  uploadSpeed: number
  peers: number
  eta: number
  hasError: boolean
  errorMessage: string
}

export interface ProgressEvent {
  hash: string
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  peers: number
  eta: number
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/types.ts
git commit -m "feat: client shared types"
```

---

## Task 13: API client

**Files:**
- Create: `client/src/api/client.ts`

- [ ] **Step 1: Create client.ts**

```typescript
import type { TorrentRow } from '../types'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  listTorrents: (): Promise<TorrentRow[]> =>
    request('/torrents'),

  addMagnet: (magnet: string): Promise<TorrentRow> =>
    request('/torrents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet }),
    }),

  addFile: (file: File): Promise<TorrentRow> => {
    const form = new FormData()
    form.append('torrent', file)
    return request('/torrents', { method: 'POST', body: form })
  },

  deleteTorrent: (hash: string, deleteFiles = false): Promise<void> =>
    request(`/torrents/${hash}?deleteFiles=${deleteFiles}`, { method: 'DELETE' }),

  pauseTorrent: (hash: string): Promise<void> =>
    request(`/torrents/${hash}/pause`, { method: 'PATCH' }),

  resumeTorrent: (hash: string): Promise<void> =>
    request(`/torrents/${hash}/resume`, { method: 'PATCH' }),

  setSpeedLimits: (downloadLimit: number, uploadLimit: number): Promise<void> =>
    request('/settings/speed', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadLimit, uploadLimit }),
    }),
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api/client.ts
git commit -m "feat: REST API client"
```

---

## Task 14: useSocket hook

**Files:**
- Create: `client/src/hooks/useSocket.ts`

- [ ] **Step 1: Create useSocket.ts**

```typescript
import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ProgressEvent, TorrentRow } from '../types'

interface SocketEvents {
  onProgress: (e: ProgressEvent) => void
  onAdded: (e: { torrent: TorrentRow }) => void
  onRemoved: (e: { hash: string }) => void
  onStatus: (e: { hash: string; status: TorrentRow['status'] }) => void
  onError: (e: { hash: string; message: string }) => void
}

export function useSocket(events: SocketEvents) {
  const socketRef = useRef<Socket | null>(null)
  const eventsRef = useRef(events)
  eventsRef.current = events

  useEffect(() => {
    const socket = io({ path: '/socket.io' })
    socketRef.current = socket

    socket.on('torrent:progress', (e: ProgressEvent) => eventsRef.current.onProgress(e))
    socket.on('torrent:added', (e: { torrent: TorrentRow }) => eventsRef.current.onAdded(e))
    socket.on('torrent:removed', (e: { hash: string }) => eventsRef.current.onRemoved(e))
    socket.on('torrent:status', (e: { hash: string; status: TorrentRow['status'] }) =>
      eventsRef.current.onStatus(e)
    )
    socket.on('torrent:error', (e: { hash: string; message: string }) =>
      eventsRef.current.onError(e)
    )

    return () => { socket.disconnect() }
  }, [])
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useSocket.ts
git commit -m "feat: useSocket hook"
```

---

## Task 15: useTorrents hook

**Files:**
- Create: `client/src/hooks/useTorrents.ts`

- [ ] **Step 1: Create useTorrents.ts**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useSocket } from './useSocket'
import type { TorrentRow } from '../types'

const DEFAULT_ROW: Pick<TorrentRow, 'downloadSpeed' | 'uploadSpeed' | 'peers' | 'eta' | 'hasError' | 'errorMessage'> = {
  downloadSpeed: 0,
  uploadSpeed: 0,
  peers: 0,
  eta: -1,
  hasError: false,
  errorMessage: '',
}

export function useTorrents() {
  const [torrents, setTorrents] = useState<TorrentRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.listTorrents()
      setTorrents(data.map((t) => ({ ...DEFAULT_ROW, ...t })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load torrents')
    }
  }, [])

  useEffect(() => { load() }, [load])

  useSocket({
    onProgress(e) {
      setTorrents((prev) =>
        prev.map((t) =>
          t.id === e.hash
            ? { ...t, progress: e.progress, downloadSpeed: e.downloadSpeed, uploadSpeed: e.uploadSpeed, peers: e.peers, eta: e.eta }
            : t
        )
      )
    },
    onAdded({ torrent }) {
      setTorrents((prev) => [{ ...DEFAULT_ROW, ...torrent }, ...prev])
    },
    onRemoved({ hash }) {
      setTorrents((prev) => prev.filter((t) => t.id !== hash))
    },
    onStatus({ hash, status }) {
      setTorrents((prev) => prev.map((t) => (t.id === hash ? { ...t, status } : t)))
    },
    onError({ hash, message }) {
      setTorrents((prev) =>
        prev.map((t) => (t.id === hash ? { ...t, hasError: true, errorMessage: message } : t))
      )
    },
  })

  return { torrents, error, reload: load }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useTorrents.ts
git commit -m "feat: useTorrents hook combining REST + socket state"
```

---

## Task 16: Toast component

**Files:**
- Create: `client/src/components/Toast.tsx`

- [ ] **Step 1: Create Toast.tsx**

```typescript
import { useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'error' | 'info'
  onDismiss: () => void
}

export function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded text-sm font-mono shadow-lg border ${
        type === 'error'
          ? 'bg-mantle border-red text-red'
          : 'bg-mantle border-blue text-blue'
      }`}
    >
      {message}
      <button onClick={onDismiss} className="ml-4 opacity-60 hover:opacity-100">✕</button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Toast.tsx
git commit -m "feat: Toast notification component"
```

---

## Task 17: AddTorrentDialog component

**Files:**
- Create: `client/src/components/AddTorrentDialog.tsx`

- [ ] **Step 1: Create AddTorrentDialog.tsx**

```typescript
import { useState, useRef } from 'react'
import { api } from '../api/client'

interface Props {
  onAdded: () => void
  onError: (msg: string) => void
  onClose: () => void
}

export function AddTorrentDialog({ onAdded, onError, onClose }: Props) {
  const [magnet, setMagnet] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleMagnet() {
    if (!magnet.trim()) return
    setLoading(true)
    try {
      await api.addMagnet(magnet.trim())
      onAdded()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error adding torrent')
    } finally {
      setLoading(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      await api.addFile(file)
      onAdded()
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error adding torrent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-crust/80">
      <div className="bg-mantle border border-surface0 rounded-lg p-6 w-[480px] space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-text font-semibold">Añadir torrent</h2>
          <button onClick={onClose} className="text-overlay0 hover:text-text">✕</button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-overlay0 uppercase">Magnet link</label>
          <input
            className="w-full bg-base border border-surface0 rounded px-3 py-2 text-sm text-text placeholder-overlay0 focus:outline-none focus:border-blue"
            placeholder="magnet:?xt=urn:btih:..."
            value={magnet}
            onChange={(e) => setMagnet(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleMagnet()}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleMagnet}
            disabled={loading || !magnet.trim()}
            className="bg-blue text-crust font-semibold px-4 py-2 rounded text-sm disabled:opacity-40 hover:opacity-90"
          >
            {loading ? 'Añadiendo...' : 'Añadir magnet'}
          </button>
          <span className="text-overlay0 text-sm">o</span>
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-surface0 text-text px-4 py-2 rounded text-sm hover:bg-surface1"
          >
            Subir .torrent
          </button>
          <input ref={fileRef} type="file" accept=".torrent" className="hidden" onChange={handleFile} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/AddTorrentDialog.tsx
git commit -m "feat: AddTorrentDialog component"
```

---

## Task 18: Toolbar component

**Files:**
- Create: `client/src/components/Toolbar.tsx`

- [ ] **Step 1: Create Toolbar.tsx**

```typescript
import { useState } from 'react'
import { api } from '../api/client'
import { AddTorrentDialog } from './AddTorrentDialog'
import type { TorrentRow } from '../types'

interface Props {
  torrents: TorrentRow[]
  onAdded: () => void
  onError: (msg: string) => void
}

function fmt(bps: number): string {
  if (bps === 0) return '0 B/s'
  if (bps < 1024) return `${bps} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

export function Toolbar({ torrents, onAdded, onError }: Props) {
  const [showAdd, setShowAdd] = useState(false)

  const totalDown = torrents.reduce((s, t) => s + t.downloadSpeed, 0)
  const totalUp = torrents.reduce((s, t) => s + t.uploadSpeed, 0)

  async function pauseAll() {
    await Promise.all(
      torrents.filter((t) => t.status === 'downloading').map((t) => api.pauseTorrent(t.id))
    )
  }

  async function resumeAll() {
    await Promise.all(
      torrents.filter((t) => t.status === 'paused').map((t) => api.resumeTorrent(t.id))
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-mantle border-b border-surface0 text-sm">
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue text-crust font-semibold px-3 py-1 rounded text-xs hover:opacity-90"
        >
          + Añadir torrent
        </button>
        <button
          onClick={pauseAll}
          className="bg-surface0 text-text px-3 py-1 rounded text-xs hover:bg-surface1"
        >
          ⏸ Pausar todo
        </button>
        <button
          onClick={resumeAll}
          className="bg-surface0 text-text px-3 py-1 rounded text-xs hover:bg-surface1"
        >
          ▶ Reanudar todo
        </button>
        <div className="flex-1" />
        <span className="text-overlay0 text-xs font-mono">
          ↓ {fmt(totalDown)} &nbsp; ↑ {fmt(totalUp)}
        </span>
      </div>

      {showAdd && (
        <AddTorrentDialog
          onAdded={onAdded}
          onError={onError}
          onClose={() => setShowAdd(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Toolbar.tsx
git commit -m "feat: Toolbar component"
```

---

## Task 19: Sidebar component

**Files:**
- Create: `client/src/components/Sidebar.tsx`

- [ ] **Step 1: Create Sidebar.tsx**

```typescript
import type { TorrentRow, TorrentStatus } from '../types'

type Filter = 'all' | TorrentStatus

interface Props {
  torrents: TorrentRow[]
  filter: Filter
  onFilter: (f: Filter) => void
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'downloading', label: 'Descargando' },
  { key: 'seeding', label: 'Subiendo' },
  { key: 'paused', label: 'Pausados' },
  { key: 'completed', label: 'Completados' },
]

export function Sidebar({ torrents, filter, onFilter }: Props) {
  function count(key: Filter) {
    if (key === 'all') return torrents.length
    return torrents.filter((t) => t.status === key).length
  }

  return (
    <aside className="w-36 bg-mantle border-r border-surface0 flex flex-col text-xs py-1 flex-shrink-0">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onFilter(key)}
          className={`text-left px-3 py-1.5 transition-colors ${
            filter === key
              ? 'text-blue bg-base border-l-2 border-blue'
              : 'text-overlay0 hover:text-text border-l-2 border-transparent'
          }`}
        >
          {label} ({count(key)})
        </button>
      ))}
      <div className="flex-1" />
      <button className="text-left px-3 py-1.5 text-overlay0 hover:text-text border-l-2 border-transparent">
        ⚙ Ajustes
      </button>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Sidebar.tsx
git commit -m "feat: Sidebar filter component"
```

---

## Task 20: TorrentTable component

**Files:**
- Create: `client/src/components/TorrentTable.tsx`

- [ ] **Step 1: Create TorrentTable.tsx**

```typescript
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { api } from '../api/client'
import type { TorrentRow } from '../types'

const helper = createColumnHelper<TorrentRow>()

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtSpeed(bps: number): string {
  if (bps === 0) return '—'
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
}

const STATUS_COLOR: Record<TorrentRow['status'], string> = {
  downloading: 'text-green',
  seeding: 'text-peach',
  paused: 'text-overlay0',
  completed: 'text-blue',
}

const STATUS_LABEL: Record<TorrentRow['status'], string> = {
  downloading: '● Descargando',
  seeding: '▲ Subiendo',
  paused: '⏸ Pausado',
  completed: '✓ Completo',
}

interface Props {
  torrents: TorrentRow[]
  selected: string | null
  onSelect: (id: string) => void
  onError: (msg: string) => void
}

export function TorrentTable({ torrents, selected, onSelect, onError }: Props) {
  const columns = [
    helper.accessor('name', {
      header: 'Nombre',
      cell: (info) => (
        <span className={`truncate block max-w-xs ${info.row.original.hasError ? 'text-red' : 'text-text'}`}>
          {info.getValue()}
          {info.row.original.hasError && (
            <span className="ml-2 text-xs bg-red/20 text-red px-1 rounded">error</span>
          )}
        </span>
      ),
    }),
    helper.accessor('size', {
      header: 'Tamaño',
      cell: (info) => <span className="text-overlay0">{fmtSize(info.getValue())}</span>,
    }),
    helper.accessor('progress', {
      header: 'Progreso',
      cell: (info) => {
        const pct = Math.round(info.getValue() * 100)
        return (
          <div className="w-20">
            <div className="bg-surface0 rounded-sm h-1.5 mb-0.5">
              <div
                className={`h-1.5 rounded-sm ${info.row.original.status === 'completed' ? 'bg-green' : 'bg-blue'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-blue">{pct}%</span>
          </div>
        )
      },
    }),
    helper.accessor('status', {
      header: 'Estado',
      cell: (info) => (
        <span className={`text-xs ${STATUS_COLOR[info.getValue()]}`}>
          {STATUS_LABEL[info.getValue()]}
        </span>
      ),
    }),
    helper.accessor('downloadSpeed', {
      header: '↓ Vel.',
      cell: (info) => <span className={`${info.getValue() > 0 ? 'text-green' : 'text-overlay0'}`}>{fmtSpeed(info.getValue())}</span>,
    }),
    helper.accessor('uploadSpeed', {
      header: '↑ Vel.',
      cell: (info) => <span className={`${info.getValue() > 0 ? 'text-peach' : 'text-overlay0'}`}>{fmtSpeed(info.getValue())}</span>,
    }),
    helper.accessor('peers', {
      header: 'Peers',
      cell: (info) => <span className="text-overlay0">{info.getValue() || '—'}</span>,
    }),
    helper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const t = row.original
        return (
          <div className="flex gap-1 justify-end">
            {t.status === 'downloading' && (
              <button
                onClick={(e) => { e.stopPropagation(); api.pauseTorrent(t.id).catch((err) => onError(err.message)) }}
                className="text-overlay0 hover:text-text text-xs px-1"
              >⏸</button>
            )}
            {t.status === 'paused' && (
              <button
                onClick={(e) => { e.stopPropagation(); api.resumeTorrent(t.id).catch((err) => onError(err.message)) }}
                className="text-overlay0 hover:text-text text-xs px-1"
              >▶</button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`¿Eliminar "${t.name}"?`)) {
                  api.deleteTorrent(t.id).catch((err) => onError(err.message))
                }
              }}
              className="text-overlay0 hover:text-red text-xs px-1"
            >✕</button>
          </div>
        )
      },
    }),
  ]

  const table = useReactTable({
    data: torrents,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-mantle z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-surface0">
              {hg.headers.map((h) => (
                <th key={h.id} className="text-left px-3 py-1.5 text-overlay0 font-normal whitespace-nowrap">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.original.id)}
              className={`border-b border-surface0/40 cursor-pointer hover:bg-base transition-colors ${
                selected === row.original.id ? 'bg-base' : ''
              }`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-1.5 whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {torrents.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-overlay0 py-12">
                No hay torrents. Añade uno con el botón de arriba.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/TorrentTable.tsx
git commit -m "feat: TorrentTable with TanStack Table"
```

---

## Task 21: SpeedChart component

**Files:**
- Create: `client/src/components/SpeedChart.tsx`

- [ ] **Step 1: Create SpeedChart.tsx**

```typescript
import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint {
  t: number
  down: number
  up: number
}

interface Props {
  downloadSpeed: number
  uploadSpeed: number
}

const MAX_POINTS = 60

export function SpeedChart({ downloadSpeed, uploadSpeed }: Props) {
  const [data, setData] = useState<DataPoint[]>([])
  const tickRef = useRef(0)

  useEffect(() => {
    setData((prev) => {
      const next = [...prev, { t: tickRef.current++, down: downloadSpeed, up: uploadSpeed }]
      return next.slice(-MAX_POINTS)
    })
  }, [downloadSpeed, uploadSpeed])

  function fmtSpeed(bps: number) {
    if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(0)} KB/s`
    return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
  }

  return (
    <ResponsiveContainer width="100%" height={64}>
      <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="down" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#89b4fa" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#89b4fa" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#fab387" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#fab387" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis hide dataKey="t" />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: '#181825', border: '1px solid #313244', fontSize: 11 }}
          formatter={(v: number, name: string) => [fmtSpeed(v), name === 'down' ? '↓' : '↑']}
          labelFormatter={() => ''}
        />
        <Area type="monotone" dataKey="down" stroke="#89b4fa" fill="url(#down)" strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="up" stroke="#fab387" fill="url(#up)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/SpeedChart.tsx
git commit -m "feat: SpeedChart with Recharts"
```

---

## Task 22: DetailPanel component

**Files:**
- Create: `client/src/components/DetailPanel.tsx`

- [ ] **Step 1: Create DetailPanel.tsx**

```typescript
import { SpeedChart } from './SpeedChart'
import type { TorrentRow } from '../types'

interface Props {
  torrent: TorrentRow | null
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtEta(seconds: number): string {
  if (seconds < 0) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function DetailPanel({ torrent }: Props) {
  if (!torrent) {
    return (
      <div className="h-32 flex items-center justify-center text-overlay0 text-xs border-t border-surface0">
        Selecciona un torrent para ver los detalles
      </div>
    )
  }

  const downloaded = torrent.progress * torrent.size

  return (
    <div className="border-t border-surface0 bg-mantle px-4 py-3">
      <p className="text-overlay0 text-xs mb-2 uppercase truncate">{torrent.name}</p>
      <div className="grid grid-cols-4 gap-4 mb-3">
        <div>
          <p className="text-xs text-overlay0">DESCARGADO</p>
          <p className="text-sm text-text font-mono">{fmtSize(downloaded)}</p>
        </div>
        <div>
          <p className="text-xs text-overlay0">TAMAÑO TOTAL</p>
          <p className="text-sm text-text font-mono">{fmtSize(torrent.size)}</p>
        </div>
        <div>
          <p className="text-xs text-overlay0">PEERS</p>
          <p className="text-sm text-text font-mono">{torrent.peers}</p>
        </div>
        <div>
          <p className="text-xs text-overlay0">ETA</p>
          <p className="text-sm text-text font-mono">{fmtEta(torrent.eta)}</p>
        </div>
      </div>
      <SpeedChart downloadSpeed={torrent.downloadSpeed} uploadSpeed={torrent.uploadSpeed} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/DetailPanel.tsx
git commit -m "feat: DetailPanel with stats and SpeedChart"
```

---

## Task 23: StatusBar component

**Files:**
- Create: `client/src/components/StatusBar.tsx`

- [ ] **Step 1: Create StatusBar.tsx**

```typescript
import type { TorrentRow } from '../types'

interface Props {
  torrents: TorrentRow[]
}

function fmtSpeed(bps: number): string {
  if (bps === 0) return '0 B/s'
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
}

export function StatusBar({ torrents }: Props) {
  const totalDown = torrents.reduce((s, t) => s + t.downloadSpeed, 0)
  const totalUp = torrents.reduce((s, t) => s + t.uploadSpeed, 0)

  return (
    <div className="flex gap-6 px-3 py-1 bg-mantle border-t border-surface0 text-xs text-overlay0 font-mono">
      <span>{torrents.length} torrents</span>
      <span>↓ {fmtSpeed(totalDown)}</span>
      <span>↑ {fmtSpeed(totalUp)}</span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/StatusBar.tsx
git commit -m "feat: StatusBar component"
```

---

## Task 24: App layout assembly

**Files:**
- Create: `client/src/App.tsx`
- Create: `client/src/main.tsx`

- [ ] **Step 1: Create App.tsx**

```typescript
import { useState } from 'react'
import { useTorrents } from './hooks/useTorrents'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { TorrentTable } from './components/TorrentTable'
import { DetailPanel } from './components/DetailPanel'
import { StatusBar } from './components/StatusBar'
import { Toast } from './components/Toast'
import type { TorrentStatus } from './types'

type Filter = 'all' | TorrentStatus

export function App() {
  const { torrents, reload } = useTorrents()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null)

  const filtered = filter === 'all' ? torrents : torrents.filter((t) => t.status === filter)
  const selectedTorrent = torrents.find((t) => t.id === selected) ?? null

  function showError(msg: string) {
    setToast({ message: msg, type: 'error' })
  }

  return (
    <div className="h-screen flex flex-col bg-crust overflow-hidden">
      <Toolbar torrents={torrents} onAdded={reload} onError={showError} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar torrents={torrents} filter={filter} onFilter={setFilter} />

        <main className="flex flex-col flex-1 overflow-hidden">
          <TorrentTable
            torrents={filtered}
            selected={selected}
            onSelect={setSelected}
            onError={showError}
          />
          <DetailPanel torrent={selectedTorrent} />
        </main>
      </div>

      <StatusBar torrents={torrents} />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3: Create client/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  overflow: hidden;
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/
git commit -m "feat: App layout assembly — full UI wired up"
```

---

## Task 25: Manual verification

- [ ] **Step 1: Start the server**

```bash
cd server && npm run dev
```

Expected: `[Server] Running on http://localhost:3000`

- [ ] **Step 2: Start the client**

```bash
cd client && npm run dev
```

Expected: `Local: http://localhost:5173`

- [ ] **Step 3: Verify flow 1 — Add magnet**

1. Open http://localhost:5173
2. Click "+ Añadir torrent"
3. Paste a public magnet link (e.g. a Linux ISO magnet)
4. Click "Añadir magnet"
5. Verify: torrent appears in table, progress bar starts moving, speeds update

- [ ] **Step 4: Verify flow 2 — Pause / resume / delete**

1. Click ⏸ on a downloading torrent → status changes to "Pausado", speeds go to 0
2. Click ▶ → status returns to "Descargando", progress resumes
3. Click ✕ → confirm dialog → torrent removed from list

- [ ] **Step 5: Verify flow 3 — Speed limits**

1. Open browser devtools console
2. Run: `fetch('/api/settings/speed', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ downloadLimit: 102400, uploadLimit: 0 }) })`
3. Verify: download speed caps at ~100 KB/s

- [ ] **Step 6: Verify flow 4 — Server restart persistence**

1. Stop the server (Ctrl+C)
2. Restart: `npm run dev`
3. Verify: torrents reappear in the list and resume downloading

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "chore: project complete — all manual flows verified"
```

---

## Summary

| Task | What it delivers |
|---|---|
| 1–2 | Monorepo root + server scaffold |
| 3 | Shared TypeScript types |
| 4 | SQLite schema + queries (tested) |
| 5 | WebTorrent service wrapper |
| 6 | Socket.io progress broadcast |
| 7–8 | REST routes: torrents + settings |
| 9 | Express entry point with startup reload |
| 10 | REST API integration tests |
| 11 | Client scaffold (Vite + Tailwind Catppuccin) |
| 12 | Client TypeScript types |
| 13 | Fetch-based API client |
| 14 | useSocket hook |
| 15 | useTorrents combined state hook |
| 16 | Toast notification |
| 17 | AddTorrentDialog (magnet + file) |
| 18 | Toolbar with global controls |
| 19 | Sidebar with status filters |
| 20 | TorrentTable (TanStack Table) |
| 21 | SpeedChart (Recharts) |
| 22 | DetailPanel |
| 23 | StatusBar |
| 24 | App layout assembly |
| 25 | Manual verification |
