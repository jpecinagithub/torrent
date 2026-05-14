# Download to PC — Design Spec

**Date:** 2026-05-14

## Goal

Allow the user to download a completed torrent's files from the Oracle server directly to their local browser's Downloads folder, without needing to SSH or access the server filesystem.

## Architecture

The backend exposes two new REST endpoints that list and stream torrent files. The frontend adds a ⬇ button in the torrent table's actions column, visible only when a torrent is complete. For single-file torrents the download starts immediately; for multi-file torrents a small popover lists the files and the user picks one. The browser handles the actual file save using its native download system via `Content-Disposition: attachment`.

## Backend

### New method: `engine.get_files(hash_str) → list[dict]`

Added to `server-py/engine.py`. Uses libtorrent's `torrent_file()` to access `file_storage` and returns:

```python
[
  {"index": 0, "name": "Movie.mkv", "size": 1500000000},
  {"index": 1, "name": "Subs/Movie.srt", "size": 42000},
]
```

Returns `[]` if the handle has no metadata yet. Name is the filename only (not the full path), derived from `files().file_path(i)`.

### New endpoint: `GET /api/torrents/{hash}/files`

Added to `server-py/routes/torrents.py`. Returns the list from `engine.get_files()`.

- `404` if hash not found in engine
- `200 []` if torrent has no metadata yet (graceful, not an error)

### New endpoint: `GET /api/torrents/{hash}/files/{file_index}`

Added to `server-py/routes/torrents.py`. Streams the file using FastAPI's `FileResponse`.

- Resolves the absolute path: `engine.download_dir / torrent_save_subdir / relative_file_path`
- Sets `Content-Disposition: attachment; filename="{basename}"` so the browser saves it
- `404` if hash not found or file does not exist on disk
- `400` if `file_index` is out of range

## Frontend

### `client/src/api/client.ts`

Add:
```ts
getFiles: (hash: string): Promise<FileEntry[]> =>
  request(`/torrents/${hash}/files`)
```

Where `FileEntry` is a new interface:
```ts
export interface FileEntry {
  index: number
  name: string
  size: number
}
```

The download URL is constructed directly in the component (no API call needed — it's a plain link):
```ts
const BASE = (import.meta.env.VITE_BASE_PATH ?? '') + '/api'
`${BASE}/torrents/${hash}/files/${index}`
```

### `client/src/components/FileListPopover.tsx` (new)

Small popover component rendered in a portal anchored to the ⬇ button. Props:

```ts
interface Props {
  hash: string
  onClose: () => void
}
```

Behaviour:
1. On mount, calls `api.getFiles(hash)`.
2. If loading → shows a spinner.
3. If error → shows "Error al cargar archivos".
4. If 1 file → immediately calls `window.open(downloadUrl, '_blank')` and calls `onClose()`. User never sees the popover.
5. If multiple files → renders a list. Each row: filename (truncated) + formatted size + click to download. Clicking a row opens the download URL and calls `onClose()`.
6. Clicking outside the popover calls `onClose()`.

### `client/src/components/TorrentTable.tsx`

In the actions column, add a ⬇ button visible only when `t.status === 'seeding' || t.status === 'completed'`:

```tsx
{(t.status === 'seeding' || t.status === 'completed') && (
  <button onClick={(e) => { e.stopPropagation(); setDownloading(t.id) }}
    className="text-overlay0 hover:text-blue text-xs px-1"
    title="Descargar al PC"
  >⬇</button>
)}
```

State: `const [downloading, setDownloading] = useState<string | null>(null)`

When `downloading` is set, renders `<FileListPopover hash={downloading} onClose={() => setDownloading(null)} />`.

## Error handling

| Situation | Behaviour |
|---|---|
| Torrent still downloading | Button not shown (guarded by status check) |
| File moved/deleted from disk | Browser shows native 404 download error |
| `getFiles` network error | Popover shows inline error message |
| Single-file torrent | Skips popover, downloads immediately |

## Files changed

| File | Change |
|---|---|
| `server-py/engine.py` | Add `get_files(hash_str)` method |
| `server-py/routes/torrents.py` | Add `GET /{hash}/files` and `GET /{hash}/files/{index}` |
| `server-py/tests/test_routes.py` | Add tests for both new endpoints |
| `client/src/api/client.ts` | Add `getFiles()` + `FileEntry` interface |
| `client/src/components/FileListPopover.tsx` | New component |
| `client/src/components/TorrentTable.tsx` | Add ⬇ button and popover state |

## What is NOT in scope

- Download progress tracking in the UI (the browser's own download bar handles this)
- Zipping multiple files at once
- Downloading while the torrent is still in progress
- Authentication / download tokens
