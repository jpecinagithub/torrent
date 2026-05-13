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
