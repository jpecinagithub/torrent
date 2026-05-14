# Download to PC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ⬇ button to completed torrents that lets the user download individual files from the Oracle server directly to their browser's Downloads folder.

**Architecture:** Two new engine methods expose torrent file metadata and resolve absolute paths. Two new REST endpoints list files and stream them via FastAPI's `FileResponse`. The frontend adds a ⬇ button in the table actions column; single-file torrents download immediately, multi-file torrents show a small popover for the user to pick one.

**Tech Stack:** Python libtorrent (torrent_file / file_storage API), FastAPI FileResponse, React, TypeScript, Tailwind Catppuccin.

---

## File Map

| File | Change |
|---|---|
| `server-py/engine.py` | Add `get_files()` and `get_file_path()` methods |
| `server-py/routes/torrents.py` | Add `GET /{hash}/files` and `GET /{hash}/files/{index}` |
| `server-py/tests/test_engine.py` | New file — unit tests for the two new engine methods |
| `server-py/tests/test_routes.py` | Add 4 new route tests |
| `client/src/api/client.ts` | Add `FileEntry` interface and `getFiles()` |
| `client/src/components/FileListPopover.tsx` | New component — file picker popover |
| `client/src/components/TorrentTable.tsx` | Add ⬇ button and popover state |

---

### Task 1: Engine methods — get_files() and get_file_path()

**Files:**
- Modify: `server-py/engine.py`
- Create: `server-py/tests/test_engine.py`

- [ ] **Step 1: Create test file with 4 failing tests**

```python
# server-py/tests/test_engine.py
import os
import pytest
from unittest.mock import MagicMock
from engine import TorrentEngine


def _make_engine(handles: dict) -> TorrentEngine:
    """Instantiate TorrentEngine without calling __init__ (avoids libtorrent session)."""
    e = TorrentEngine.__new__(TorrentEngine)
    e.download_dir = "/downloads"
    e.handles = handles
    return e


def _mock_handle(file_paths: list[str], file_sizes: list[int], save_path: str = "/downloads"):
    mock_fs = MagicMock()
    mock_fs.num_files.return_value = len(file_paths)
    mock_fs.file_path.side_effect = file_paths
    mock_fs.file_size.side_effect = file_sizes

    mock_ti = MagicMock()
    mock_ti.files.return_value = mock_fs

    mock_status = MagicMock()
    mock_status.save_path = save_path

    handle = MagicMock()
    handle.is_valid.return_value = True
    handle.torrent_file.return_value = mock_ti
    handle.status.return_value = mock_status
    return handle


def test_get_files_returns_list():
    handle = _mock_handle(
        file_paths=["Movie/Movie.mkv", "Movie/Subs.srt"],
        file_sizes=[1_500_000_000, 42_000],
    )
    engine = _make_engine({"abc123": handle})
    result = engine.get_files("abc123")
    assert len(result) == 2
    assert result[0] == {"index": 0, "name": "Movie.mkv", "size": 1_500_000_000}
    assert result[1] == {"index": 1, "name": "Subs.srt", "size": 42_000}


def test_get_files_returns_empty_when_no_metadata():
    handle = MagicMock()
    handle.is_valid.return_value = True
    handle.torrent_file.return_value = None
    engine = _make_engine({"abc123": handle})
    assert engine.get_files("abc123") == []


def test_get_file_path_returns_absolute_path():
    handle = _mock_handle(
        file_paths=["Movie/Movie.mkv"],
        file_sizes=[1_500_000_000],
        save_path="/downloads",
    )
    engine = _make_engine({"abc123": handle})
    path = engine.get_file_path("abc123", 0)
    assert path == os.path.join("/downloads", "Movie/Movie.mkv")


def test_get_file_path_returns_none_for_invalid_index():
    mock_fs = MagicMock()
    mock_fs.num_files.return_value = 1
    mock_ti = MagicMock()
    mock_ti.files.return_value = mock_fs
    handle = MagicMock()
    handle.is_valid.return_value = True
    handle.torrent_file.return_value = mock_ti
    engine = _make_engine({"abc123": handle})
    assert engine.get_file_path("abc123", 99) is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server-py
python -m pytest tests/test_engine.py -v
```
Expected: 4 FAIL — `AttributeError: 'TorrentEngine' object has no attribute 'get_files'`

