# Torrent Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search bar that queries YTS (movies) and EZTV (series via OMDB) in parallel and lets the user add a torrent with one click.

**Architecture:** A new `search.py` module in the Python backend makes async HTTP calls to YTS and OMDB+EZTV in parallel and returns a unified list. A new `/api/search` route exposes it. The existing `POST /api/torrents` is extended to accept a `torrent_url` JSON field so the backend downloads the `.torrent` bytes itself. The frontend adds a search bar that opens a results modal.

**Tech Stack:** Python aiohttp (already installed), FastAPI, React, Tailwind Catppuccin. External APIs: YTS (no auth), OMDB (free API key required), EZTV (no auth).

---

## Pre-requisite: OMDB API key

Register at https://www.omdbapi.com/apikey.aspx (free, 1000 req/day).
Add to the PM2 ecosystem config on the server:
```js
env: {
  PORT: '3014',
  DOWNLOAD_DIR: '...',
  DB_PATH: '...',
  OMDB_API_KEY: 'tu_clave_aqui',   // ← añadir esto
},
```
Without this key, movie search (YTS) still works but series (EZTV) returns empty.

---

### Task 1: Backend search module

**Files:**
- Create: `server-py/search.py`
- Create: `server-py/tests/test_search.py`

- [ ] **Step 1: Write failing tests**

```python
# server-py/tests/test_search.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

YTS_RESPONSE = {
    "data": {
        "movies": [{
            "title": "Inception",
            "year": 2010,
            "medium_cover_image": "https://img.yts.mx/inception.jpg",
            "torrents": [{
                "quality": "1080p",
                "seeds": 500,
                "peers": 120,
                "size": "2.1 GB",
                "url": "https://yts.mx/torrent/download/ABC123",
            }]
        }]
    }
}

OMDB_RESPONSE = {
    "Search": [{
        "Title": "Breaking Bad",
        "Year": "2008–2013",
        "imdbID": "tt0903747",
        "Poster": "https://m.media-amazon.com/images/bb.jpg",
    }]
}

EZTV_RESPONSE = {
    "torrents": [{
        "title": "Breaking.Bad.S01E01.720p.mkv",
        "seeds": 300,
        "peers": 80,
        "size_bytes": 1500000000,
        "torrent_url": "https://eztvx.to/ep/123/bb-s01e01.torrent",
        "magnet_url": "magnet:?xt=urn:btih:DEADBEEF",
    }]
}


@pytest.mark.asyncio
async def test_search_movies_returns_results():
    from search import search_movies

    mock_resp = AsyncMock()
    mock_resp.json = AsyncMock(return_value=YTS_RESPONSE)
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_resp)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("search.aiohttp.ClientSession", return_value=mock_session):
        results = await search_movies("inception")

    assert len(results) == 1
    assert results[0]["title"] == "Inception"
    assert results[0]["type"] == "movie"
    assert results[0]["quality"] == "1080p"
    assert results[0]["seeds"] == 500
    assert results[0]["torrent_url"] == "https://yts.mx/torrent/download/ABC123"


@pytest.mark.asyncio
async def test_search_movies_empty_when_no_results():
    from search import search_movies

    mock_resp = AsyncMock()
    mock_resp.json = AsyncMock(return_value={"data": {}})
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_resp)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("search.aiohttp.ClientSession", return_value=mock_session):
        results = await search_movies("xyznotfound")

    assert results == []


@pytest.mark.asyncio
async def test_search_series_returns_results():
    from search import search_series

    responses = [OMDB_RESPONSE, EZTV_RESPONSE]
    call_count = 0

    async def mock_get(url, **kwargs):
        nonlocal call_count
        resp = AsyncMock()
        resp.json = AsyncMock(return_value=responses[min(call_count, 1)])
        resp.__aenter__ = AsyncMock(return_value=resp)
        resp.__aexit__ = AsyncMock(return_value=False)
        call_count += 1
        return resp

    mock_session = MagicMock()
    mock_session.get = mock_get
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("search.aiohttp.ClientSession", return_value=mock_session):
        with patch("search.OMDB_API_KEY", "testkey"):
            results = await search_series("breaking bad")

    assert len(results) == 1
    assert results[0]["type"] == "series"
    assert results[0]["show"] == "Breaking Bad"
    assert results[0]["torrent_url"] == "https://eztvx.to/ep/123/bb-s01e01.torrent"


@pytest.mark.asyncio
async def test_search_series_empty_without_api_key():
    from search import search_series

    with patch("search.OMDB_API_KEY", ""):
        results = await search_series("breaking bad")

    assert results == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server-py
pip install pytest-asyncio
pytest tests/test_search.py -v
```
Expected: `ModuleNotFoundError: No module named 'search'`

