# Python libtorrent Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Node.js/qBittorrent proxy backend with a self-contained Python FastAPI + python-libtorrent server that exposes the identical REST + Socket.io API, leaving the React frontend (`client/`) completely unchanged.

**Architecture:** A new `server-py/` directory holds a FastAPI app with `python-socketio` mounted as ASGI middleware (so both HTTP and WebSocket traffic land on port 3000). A `TorrentEngine` class wraps the libtorrent C++ session; a background asyncio task polls handles every second and emits `torrent:progress` events. Torrent records are persisted to a JSON file so downloads survive server restarts.

**Tech Stack:** Python 3.11+, libtorrent ≥ 2.0, FastAPI 0.111+, uvicorn, python-socketio 5.x, pydantic 2.x, pytest, httpx

---

## File structure

```
server-py/
  requirements.txt         # all Python deps
  main.py                  # FastAPI + socketio app, startup/shutdown, uvicorn entry
  engine.py                # TorrentEngine: wraps libtorrent session
  models.py                # Pydantic: TorrentRecord, ProgressPayload
  db.py                    # JSON persistence (restart recovery)
  routes/
    __init__.py
    torrents.py            # /api/torrents CRUD
    settings.py            # /api/settings/speed
  tests/
    __init__.py
    test_models.py
    test_engine.py
    test_routes.py
```

---

## API contract (must match exactly — the frontend is frozen)

### REST
| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/torrents` | — | `TorrentRecord[]` |
| POST | `/api/torrents` | JSON `{magnet}` **or** multipart `torrent` (file) | `TorrentRecord` 201 |
| DELETE | `/api/torrents/:hash?deleteFiles=bool` | — | 204 |
| PATCH | `/api/torrents/:hash/pause` | — | `{status:"paused"}` |
| PATCH | `/api/torrents/:hash/resume` | — | `{status:"downloading"}` |
| PATCH | `/api/settings/speed` | JSON `{downloadLimit, uploadLimit}` | same |

### Socket.io events (server → client)
- `torrent:progress` → `{hash, progress, downloadSpeed, uploadSpeed, peers, eta}`
- `torrent:added`   → `{torrent: TorrentRecord}`
- `torrent:removed` → `{hash}`
- `torrent:status`  → `{hash, status}`
- `torrent:error`   → `{hash, message}`

### TorrentRecord shape
```json
{
  "id": "<40-char hex info-hash>",
  "name": "file.mkv",
  "size": 591045438,
  "status": "downloading",
  "progress": 0.06,
  "download_dir": "C:\\Users\\HP\\Downloads",
  "magnet_uri": "magnet:?xt=...",
  "added_at": 1778682308000
}
```

---

## Task 1: Setup Python environment

**Files:**
- Create: `server-py/requirements.txt`

- [ ] **Step 1: Verify Python version**

```powershell
python --version
```
Expected: `Python 3.11.x` or higher. If not installed, download from python.org.

- [ ] **Step 2: Create `server-py/requirements.txt`**

```
libtorrent>=2.0
fastapi>=0.111
uvicorn[standard]>=0.30
python-socketio>=5.11
python-multipart>=0.0.9
pydantic>=2.7
pytest>=8.0
httpx>=0.27
```

- [ ] **Step 3: Install dependencies**

```powershell
cd server-py
python -m pip install -r requirements.txt
```

- [ ] **Step 4: Verify libtorrent import**

```powershell
python -c "import libtorrent as lt; print(lt.__version__)"
```
Expected: prints a version like `2.0.10`. If this fails with "No module named libtorrent", try `pip install libtorrent` directly; on Windows x64 there are pre-built wheels for Python 3.11/3.12.

- [ ] **Step 5: Create empty `__init__.py` files**

```powershell
New-Item -ItemType Directory routes, tests -Force
New-Item routes\__init__.py, tests\__init__.py -ItemType File -Force
```

- [ ] **Step 6: Commit**

```powershell
git add server-py/
git commit -m "chore: scaffold server-py with requirements"
```

---

## Task 2: Pydantic models

**Files:**
- Create: `server-py/models.py`
- Test: `server-py/tests/test_models.py`

- [ ] **Step 1: Write the failing test**

`server-py/tests/test_models.py`:
```python
from models import TorrentRecord, ProgressPayload