- [ ] **Step 3: Add the two methods to engine.py**

Add after the `list_all` method (line 192, before `destroy`):

```python
def get_files(self, hash_str: str) -> list[dict]:
    """Return list of files in the torrent with index, name (basename), and size."""
    handle = self.handles.get(hash_str)
    if not handle or not handle.is_valid():
        return []
    tf = handle.torrent_file()
    if not tf:
        return []
    files = tf.files()
    result = []
    for i in range(files.num_files()):
        result.append({
            "index": i,
            "name": os.path.basename(files.file_path(i)),
            "size": files.file_size(i),
        })
    return result

def get_file_path(self, hash_str: str, file_index: int) -> Optional[str]:
    """Return the absolute path on disk for a specific file in the torrent."""
    handle = self.handles.get(hash_str)
    if not handle or not handle.is_valid():
        return None
    tf = handle.torrent_file()
    if not tf:
        return None
    files = tf.files()
    if file_index < 0 or file_index >= files.num_files():
        return None
    s = handle.status()
    return os.path.join(s.save_path, files.file_path(file_index))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server-py
python -m pytest tests/test_engine.py -v
```
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add server-py/engine.py server-py/tests/test_engine.py
git commit -m "feat: add get_files and get_file_path to TorrentEngine"
```

---

### Task 2: Route endpoints — list files and stream file

**Files:**
- Modify: `server-py/routes/torrents.py`
- Modify: `server-py/tests/test_routes.py`

- [ ] **Step 1: Add 4 failing tests to test_routes.py**

Add at the bottom of `server-py/tests/test_routes.py`:

```python
def test_list_torrent_files(client, mock_engine):
    mock_engine.get_files.return_value = [
        {"index": 0, "name": "movie.mkv", "size": 1_500_000_000},
    ]
    res = client.get(f"/api/torrents/{RECORD['id']}/files")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["name"] == "movie.mkv"
    assert data[0]["size"] == 1_500_000_000


def test_list_torrent_files_not_found(client, mock_engine):
    res = client.get("/api/torrents/nonexistent_hash_xxx/files")
    assert res.status_code == 404


def test_download_torrent_file(client, mock_engine, tmp_path):
    fake_file = tmp_path / "movie.mkv"
    fake_file.write_bytes(b"fake movie content")
    mock_engine.get_file_path.return_value = str(fake_file)
    res = client.get(f"/api/torrents/{RECORD['id']}/files/0")
    assert res.status_code == 200
    assert res.content == b"fake movie content"
    assert "attachment" in res.headers.get("content-disposition", "")


def test_download_torrent_file_invalid_index(client, mock_engine):
    mock_engine.get_file_path.return_value = None
    res = client.get(f"/api/torrents/{RECORD['id']}/files/99")
    assert res.status_code == 400
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd server-py
python -m pytest tests/test_routes.py::test_list_torrent_files tests/test_routes.py::test_list_torrent_files_not_found tests/test_routes.py::test_download_torrent_file tests/test_routes.py::test_download_torrent_file_invalid_index -v
```
Expected: 4 FAIL — 404 / attribute errors (routes don't exist yet)

- [ ] **Step 3: Add the two endpoints to routes/torrents.py**

Add `from fastapi.responses import FileResponse` at the top import block:

```python
# server-py/routes/torrents.py — top of file, update imports:
import asyncio
import os
import re
import time
from typing import Optional
import aiohttp
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import FileResponse
from models import TorrentRecord
```

Add these two routes inside `make_torrents_router`, after the `resume` route and before `return router`:

```python
    @router.get("/{hash_str}/files")
    async def list_files(hash_str: str):
        if hash_str not in engine.handles:
            raise HTTPException(404, "Torrent not found")
        return engine.get_files(hash_str)

    @router.get("/{hash_str}/files/{file_index}")
    async def download_file(hash_str: str, file_index: int):
        if hash_str not in engine.handles:
            raise HTTPException(404, "Torrent not found")
        path = engine.get_file_path(hash_str, file_index)
        if path is None:
            raise HTTPException(400, "Invalid file index or no metadata")
        if not os.path.exists(path):
            raise HTTPException(404, "File not found on disk")
        filename = os.path.basename(path)
        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=filename,
        )