- [ ] **Step 3: Create search.py**

```python
# server-py/search.py
import asyncio
import os
import aiohttp

OMDB_API_KEY = os.environ.get("OMDB_API_KEY", "")


async def search_movies(q: str) -> list[dict]:
    url = f"https://yts.mx/api/v2/list_movies.json?query_term={q}&limit=20&sort_by=seeds"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            data = await resp.json(content_type=None)
    movies = (data.get("data") or {}).get("movies") or []
    results = []
    for m in movies:
        for t in m.get("torrents", []):
            results.append({
                "type": "movie",
                "title": m["title"],
                "year": m.get("year"),
                "poster": m.get("medium_cover_image"),
                "quality": t.get("quality"),
                "seeds": t.get("seeds", 0),
                "peers": t.get("peers", 0),
                "size": t.get("size", ""),
                "torrent_url": t.get("url"),
            })
    return results


async def search_series(q: str) -> list[dict]:
    if not OMDB_API_KEY:
        return []
    async with aiohttp.ClientSession() as session:
        omdb_url = f"https://www.omdbapi.com/?apikey={OMDB_API_KEY}&s={q}&type=series"
        async with session.get(omdb_url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            omdb_data = await resp.json(content_type=None)
        shows = (omdb_data.get("Search")) or []

        async def fetch_eztv(show: dict) -> list[dict]:
            imdb_num = show["imdbID"].lstrip("t")
            eztv_url = f"https://eztvx.to/api/get-torrents?imdb_id={imdb_num}&limit=30"
            async with session.get(eztv_url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                eztv_data = await resp.json(content_type=None)
            results = []
            for t in (eztv_data.get("torrents") or []):
                results.append({
                    "type": "series",
                    "title": t.get("title", show["Title"]),
                    "show": show["Title"],
                    "year": show.get("Year"),
                    "poster": show.get("Poster") if show.get("Poster") != "N/A" else None,
                    "seeds": t.get("seeds", 0),
                    "peers": t.get("peers", 0),
                    "size": str(round(int(t.get("size_bytes", 0)) / 1024 ** 3, 2)) + " GB",
                    "torrent_url": t.get("torrent_url"),
                    "magnet_url": t.get("magnet_url"),
                })
            return results

        lists = await asyncio.gather(*[fetch_eztv(s) for s in shows[:3]])
    return [item for sublist in lists for item in sublist]


async def search(q: str) -> list[dict]:
    movies, series = await asyncio.gather(
        search_movies(q),
        search_series(q),
    )
    return movies + series
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server-py
pytest tests/test_search.py -v
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server-py/search.py server-py/tests/test_search.py
git commit -m "feat: add search module for YTS movies and EZTV series"
```

---

### Task 2: Search route + torrent_url support

**Files:**
- Create: `server-py/routes/search.py`
- Modify: `server-py/routes/torrents.py` (add torrent_url branch to POST handler)
- Modify: `server-py/main.py` (register search router)
- Modify: `server-py/tests/test_routes.py` (add 2 tests)

- [ ] **Step 1: Write failing tests**

Add to `server-py/tests/test_routes.py`:

```python
# Add these imports at the top of the existing test file
from unittest.mock import AsyncMock, patch

# Add these tests at the bottom of the file

def test_search_returns_results(client):
    mock_results = [
        {"type": "movie", "title": "Inception", "year": 2010,
         "poster": None, "quality": "1080p", "seeds": 500,
         "peers": 120, "size": "2.1 GB", "torrent_url": "https://yts.mx/t/abc.torrent"}
    ]
    with patch("routes.search.do_search", new=AsyncMock(return_value=mock_results)):
        resp = client.get("/api/search?q=inception")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Inception"


def test_search_empty_query_returns_empty(client):
    resp = client.get("/api/search?q=x")
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_torrent_from_url(client):
    torrent_bytes = b"d8:announce..."
    with patch("routes.torrents.engine") as mock_engine:
        mock_engine.handles = {}
        mock_engine.add_torrent_file.return_value = "abc123"
        mock_engine.get_status.return_value = {
            "hash": "abc123", "name": "Test", "size": 1000,
            "status": "downloading", "progress": 0.0,
            "download_speed": 0, "upload_speed": 0,
            "peers": 0, "eta": -1, "save_path": "/downloads",
        }
        with patch("routes.torrents.aiohttp") as mock_aiohttp:
            mock_resp = AsyncMock()
            mock_resp.read = AsyncMock(return_value=torrent_bytes)
            mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
            mock_resp.__aexit__ = AsyncMock(return_value=False)
            mock_session = AsyncMock()
            mock_session.get = MagicMock(return_value=mock_resp)
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_aiohttp.ClientSession.return_value = mock_session

            resp = client.post("/api/torrents",
                json={"torrent_url": "https://yts.mx/t/inception.torrent"})
    assert resp.status_code == 201
    assert resp.json()["id"] == "abc123"
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd server-py
pytest tests/test_routes.py::test_search_returns_results tests/test_routes.py::test_search_empty_query_returns_empty tests/test_routes.py::test_add_torrent_from_url -v
```
Expected: 3 FAIL (routes not created yet)

- [ ] **Step 3: Create routes/search.py**

```python
# server-py/routes/search.py
from fastapi import APIRouter
from search import search as do_search


def make_search_router() -> APIRouter:
    router = APIRouter()

    @router.get("")
    async def search_torrents(q: str = ""):
        if len(q) < 2:
            return []
        return await do_search(q)

    return router
```

- [ ] **Step 4: Add torrent_url branch to routes/torrents.py**

In `server-py/routes/torrents.py`, add `import aiohttp` at the top and add a new branch inside `add_torrent` before the existing magnet/file checks:

```python
# server-py/routes/torrents.py  — top of file, add:
import aiohttp

# Inside add_torrent(), before the existing content-type checks, add:
content_type = request.headers.get("content-type", "")
if "application/json" in content_type:
    body = await request.json()
    magnet = body.get("magnet")
    torrent_url = body.get("torrent_url")
    if torrent_url:
        async with aiohttp.ClientSession() as session:
            async with session.get(torrent_url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                torrent_bytes = await resp.read()
        hash_str = engine.add_torrent_file(torrent_bytes)
        s = engine.get_status(hash_str)
        if not s:
            raise HTTPException(500, "Torrent added but status unavailable")
        record = TorrentRecord(
            id=hash_str, name=s["name"] or hash_str, size=s["size"],
            status=s["status"], progress=s["progress"],
            download_dir=s["save_path"], magnet_uri=None,
            added_at=int(time.time() * 1000),
        )
        db.delete(hash_str)
        db.insert(record)
        await sio.emit("torrent:added", {"torrent": record.model_dump()})
        return Response(content=record.model_dump().__str__(), status_code=201,
                        media_type="application/json")
```

Wait — the existing handler already parses JSON for magnets. Let me show the complete updated `add_torrent` function to avoid ambiguity:

```python
# server-py/routes/torrents.py — complete add_torrent handler replacement
@router.post("", status_code=201)
async def add_torrent(request: Request):
    import json as json_mod
    content_type = request.headers.get("content-type", "")
    magnet: Optional[str] = None
    torrent_bytes: Optional[bytes] = None
    torrent_url: Optional[str] = None

    if "application/json" in content_type:
        body = await request.json()
        magnet = body.get("magnet")
        torrent_url = body.get("torrent_url")
    elif "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("torrent")
        if file:
            torrent_bytes = await file.read()
    else:
        raise HTTPException(400, "Unsupported content type")

    if torrent_url:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                torrent_url, timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                torrent_bytes = await resp.read()

    if magnet:
        m = re.search(r"btih:([a-fA-F0-9]{40})", magnet, re.I)
        if m and m.group(1).lower() in engine.handles:
            raise HTTPException(409, "Torrent already exists")
        hash_str = engine.add_magnet(magnet)
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, engine.wait_for_metadata, hash_str, 10)
    elif torrent_bytes:
        hash_str = engine.add_torrent_file(torrent_bytes)
    else:
        raise HTTPException(400, "Provide magnet, torrent file, or torrent_url")

    s = engine.get_status(hash_str)
    if not s:
        raise HTTPException(500, "Torrent added but status unavailable")
    record = TorrentRecord(
        id=hash_str, name=s["name"] or hash_str, size=s["size"],
        status=s["status"], progress=s["progress"],
        download_dir=s["save_path"], magnet_uri=magnet,
        added_at=int(time.time() * 1000),
    )
    db.delete(hash_str)
    db.insert(record)
    await sio.emit("torrent:added", {"torrent": record.model_dump()})
    return record.model_dump()
```

Also add `from typing import Optional` at the top if not present.

- [ ] **Step 5: Register search router in main.py**

```python
# server-py/main.py — add after existing router registrations:
from routes.search import make_search_router

fastapi_app.include_router(
    make_search_router(),
    prefix="/api/search",
)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd server-py
pytest tests/test_routes.py -v
```
Expected: all tests PASS (including the 3 new ones)

- [ ] **Step 7: Commit**

```bash
git add server-py/routes/search.py server-py/routes/torrents.py server-py/main.py server-py/tests/test_routes.py
git commit -m "feat: add /api/search route and torrent_url support in POST /api/torrents"
```

---

### Task 3: Frontend search API client + SearchBar

**Files:**
- Create: `client/src/api/search.ts`
- Create: `client/src/components/SearchBar.tsx`

- [ ] **Step 1: Create client/src/api/search.ts**

```typescript
// client/src/api/search.ts
const BASE = (import.meta.env.VITE_BASE_PATH ?? '') + '/api'

export interface SearchResult {
  type: 'movie' | 'series'
  title: string
  show?: string
  year?: number | string
  poster?: string
  quality?: string
  seeds: number
  peers: number
  size: string
  torrent_url?: string
  magnet_url?: string
}

export async function searchTorrents(q: string): Promise<SearchResult[]> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function addFromUrl(torrentUrl: string): Promise<void> {
  const res = await fetch(`${BASE}/torrents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ torrent_url: torrentUrl }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
}
```

- [ ] **Step 2: Create client/src/components/SearchBar.tsx**

```tsx
// client/src/components/SearchBar.tsx
import { useState, useRef } from 'react'

interface Props {
  onSearch: (q: string) => void
  loading: boolean
}