def test_torrent_record_fields():
    r = TorrentRecord(
        id="abc123",
        name="file.mkv",
        size=1_000_000,
        status="downloading",
        progress=0.5,
        download_dir="/downloads",
        magnet_uri="magnet:?xt=urn:btih:abc123",
        added_at=1_700_000_000_000,
    )
    assert r.id == "abc123"
    assert r.status == "downloading"
    assert r.magnet_uri == "magnet:?xt=urn:btih:abc123"


def test_torrent_record_null_magnet():
    r = TorrentRecord(
        id="abc123",
        name="file.mkv",
        size=0,
        status="paused",
        progress=0.0,
        download_dir="/downloads",
        magnet_uri=None,
        added_at=0,
    )
    assert r.magnet_uri is None


def test_progress_payload_fields():
    p = ProgressPayload(
        hash="abc123",
        progress=0.75,
        downloadSpeed=1_000_000,
        uploadSpeed=0,
        peers=12,
        eta=60,
    )
    assert p.eta == 60
    assert p.downloadSpeed == 1_000_000
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
cd server-py
python -m pytest tests/test_models.py -v
```
Expected: `ModuleNotFoundError: No module named 'models'`

- [ ] **Step 3: Write `server-py/models.py`**

```python
from typing import Literal, Optional
from pydantic import BaseModel

TorrentStatus = Literal["downloading", "seeding", "paused", "completed"]


class TorrentRecord(BaseModel):
    id: str
    name: str
    size: int
    status: TorrentStatus
    progress: float
    download_dir: str
    magnet_uri: Optional[str]
    added_at: int  # unix ms


class ProgressPayload(BaseModel):
    hash: str
    progress: float
    downloadSpeed: int
    uploadSpeed: int
    peers: int
    eta: int  # seconds, -1 if unknown
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
python -m pytest tests/test_models.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```powershell
git add server-py/models.py server-py/tests/test_models.py
git commit -m "feat(server-py): pydantic models"
```

---

## Task 3: JSON persistence

**Files:**
- Create: `server-py/db.py`
- Test: `server-py/tests/test_db.py`

- [ ] **Step 1: Write the failing test**

`server-py/tests/test_db.py`:
```python
import os
import tempfile
import pytest
from models import TorrentRecord
from db import TorrentDb


@pytest.fixture
def tmp_db():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        path = f.name
    db = TorrentDb(path)
    yield db
    os.unlink(path)


def _make_record(id="abc") -> TorrentRecord:
    return TorrentRecord(
        id=id, name="file.mkv", size=100, status="downloading",
        progress=0.0, download_dir="/dl", magnet_uri=None, added_at=0,
    )


def test_insert_and_list(tmp_db):
    tmp_db.insert(_make_record("a"))
    tmp_db.insert(_make_record("b"))
    ids = [r.id for r in tmp_db.list_all()]
    assert "a" in ids and "b" in ids


def test_get(tmp_db):
    tmp_db.insert(_make_record("x"))
    assert tmp_db.get("x") is not None
    assert tmp_db.get("missing") is None


def test_delete(tmp_db):
    tmp_db.insert(_make_record("del"))
    tmp_db.delete("del")
    assert tmp_db.get("del") is None


def test_duplicate_raises(tmp_db):
    tmp_db.insert(_make_record("dup"))
    with pytest.raises(ValueError, match="duplicate"):
        tmp_db.insert(_make_record("dup"))


def test_persists_across_instances(tmp_db):
    tmp_db.insert(_make_record("persist"))
    path = tmp_db.path
    db2 = TorrentDb(path)
    assert db2.get("persist") is not None
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
python -m pytest tests/test_db.py -v
```
Expected: `ModuleNotFoundError: No module named 'db'`

- [ ] **Step 3: Write `server-py/db.py`**

```python
import json
import os
from typing import Optional
from models import TorrentRecord


class TorrentDb:
    def __init__(self, path: str):
        self.path = path
        self._data: dict[str, dict] = {}
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                try:
                    self._data = json.load(f)
                except json.JSONDecodeError:
                    self._data = {}

    def _save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self._data, f)

    def insert(self, record: TorrentRecord) -> None:
        if record.id in self._data:
            raise ValueError(f"duplicate torrent {record.id}")
        self._data[record.id] = record.model_dump()
        self._save()

    def get(self, id: str) -> Optional[TorrentRecord]:
        raw = self._data.get(id)
        return TorrentRecord(**raw) if raw else None

    def delete(self, id: str) -> None:
        self._data.pop(id, None)
        self._save()

    def list_all(self) -> list[TorrentRecord]:
        return [TorrentRecord(**v) for v in self._data.values()]
```