```

- [ ] **Step 4: Run all route tests**

```bash
cd server-py
python -m pytest tests/test_routes.py -v
```
Expected: all 17 existing + 4 new = **21 PASS**

- [ ] **Step 5: Commit**

```bash
git add server-py/routes/torrents.py server-py/tests/test_routes.py
git commit -m "feat: add GET /api/torrents/{hash}/files endpoints"
```

---

### Task 3: Frontend — FileEntry type and getFiles() API call

**Files:**
- Modify: `client/src/api/client.ts`

- [ ] **Step 1: Add FileEntry interface and getFiles() to client.ts**

```typescript
// client/src/api/client.ts — add this interface before the `api` export:
export interface FileEntry {
  index: number
  name: string
  size: number
}
```

```typescript
// Inside the `api` object, add after resumeTorrent:
  getFiles: (hash: string): Promise<FileEntry[]> =>
    request(`/torrents/${hash}/files`),
```

The full updated `api` object:

```typescript
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

  getFiles: (hash: string): Promise<FileEntry[]> =>
    request(`/torrents/${hash}/files`),

  setSpeedLimits: (downloadLimit: number, uploadLimit: number): Promise<void> =>
    request('/settings/speed', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadLimit, uploadLimit }),
    }),
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add client/src/api/client.ts
git commit -m "feat: add FileEntry type and getFiles() to api client"
```

---

### Task 4: FileListPopover component

**Files:**
- Create: `client/src/components/FileListPopover.tsx`

- [ ] **Step 1: Create the component**

```tsx
// client/src/components/FileListPopover.tsx
import { useEffect, useState } from 'react'
import { api, type FileEntry } from '../api/client'

interface Props {
  hash: string
  onClose: () => void
}

const BASE = (import.meta.env.VITE_BASE_PATH ?? '') + '/api'