export function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    const q = value.trim()
    if (q.length >= 2) onSearch(q)
  }

  return (
    <div className="flex gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Buscar series y películas…"
        className="bg-surface0 text-text text-xs px-2 py-1 rounded border border-surface1 focus:outline-none focus:border-blue w-48 placeholder-overlay0"
      />
      <button
        onClick={submit}
        disabled={loading || value.trim().length < 2}
        className="text-xs px-2 py-1 rounded bg-surface0 border border-surface1 text-subtext0 hover:text-text disabled:opacity-40 transition-colors"
      >
        {loading ? '…' : '🔍'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add client/src/api/search.ts client/src/components/SearchBar.tsx
git commit -m "feat: add search API client and SearchBar component"
```

---

### Task 4: SearchResults modal

**Files:**
- Create: `client/src/components/SearchResults.tsx`

- [ ] **Step 1: Create client/src/components/SearchResults.tsx**

```tsx
// client/src/components/SearchResults.tsx
import type { SearchResult } from '../api/search'

interface Props {
  results: SearchResult[]
  query: string
  onAdd: (result: SearchResult) => void
  onClose: () => void
  adding: string | null   // torrent_url currently being added
  error: string | null
}

function SeedBadge({ seeds }: { seeds: number }) {
  const color = seeds > 100 ? 'text-green' : seeds > 20 ? 'text-yellow' : 'text-red'
  return <span className={`text-xs ${color}`}>▲ {seeds}</span>
}

export function SearchResults({ results, query, onAdd, onClose, adding, error }: Props) {
  const movies = results.filter(r => r.type === 'movie')
  const series = results.filter(r => r.type === 'series')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-crust/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-mantle border border-surface0 rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface0">
          <span className="text-text text-sm font-medium">
            Resultados para <span className="text-blue">"{query}"</span>
            <span className="text-overlay0 font-normal ml-2">({results.length})</span>
          </span>
          <button onClick={onClose} className="text-overlay0 hover:text-text text-xs px-1">✕</button>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 text-xs text-red bg-red/10 border-b border-surface0">{error}</div>
        )}

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {results.length === 0 && (
            <p className="text-overlay0 text-xs text-center py-10">No se encontraron resultados.</p>
          )}

          {movies.length > 0 && (
            <Section title="Películas" results={movies} onAdd={onAdd} adding={adding} />
          )}
          {series.length > 0 && (
            <Section title="Series" results={series} onAdd={onAdd} adding={adding} />
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, results, onAdd, adding }: {
  title: string
  results: SearchResult[]
  onAdd: (r: SearchResult) => void
  adding: string | null
}) {
  return (
    <div>
      <div className="px-4 py-1.5 bg-surface0/50 text-overlay0 text-xs font-medium sticky top-0">
        {title}
      </div>
      {results.map((r, i) => (
        <Row key={i} result={r} onAdd={onAdd} adding={adding} />
      ))}
    </div>
  )
}

function Row({ result: r, onAdd, adding }: {
  result: SearchResult
  onAdd: (r: SearchResult) => void
  adding: string | null
}) {
  const key = r.torrent_url ?? r.magnet_url ?? ''
  const isAdding = adding === key

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-surface0/40 hover:bg-surface0/30 transition-colors">
      {/* Poster */}
      <div className="w-8 h-12 flex-shrink-0 bg-surface0 rounded overflow-hidden">
        {r.poster
          ? <img src={r.poster} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-overlay0 text-lg">🎬</div>
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-text text-xs truncate leading-tight">{r.title}</p>
        <p className="text-overlay0 text-xs mt-0.5">
          {r.year && <span className="mr-2">{r.year}</span>}
          {r.quality && <span className="mr-2 text-blue">{r.quality}</span>}
          {r.size && <span className="mr-2">{r.size}</span>}
          <SeedBadge seeds={r.seeds} />
        </p>
      </div>

      {/* Add button */}
      <button
        onClick={() => onAdd(r)}
        disabled={isAdding}
        className="text-xs px-2 py-1 rounded bg-blue/20 text-blue hover:bg-blue/30 disabled:opacity-40 transition-colors flex-shrink-0"
      >
        {isAdding ? '…' : '+ Añadir'}
      </button>
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
git add client/src/components/SearchResults.tsx
git commit -m "feat: add SearchResults modal component"
```

---

### Task 5: Wire into App.tsx + deploy

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Read current App.tsx to find the toolbar section**

```bash
grep -n "Añadir torrent\|useState\|import" client/src/App.tsx | head -20
```

- [ ] **Step 2: Update App.tsx**

Add imports at the top:
```tsx
import { SearchBar } from './components/SearchBar'
import { SearchResults } from './components/SearchResults'
import { searchTorrents, addFromUrl, type SearchResult } from './api/search'
```

Add state (alongside existing useState calls):
```tsx
const [searchQuery, setSearchQuery] = useState('')
const [searchResults, setSearchResults] = useState<SearchResult[]>([])
const [searchOpen, setSearchOpen] = useState(false)
const [searchLoading, setSearchLoading] = useState(false)
const [adding, setAdding] = useState<string | null>(null)
```

Add handler functions (alongside existing handlers):
```tsx
const handleSearch = async (q: string) => {
  setSearchLoading(true)
  setSearchQuery(q)
  try {
    const results = await searchTorrents(q)
    setSearchResults(results)
    setSearchOpen(true)
  } catch (e) {
    setError((e as Error).message)
  } finally {
    setSearchLoading(false)
  }
}

const handleAddFromSearch = async (result: SearchResult) => {
  const key = result.torrent_url ?? result.magnet_url ?? ''
  if (!key) return
  setAdding(key)
  try {
    if (result.torrent_url) {
      await addFromUrl(result.torrent_url)
    } else if (result.magnet_url) {
      await api.addMagnet(result.magnet_url)
    }
    setSearchOpen(false)
  } catch (e) {
    setError((e as Error).message)
  } finally {
    setAdding(null)
  }
}
```

In the toolbar JSX, add `<SearchBar>` next to the existing "+ Añadir torrent" button:
```tsx
<SearchBar onSearch={handleSearch} loading={searchLoading} />
```

At the bottom of the JSX return (before closing tag), add the modal:
```tsx
{searchOpen && (
  <SearchResults
    results={searchResults}
    query={searchQuery}
    onAdd={handleAddFromSearch}
    onClose={() => setSearchOpen(false)}
    adding={adding}
    error={null}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Start dev server and test manually**

```bash
# Terminal 1 — backend
cd server-py && python main.py

# Terminal 2 — frontend
cd client && npm run dev
```

Open http://localhost:5173 and:
1. Click the search icon, type "inception", press Enter
2. Verify movies appear with poster and seeds
3. Click "+ Añadir" on one result
4. Verify it appears in the torrent list and starts downloading

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: integrate search bar and results modal into App"
```

---

### Task 6: Deploy to server

- [ ] **Step 1: Get OMDB API key**

Register at https://www.omdbapi.com/apikey.aspx (free tier, check email for key)

- [ ] **Step 2: Update PM2 config on server**

```bash
ssh oracle
nano /home/ubuntu/PROYECTOS/TorrentClient/server-py/ecosystem.config.js
# Add OMDB_API_KEY to env block
pm2 restart torrent-backend
```

- [ ] **Step 3: Upload new source and rebuild**

From local machine:
```powershell
git archive HEAD --format=tar -o $env:TEMP\torrent-deploy.tar
scp $env:TEMP\torrent-deploy.tar oracle:/home/ubuntu/PROYECTOS/TorrentClient/deploy.tar
```

On server:
```bash
ssh oracle
cd /home/ubuntu/PROYECTOS/TorrentClient
tar -xf deploy.tar && rm deploy.tar
cd client
VITE_BASE_PATH=/torrent npx vite build --base=/torrent/
sudo cp -r dist/. /var/www/projects/torrent/
```

- [ ] **Step 4: Restart backend and verify**

```bash
ssh oracle "pm2 restart torrent-backend && sleep 3 && curl -s 'http://localhost:3014/api/search?q=inception' | python3 -m json.tool | head -20"
```
Expected: JSON array with movie results

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: deploy torrent search feature to production"
```
