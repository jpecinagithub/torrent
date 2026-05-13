import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, AsyncMock, patch

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
    e.handles = {}  # empty — no active torrents yet
    e.list_all.return_value = [dict(RECORD, hash=RECORD["id"], download_speed=1000, upload_speed=0, peers=5, eta=100, save_path="C:\\Downloads")]
    e.add_magnet.return_value = RECORD["id"]
    e.wait_for_metadata.return_value = True
    e.get_status.return_value = dict(RECORD, hash=RECORD["id"], download_speed=1000, upload_speed=0, peers=5, eta=100, save_path="C:\\Downloads")
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


def test_add_magnet_duplicate(mock_engine, mock_db, mock_sio):
    # Seed engine with existing handle so duplicate check fires
    mock_engine.handles = {RECORD["id"]: MagicMock()}
    app = FastAPI()
    app.include_router(make_torrents_router(mock_engine, mock_db, mock_sio), prefix="/api/torrents")
    c = TestClient(app, raise_server_exceptions=False)
    res = c.post("/api/torrents", json={"magnet": RECORD["magnet_uri"]})
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


from routes.settings import make_settings_router
from routes.search import make_search_router


@pytest.fixture
def search_client():
    app = FastAPI()
    app.include_router(make_search_router(), prefix="/api/search")
    return TestClient(app, raise_server_exceptions=False)


def test_search_returns_results(search_client):
    mock_results = [
        {"type": "movie", "title": "Inception", "year": 2010,
         "poster": None, "quality": "1080p", "seeds": 500,
         "peers": 120, "size": "2.1 GB", "torrent_url": "https://yts.mx/t/abc.torrent"}
    ]
    with patch("routes.search.do_search", new=AsyncMock(return_value=mock_results)):
        resp = search_client.get("/api/search?q=inception")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Inception"


def test_search_short_query_returns_empty(search_client):
    resp = search_client.get("/api/search?q=x")
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_torrent_from_url(client, mock_engine):
    torrent_bytes = b"d8:announce3:urlel"
    mock_engine.add_torrent_file.return_value = "abc123"
    mock_resp = AsyncMock()
    mock_resp.read = AsyncMock(return_value=torrent_bytes)
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)
    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_resp)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    with patch("routes.torrents.aiohttp") as mock_aiohttp:
        mock_aiohttp.ClientSession.return_value = mock_session
        mock_aiohttp.ClientTimeout = __import__("aiohttp").ClientTimeout
        resp = client.post("/api/torrents",
            json={"torrent_url": "https://yts.mx/t/inception.torrent"})
    assert resp.status_code == 201
    assert resp.json()["id"] == "abc123"


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
    assert res.status_code == 422  # FastAPI Pydantic validation error