function fmtSize(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function FileListPopover({ hash, onClose }: Props) {
  const [files, setFiles] = useState<FileEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getFiles(hash)
      .then(result => {
        if (result.length === 1) {
          // Single file: trigger download immediately without showing the list
          const a = document.createElement('a')
          a.href = `${BASE}/torrents/${hash}/files/0`
          a.download = result[0].name
          a.click()
          onClose()
        } else {
          setFiles(result)
        }
      })
      .catch(e => setError((e as Error).message))
  }, [hash, onClose])

  // Close when clicking outside the popover
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-file-popover]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      data-file-popover
      className="absolute right-0 top-6 z-50 bg-mantle border border-surface0 rounded shadow-xl min-w-56 max-w-xs max-h-60 overflow-y-auto"
      onClick={e => e.stopPropagation()}
    >
      {error && (
        <p className="text-red text-xs px-3 py-2">{error}</p>
      )}
      {!error && !files && (
        <p className="text-overlay0 text-xs px-3 py-2">Cargando…</p>
      )}
      {files && files.map(f => (
        <a
          key={f.index}
          href={`${BASE}/torrents/${hash}/files/${f.index}`}
          download={f.name}
          onClick={onClose}
          className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface0 transition-colors border-b border-surface0/40 last:border-0 cursor-pointer"
        >
          <span className="text-text text-xs truncate">{f.name}</span>
          <span className="text-overlay0 text-xs flex-shrink-0">{fmtSize(f.size)}</span>
        </a>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/FileListPopover.tsx
git commit -m "feat: add FileListPopover component"
```

---

### Task 5: Wire ⬇ button into TorrentTable

**Files:**
- Modify: `client/src/components/TorrentTable.tsx`

- [ ] **Step 1: Add import and state to TorrentTable.tsx**

At the top of `TorrentTable.tsx`, add the import:

```tsx
import { FileListPopover } from './FileListPopover'
```

Inside `TorrentTable`, alongside the existing `useState` for `deleting`, add:

```tsx
const [downloading, setDownloading] = useState<string | null>(null)
```

- [ ] **Step 2: Add ⬇ button to the actions column**

Replace the entire `helper.display` block (the actions column, starting at line 164) with:

```tsx
helper.display({
  id: 'actions',
  header: '',
  cell: ({ row }) => {
    const t = row.original
    return (
      <div className="flex gap-1 justify-end relative">
        {(t.status === 'seeding' || t.status === 'completed') && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDownloading(downloading === t.id ? null : t.id)
              }}
              className="text-overlay0 hover:text-blue text-xs px-1"
              title="Descargar al PC"
            >
              ⬇
            </button>
            {downloading === t.id && (
              <FileListPopover
                hash={t.id}
                onClose={() => setDownloading(null)}
              />
            )}
          </>
        )}
        {t.status === 'downloading' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void api.pauseTorrent(t.id).catch((err: Error) => onError(err.message))
            }}
            className="text-overlay0 hover:text-text text-xs px-1"
          >
            ⏸
          </button>
        )}
        {t.status === 'paused' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void api.resumeTorrent(t.id).catch((err: Error) => onError(err.message))
            }}
            className="text-overlay0 hover:text-text text-xs px-1"
          >
            ▶
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setDeleting(t) }}
          className="text-overlay0 hover:text-red text-xs px-1"
        >
          ✕
        </button>
      </div>
    )
  },
}),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Manual smoke test**

```bash
# Terminal 1 — backend
cd server-py && python main.py

# Terminal 2 — frontend
cd client && npm run dev
```

Open http://localhost:5173. Add any torrent. Once it reaches `seeding` or `completed`:
1. Click ⬇ — if single file, browser download starts immediately
2. Click ⬇ on a multi-file torrent — popover appears with file list
3. Click a file name — download starts, popover closes
4. Click outside the popover — it closes without downloading

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TorrentTable.tsx
git commit -m "feat: add download-to-pc button to torrent table"
```

---

### Task 6: Deploy to Oracle server

- [ ] **Step 1: Build the client**

```bash
cd client
npx vite build --base=/torrent/
```
Expected: `✓ built in X.XXs`

- [ ] **Step 2: Create archive and upload**

```bash
# From repo root
git archive HEAD --format=tar -o "C:\Users\HP\AppData\Local\Temp\torrent-deploy.tar"
scp "C:\Users\HP\AppData\Local\Temp\torrent-deploy.tar" oracle:/home/ubuntu/PROYECTOS/TorrentClient/deploy.tar
```

- [ ] **Step 3: Extract, rebuild frontend, copy assets**

```bash
ssh oracle "cd /home/ubuntu/PROYECTOS/TorrentClient && tar -xf deploy.tar && rm deploy.tar"
ssh oracle "cd /home/ubuntu/PROYECTOS/TorrentClient/client && VITE_BASE_PATH=/torrent npx vite build --base=/torrent/"
ssh oracle "sudo cp -r /home/ubuntu/PROYECTOS/TorrentClient/client/dist/. /var/www/projects/torrent/"
```

- [ ] **Step 4: Restart backend and verify**

```bash
ssh oracle "cd /home/ubuntu/PROYECTOS/TorrentClient/server-py && pm2 startOrReload ecosystem.config.js --update-env"
ssh oracle "curl -s 'http://localhost:3014/api/torrents' | python3 -m json.tool | head -5"
```
Expected: JSON array (empty or with existing torrents), no errors.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: deploy download-to-pc feature to production"
```