- [ ] **Step 4: Run tests**

```powershell
python -m pytest tests/test_db.py -v
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```powershell
git add server-py/db.py server-py/tests/test_db.py
git commit -m "feat(server-py): JSON persistence layer"
```

---

## Task 4: Torrent engine

**Files:**
- Create: `server-py/engine.py`
- Test: `server-py/tests/test_engine.py`

- [ ] **Step 1: Write the failing test**

`server-py/tests/test_engine.py`:
```python
import pytest
import libtorrent as lt
from engine import TorrentEngine


@pytest.fixture
def engine(tmp_path):
    e = TorrentEngine(str(tmp_path))
    yield e
    e.destroy()


def test_engine_starts_empty(engine):
    assert engine.list_all() == []


def test_map_status_downloading(engine):
    assert engine._map_lt_state(lt.torrent_status.downloading, paused=False) == "downloading"


def test_map_status_seeding(engine):
    assert engine._map_lt_state(lt.torrent_status.seeding, paused=False) == "seeding"


def test_map_status_paused(engine):
    assert engine._map_lt_state(lt.torrent_status.downloading, paused=True) == "paused"


def test_map_status_finished(engine):
    assert engine._map_lt_state(lt.torrent_status.finished, paused=False) == "seeding"


def test_get_status_unknown_hash(engine):
    assert engine.get_status("deadbeef") is None


def test_set_speed_limits(engine):
    # Should not raise
    engine.set_speed_limits(dl_limit=512 * 1024, ul_limit=256 * 1024)
    engine.set_speed_limits(dl_limit=0, ul_limit=0)
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
python -m pytest tests/test_engine.py -v
```
Expected: `ModuleNotFoundError: No module named 'engine'`

- [ ] **Step 3: Write `server-py/engine.py`**

```python
import time
import libtorrent as lt
from typing import Optional


def _get_hash(handle: lt.torrent_handle) -> str:
    ih = handle.info_hash()
    # libtorrent 2.x returns info_hash_t with .v1; 1.x returns sha1_hash directly
    if hasattr(ih, "v1"):
        return str(ih.v1)
    return str(ih)


def _remove_flag() -> int:
    try:
        return int(lt.remove_flags_t.delete_files)
    except AttributeError:
        return int(lt.session.delete_files)


class TorrentEngine:
    def __init__(self, download_dir: str):
        settings = {
            "listen_interfaces": "0.0.0.0:6881",
            "alert_mask": lt.alert.category_t.all_categories,
        }
        self.session = lt.session(settings)
        self.handles: dict[str, lt.torrent_handle] = {}
        self.download_dir = download_dir

    def _map_lt_state(self, state: int, paused: bool) -> str:
        if paused:
            return "paused"
        if state in (lt.torrent_status.seeding, lt.torrent_status.finished):
            return "seeding"
        return "downloading"

    def add_magnet(self, magnet: str) -> str:
        """Add magnet URI. Returns info hash immediately (before metadata arrives)."""
        params = lt.parse_magnet_uri(magnet)
        params.save_path = self.download_dir
        handle = self.session.add_torrent(params)
        hash_str = _get_hash(handle)
        self.handles[hash_str] = handle
        return hash_str

    def add_torrent_file(self, data: bytes) -> str:
        """Add raw .torrent bytes. Returns info hash."""
        try:
            ti = lt.torrent_info(data)
        except Exception:
            ti = lt.torrent_info(lt.bdecode(data))
        params = lt.add_torrent_params()
        params.ti = ti
        params.save_path = self.download_dir
        handle = self.session.add_torrent(params)
        hash_str = _get_hash(handle)
        self.handles[hash_str] = handle
        return hash_str

    def wait_for_metadata(self, hash_str: str, timeout: int = 30) -> bool:
        """Block until metadata is available. Returns True on success."""
        handle = self.handles.get(hash_str)
        if not handle:
            return False
        deadline = time.time() + timeout
        while time.time() < deadline:
            if handle.status().has_metadata:
                return True
            time.sleep(0.5)
        return False

    def remove(self, hash_str: str, delete_files: bool = False) -> None:
        handle = self.handles.pop(hash_str, None)
        if handle and handle.is_valid():
            flags = _remove_flag() if delete_files else 0
            self.session.remove_torrent(handle, flags)

    def pause(self, hash_str: str) -> None:
        handle = self.handles.get(hash_str)
        if handle and handle.is_valid():
            handle.pause()

    def resume(self, hash_str: str) -> None:
        handle = self.handles.get(hash_str)
        if handle and handle.is_valid():
            handle.resume()

    def set_speed_limits(self, dl_limit: int, ul_limit: int) -> None:
        self.session.set_download_rate_limit(dl_limit)
        self.session.set_upload_rate_limit(ul_limit)

    def get_status(self, hash_str: str) -> Optional[dict]:
        handle = self.handles.get(hash_str)
        if not handle or not handle.is_valid():
            return None
        s = handle.status()
        eta = -1
        if s.download_rate > 0 and s.total_wanted > 0:
            remaining = s.total_wanted - s.total_wanted_done
            eta = int(remaining / s.download_rate)
        return {
            "hash": hash_str,
            "name": s.name,
            "size": s.total_wanted,
            "progress": s.progress,
            "status": self._map_lt_state(s.state, s.paused),
            "download_speed": s.download_rate,
            "upload_speed": s.upload_rate,
            "peers": s.num_peers,
            "eta": eta,
            "save_path": s.save_path,
        }

    def list_all(self) -> list[dict]:
        result = []
        for h in list(self.handles):
            s = self.get_status(h)
            if s:
                result.append(s)
        return result

    def destroy(self) -> None:
        self.handles.clear()
