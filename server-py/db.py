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
