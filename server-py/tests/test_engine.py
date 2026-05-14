import os
import pytest
import libtorrent as lt
from unittest.mock import MagicMock
from engine import TorrentEngine


# ── helpers for get_files / get_file_path tests (no real libtorrent session) ──

def _make_engine(handles: dict) -> TorrentEngine:
    """Instantiate TorrentEngine without __init__ to avoid starting a libtorrent session."""
    e = TorrentEngine.__new__(TorrentEngine)
    e.download_dir = "/downloads"
    e.handles = handles
    return e


def _mock_handle(file_paths: list, file_sizes: list, save_path: str = "/downloads"):
    mock_fs = MagicMock()
    mock_fs.num_files.return_value = len(file_paths)
    mock_fs.file_path.side_effect = list(file_paths)
    mock_fs.file_size.side_effect = list(file_sizes)

    mock_ti = MagicMock()
    mock_ti.files.return_value = mock_fs

    mock_status = MagicMock()
    mock_status.save_path = save_path

    handle = MagicMock()
    handle.is_valid.return_value = True
    handle.torrent_file.return_value = mock_ti
    handle.status.return_value = mock_status
    return handle


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
    engine.set_speed_limits(dl_limit=512 * 1024, ul_limit=256 * 1024)
    engine.set_speed_limits(dl_limit=0, ul_limit=0)


# ── get_files ──────────────────────────────────────────────────────────────────

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


# ── get_file_path ──────────────────────────────────────────────────────────────

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