```

- [ ] **Step 4: Run tests**

```powershell
python -m pytest tests/test_engine.py -v
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```powershell
git add server-py/engine.py server-py/tests/test_engine.py
git commit -m "feat(server-py): TorrentEngine wrapping libtorrent session"
```

---

## Task 5: Torrents routes

**Files:**
- Create: `server-py/routes/torrents.py`
- Test: `server-py/tests/test_routes.py`

- [ ] **Step 1: Write the failing test**

`server-py/tests/test_routes.py`:
```python
import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, AsyncMock

from routes.torrents import make_torrents_router


RECORD = {
    "id": "abc123def456abc123def456abc123def456abc1",
    "name": "movie.mkv",
    "size": 1_000_000,
    "status": "downloading",
    "progress": 0.5,
    "download_dir": "C:\\Downloads",
    "magnet_uri": "magnet:?xt=urn:btih:abc123def456abc123def456abc123def456abc1",
    "added_at": 1_700_000_000_000,
}


@pytest.fixture
def mock_engine():
    e = MagicMock()
    e.handles = {"abc123def456abc123def456abc123def456abc1": MagicMock()}
    e.list_all.return_value = [dict(RECORD, download_speed=1000, upload_speed=0, peers=5, eta=100, save_path="C:\\Downloads")]
    e.add_magnet.return_value = RECORD["id"]
    e.wait_for_metadata.return_value = True
    e.get_status.return_value = dict(RECORD, download_speed=1000, upload_speed=0, peers=5, eta=100, save_path="C:\\Downloads")
    return e


@pytest.fixture
def mock_db():
    db = MagicMock()
    db.get.return_value = None  # not duplicate by default
    return db


@pytest.fixture
def mock_sio():
    sio = MagicMock()
    sio.emit = AsyncMock()
    return sio


@pytest.fixture
def client(mock_engine, mock_db, mock_sio):
    app = FastAPI()
    app.include_router(make_torrents_router(mock_engine, mock_db, mock_sio), prefix="/api/torrents")
    return TestClient(app, raise_server_exceptions=False)


def test_list_torrents(client):
    res = client.get("/api/torrents")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert data[0]["id"] == RECORD["id"]


def test_add_magnet(client, mock_engine, mock_db):
    res = client.post(
        "/api/torrents",
        json={"magnet": RECORD["magnet_uri"]},
    )
    assert res.status_code == 201
    assert res.json()["id"] == RECORD["id"]
    mock_engine.add_magnet.assert_called_once()


def test_add_magnet_duplicate(client, mock_db):
    from models import TorrentRecord
    mock_db.get.return_value = TorrentRecord(**RECORD)
    res = client.post("/api/torrents", json={"magnet": RECORD["magnet_uri"]})
    assert res.status_code == 409


def test_delete_torrent(client, mock_engine):
    res = client.delete(f"/api/torrents/{RECORD['id']}")
    assert res.status_code == 204
    mock_engine.remove.assert_called_once_with(RECORD["id"], False)


def test_delete_with_files(client, mock_engine):
    res = client.delete(f"/api/torrents/{RECORD['id']}?deleteFiles=true")
    assert res.status_code == 204
    mock_engine.remove.assert_called_once_with(RECORD["id"], True)


def test_pause_torrent(client, mock_engine):
    res = client.patch(f"/api/torrents/{RECORD['id']}/pause")
    assert res.status_code == 200
    assert res.json()["status"] == "paused"
    mock_engine.pause.assert_called_once_with(RECORD["id"])


def test_resume_torrent(client, mock_engine):
    res = client.patch(f"/api/torrents/{RECORD['id']}/resume")
    assert res.status_code == 200
    assert res.json()["status"] == "downloading"
    mock_engine.resume.assert_called_once_with(RECORD["id"])


def test_add_missing_body(client):
    res = client.post("/api/torrents", json={})
    assert res.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
python -m pytest tests/test_routes.py -v
```
Expected: `ModuleNotFoundError: No module named 'routes.torrents'`

