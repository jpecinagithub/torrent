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
    engine.set_speed_limits(dl_limit=512 * 1024, ul_limit=256 * 1024)
    engine.set_speed_limits(dl_limit=0, ul_limit=0)
