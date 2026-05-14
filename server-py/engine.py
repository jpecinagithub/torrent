import os
import re
import time
import libtorrent as lt
from typing import Optional

_PUBLIC_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.tiny-vps.com:6969/announce",
    "https://tracker.bt4g.com:443/announce",
]


def _get_hash(handle: lt.torrent_handle) -> str:
    ih = handle.info_hash()
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
        self.download_dir = os.path.abspath(download_dir)
        # Directory to persist .torrent files for restart recovery
        self._torrent_store = os.path.join(self.download_dir, ".torrents")
        os.makedirs(self._torrent_store, exist_ok=True)

        settings = {
            "listen_interfaces": "0.0.0.0:6881,[::]:6881",
            "alert_mask": lt.alert.category_t.all_categories,
            "enable_dht": True,
            "enable_lsd": True,
            "enable_upnp": True,
            "enable_natpmp": True,
            "dht_bootstrap_nodes": (
                "router.bittorrent.com:6881,"
                "router.utorrent.com:6881,"
                "dht.transmissionbt.com:6881,"
                "dht.aelitis.com:6881,"
                "dht.libtorrent.org:25401"
            ),
            "announce_to_all_trackers": True,
            "announce_to_all_tiers": True,
            "connection_speed": 100,
            "num_want": 200,
            "min_reconnect_time": 1,
            "peer_connect_timeout": 15,
            "active_downloads": -1,
            "active_seeds": -1,
            "active_limit": -1,
        }
        self.session = lt.session(settings)
        self.handles: dict[str, lt.torrent_handle] = {}
        self._magnet_names: dict[str, str] = {}

    def _map_lt_state(self, state: int, paused: bool) -> str:
        if paused:
            return "paused"
        if state in (lt.torrent_status.seeding, lt.torrent_status.finished):
            return "seeding"
        return "downloading"

    def _force_start(self, handle: lt.torrent_handle) -> None:
        handle.unset_flags(lt.torrent_flags.paused | lt.torrent_flags.auto_managed)
        handle.resume()

    def _clear_paused_flags(self, params: lt.add_torrent_params) -> None:
        try:
            params.flags &= ~(lt.torrent_flags.paused | lt.torrent_flags.auto_managed)
        except Exception:
            pass

    def add_magnet(self, magnet: str) -> str:
        params = lt.parse_magnet_uri(magnet)
        params.save_path = self.download_dir
        params.trackers = list(params.trackers) + _PUBLIC_TRACKERS
        self._clear_paused_flags(params)
        handle = self.session.add_torrent(params)
        handle.resume()
        hash_str = _get_hash(handle)
        self.handles[hash_str] = handle
        dn = re.search(r"[?&]dn=([^&]+)", magnet)
        self._magnet_names[hash_str] = dn.group(1).replace("+", " ") if dn else hash_str
        return hash_str

    def add_torrent_file(self, data: bytes) -> str:
        try:
            ti = lt.torrent_info(data)
        except Exception:
            ti = lt.torrent_info(lt.bdecode(data))
        params = lt.add_torrent_params()
        params.ti = ti
        params.save_path = self.download_dir
        params.trackers = _PUBLIC_TRACKERS[:]
        self._clear_paused_flags(params)
        handle = self.session.add_torrent(params)
        handle.resume()
        hash_str = _get_hash(handle)
        self.handles[hash_str] = handle
        # Persist .torrent file for restart recovery
        torrent_path = os.path.join(self._torrent_store, f"{hash_str}.torrent")
        with open(torrent_path, "wb") as f:
            f.write(data)
        return hash_str

    def load_torrent_file(self, hash_str: str) -> bool:
        """Reload a .torrent file from disk (used on startup)."""
        path = os.path.join(self._torrent_store, f"{hash_str}.torrent")
        if not os.path.exists(path):
            return False
        with open(path, "rb") as f:
            data = f.read()
        self.add_torrent_file(data)
        return True

    def wait_for_metadata(self, hash_str: str, timeout: int = 10) -> bool:
        handle = self.handles.get(hash_str)
        if not handle:
            return False
        deadline = time.time() + timeout
        while time.time() < deadline:
            if handle.status().has_metadata:
                return True
            time.sleep(0.3)
        return False

    def remove(self, hash_str: str, delete_files: bool = False) -> None:
        handle = self.handles.pop(hash_str, None)
        if handle and handle.is_valid():
            flags = _remove_flag() if delete_files else 0
            self.session.remove_torrent(handle, flags)
        # Remove persisted .torrent file
        torrent_path = os.path.join(self._torrent_store, f"{hash_str}.torrent")
        if os.path.exists(torrent_path):
            os.remove(torrent_path)

    def pause(self, hash_str: str) -> None:
        handle = self.handles.get(hash_str)
        if handle and handle.is_valid():
            handle.pause()

    def resume(self, hash_str: str) -> None:
        handle = self.handles.get(hash_str)
        if handle and handle.is_valid():
            self._force_start(handle)

    def set_speed_limits(self, dl_limit: int, ul_limit: int) -> None:
        self.session.apply_settings({
            "download_rate_limit": dl_limit,
            "upload_rate_limit": ul_limit,
        })

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
            "name": s.name or self._magnet_names.get(hash_str, hash_str),
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

    def destroy(self) -> None:
        self.handles.clear()
