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