- [ ] **Step 3: Write `server-py/routes/torrents.py`**

```python
import time
from typing import Optional
from fastapi import APIRouter, Request, HTTPException
from models import TorrentRecord


def make_torrents_router(engine, db, sio):
    router = APIRouter()

    def _engine_status_to_record(s: dict) -> TorrentRecord:
        return TorrentRecord(
            id=s["hash"],
            name=s["name"] or s["hash"],
            size=s["size"],
            status=s["status"],
            progress=s["progress"],
            download_dir=s["save_path"],
            magnet_uri=None,
            added_at=int(time.time() * 1000),
        )

    @router.get("")
    async def list_torrents():
        records = []
        for s in engine.list_all():
            r = db.get(s["hash"])
            record = TorrentRecord(
                id=s["hash"],
                name=s["name"] or s["hash"],
                size=s["size"],
                status=s["status"],
                progress=s["progress"],
                download_dir=s["save_path"],
                magnet_uri=r.magnet_uri if r else None,
                added_at=r.added_at if r else int(time.time() * 1000),
            )
            records.append(record.model_dump())
        return records

    @router.post("")
    async def add_torrent(request: Request):
        content_type = request.headers.get("content-type", "")

        magnet: Optional[str] = None
        torrent_bytes: Optional[bytes] = None

        if "application/json" in content_type:
            body = await request.json()
            magnet = body.get("magnet")
        elif "multipart/form-data" in content_type:
            form = await request.form()
            file_field = form.get("torrent")
            if file_field:
                torrent_bytes = await file_field.read()
        
        if not magnet and not torrent_bytes:
            raise HTTPException(400, "Provide a magnet URI or .torrent file")

        if magnet:
            # Check duplicate by hash extracted from magnet URI
            import re
            m = re.search(r"btih:([a-fA-F0-9]{40})", magnet, re.I)
            if m:
                existing_hash = m.group(1).lower()
                if db.get(existing_hash):
                    raise HTTPException(409, "Torrent already exists")

            hash_str = engine.add_magnet(magnet)
            if db.get(hash_str):
                raise HTTPException(409, "Torrent already exists")
            engine.wait_for_metadata(hash_str, timeout=30)
        else:
            hash_str = engine.add_torrent_file(torrent_bytes)
            if db.get(hash_str):
                raise HTTPException(409, "Torrent already exists")

        s = engine.get_status(hash_str)
        if not s:
            raise HTTPException(500, "Torrent added but status unavailable")

        record = TorrentRecord(
            id=hash_str,
            name=s["name"] or hash_str,
            size=s["size"],
            status=s["status"],
            progress=s["progress"],
            download_dir=s["save_path"],
            magnet_uri=magnet,
            added_at=int(time.time() * 1000),
        )
        try:
            db.insert(record)
        except ValueError:
            raise HTTPException(409, "Torrent already exists")

        await sio.emit("torrent:added", {"torrent": record.model_dump()})
        return record.model_dump(), 201

    @router.delete("/{hash_str}")
    async def delete_torrent(hash_str: str, deleteFiles: bool = False):
        engine.remove(hash_str, deleteFiles)
        db.delete(hash_str)
        await sio.emit("torrent:removed", {"hash": hash_str})
        return None, 204

    @router.patch("/{hash_str}/pause")
    async def pause_torrent(hash_str: str):
        engine.pause(hash_str)
        await sio.emit("torrent:status", {"hash": hash_str, "status": "paused"})
        return {"status": "paused"}

    @router.patch("/{hash_str}/resume")
    async def resume_torrent(hash_str: str):
        engine.resume(hash_str)
        await sio.emit("torrent:status", {"hash": hash_str, "status": "downloading"})
        return {"status": "downloading"}

    return router
```

