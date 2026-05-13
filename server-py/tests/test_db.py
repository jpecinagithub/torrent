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