- [ ] **Step 4: Run tests**

```powershell
python -m pytest tests/test_routes.py -v
```
Expected: 9 passed.

> **Note on return codes:** FastAPI doesn't support returning `(body, status_code)` tuples from plain functions. The POST and DELETE routes above need `Response` objects. Fix before running — see Step 5 below which corrects this.

- [ ] **Step 5: Fix response status codes in `routes/torrents.py`**

Replace the `add_torrent` and `delete_torrent` functions with:

```python
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import JSONResponse

    @router.post("", status_code=201)
    async def add_torrent(request: Request):
        # ... (same body as above, but remove the ", 201" from the return)
        return record.model_dump()

    @router.delete("/{hash_str}", status_code=204)
    async def delete_torrent(hash_str: str, deleteFiles: bool = False):
        engine.remove(hash_str, deleteFiles)
        db.delete(hash_str)
        await sio.emit("torrent:removed", {"hash": hash_str})
        return Response(status_code=204)
```

- [ ] **Step 6: Run tests again**

```powershell
python -m pytest tests/test_routes.py -v
```
Expected: 9 passed.

- [ ] **Step 7: Commit**

```powershell
git add server-py/routes/torrents.py server-py/tests/test_routes.py
git commit -m "feat(server-py): torrents REST routes"
```

---

## Task 6: Settings route

**Files:**
- Create: `server-py/routes/settings.py`
- Test: add to `server-py/tests/test_routes.py`

- [ ] **Step 1: Add failing tests to `test_routes.py`**

Append to `server-py/tests/test_routes.py`:
```python
from routes.settings import make_settings_router


@pytest.fixture
def settings_client(mock_engine):
    app = FastAPI()
    app.include_router(make_settings_router(mock_engine), prefix="/api/settings")
    return TestClient(app)


def test_set_speed_limits(settings_client, mock_engine):
    res = settings_client.patch(
        "/api/settings/speed",
        json={"downloadLimit": 1_048_576, "uploadLimit": 524_288},
    )
    assert res.status_code == 200
    assert res.json()["downloadLimit"] == 1_048_576
    mock_engine.set_speed_limits.assert_called_once_with(
        dl_limit=1_048_576, ul_limit=524_288
    )


def test_set_speed_limits_bad_body(settings_client):
    res = settings_client.patch("/api/settings/speed", json={"bad": "data"})
    assert res.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
python -m pytest tests/test_routes.py::test_set_speed_limits tests/test_routes.py::test_set_speed_limits_bad_body -v
```
Expected: `ModuleNotFoundError: No module named 'routes.settings'`

- [ ] **Step 3: Write `server-py/routes/settings.py`**

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


class SpeedSettings(BaseModel):
    downloadLimit: int
    uploadLimit: int


def make_settings_router(engine):
    router = APIRouter()

    @router.patch("/speed")
    async def set_speed(body: SpeedSettings):
        if not isinstance(body.downloadLimit, int) or not isinstance(body.uploadLimit, int):
            raise HTTPException(400, "downloadLimit and uploadLimit must be numbers")
        engine.set_speed_limits(dl_limit=body.downloadLimit, ul_limit=body.uploadLimit)
        return {"downloadLimit": body.downloadLimit, "uploadLimit": body.uploadLimit}

    return router
```

- [ ] **Step 4: Run all route tests**

```powershell
python -m pytest tests/test_routes.py -v
```
Expected: 11 passed.

- [ ] **Step 5: Commit**

```powershell
git add server-py/routes/settings.py server-py/tests/test_routes.py
git commit -m "feat(server-py): settings speed-limit route"
```

---

## Task 7: Main app + Socket.io + startup

**Files:**
- Create: `server-py/main.py`

No automated tests for this task — verified manually by running the full stack.

- [ ] **Step 1: Write `server-py/main.py`**

```python
import asyncio
import os
import socketio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from engine import TorrentEngine
from db import TorrentDb
from routes.torrents import make_torrents_router
from routes.settings import make_settings_router

DOWNLOAD_DIR = os.environ.get("DOWNLOAD_DIR", "../downloads")
DB_PATH = os.environ.get("DB_PATH", "torrents.json")
PORT = int(os.environ.get("PORT", "3000"))

# Socket.io server (async ASGI mode)
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

fastapi_app = FastAPI()
fastapi_app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Combined ASGI app: socketio handles /socket.io/*, fastapi handles the rest
app = socketio.ASGIApp(sio, fastapi_app)

engine = TorrentEngine(DOWNLOAD_DIR)
db = TorrentDb(DB_PATH)

fastapi_app.include_router(
    make_torrents_router(engine, db, sio),
    prefix="/api/torrents",
)
fastapi_app.include_router(
    make_settings_router(engine),
    prefix="/api/settings",
)


@fastapi_app.on_event("startup")
async def startup():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    # Re-add persisted torrents to libtorrent
    for record in db.list_all():
        if record.magnet_uri:
            try:
                engine.add_magnet(record.magnet_uri)
                if record.status == "paused":
                    engine.pause(record.id)
            except Exception as exc:
                print(f"[Startup] Could not reload {record.id}: {exc}")
    print(f"[Startup] Reloaded {len(db.list_all())} torrents")
    asyncio.create_task(_progress_loop())


async def _progress_loop():
    """Emit torrent:progress every second for all active handles."""
    while True:
        await asyncio.sleep(1)
        for hash_str in list(engine.handles.keys()):
            try:
                s = engine.get_status(hash_str)
                if s:
                    await sio.emit("torrent:progress", {
                        "hash": s["hash"],
                        "progress": s["progress"],
                        "downloadSpeed": s["download_speed"],
                        "uploadSpeed": s["upload_speed"],
                        "peers": s["peers"],
                        "eta": s["eta"],
                    })
            except Exception:
                pass


@sio.event
def connect(sid, environ):
    print(f"[Socket.io] client connected: {sid}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
```

- [ ] **Step 2: Run the server**

```powershell
cd server-py
python main.py
```
Expected output:
```
[Startup] Reloaded 0 torrents
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:3000
```

If port 3000 is busy (Node server still running), kill it first:
```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

- [ ] **Step 3: Verify the API responds**

In a new terminal:
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/torrents" | Select-Object -ExpandProperty Content
```
Expected: `[]`

- [ ] **Step 4: Start the Vite dev client (if not already running)**

```powershell
cd ..\client
npm run dev
```

Open `http://localhost:5173` (or `5174` if that port was taken).

- [ ] **Step 5: Add a magnet link via the UI**

Use any publicly available test magnet (e.g. from a public tracker). The torrent should appear in the table, progress should update live.

- [ ] **Step 6: Test pause and resume**

Click the pause button in the UI. Status should change to "Paused". Click resume — should go back to "Downloading".

- [ ] **Step 7: Commit**

```powershell
git add server-py/main.py
git commit -m "feat(server-py): FastAPI + socketio main app with startup and progress loop"
```

---

## Task 8: Run full test suite

- [ ] **Step 1: Run all tests**

```powershell
cd server-py
python -m pytest tests/ -v
```
Expected: all tests pass (at minimum: 3 + 5 + 7 + 11 = 26 tests).

- [ ] **Step 2: Final commit**

```powershell
git add .
git commit -m "feat: Python libtorrent backend complete — replaces Node.js server"
```

---

## Notes for the Windows environment

- Run all commands from within the `server-py/` directory (or prefix paths accordingly).
- `python` and `pip` refer to the same Python 3.11+ installation. Use `py -3.11` if multiple versions are installed.
- libtorrent listens on port 6881 by default. Windows Firewall may prompt — allow it.
- The Vite proxy in `client/vite.config.ts` already forwards `/api` and `/socket.io` to `localhost:3000`. No changes needed in the frontend.
- To stop the Python server: `Ctrl+C` in the terminal running `python main.py`.
