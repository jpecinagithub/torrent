import asyncio
import os
import re
import time
from typing import Optional
import aiohttp
from fastapi import APIRouter, Request, HTTPException, Response
from fastapi.responses import FileResponse
from models import TorrentRecord


def make_torrents_router(engine, db, sio):
    router = APIRouter()

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

    @router.post("", status_code=201)
    async def add_torrent(request: Request):
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
            file_field = form.get("torrent")
            if file_field:
                torrent_bytes = await file_field.read()

        if torrent_url:
            async with aiohttp.ClientSession() as session:
                async with session.get(torrent_url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    torrent_bytes = await resp.read()

        if not magnet and not torrent_bytes:
            raise HTTPException(400, "Provide a magnet URI, .torrent file, or torrent_url")

        # Duplicate = already active in the engine right now
        if magnet:
            m = re.search(r"btih:([a-fA-F0-9]{40})", magnet, re.I)
            if m and m.group(1).lower() in engine.handles:
                raise HTTPException(409, "Torrent already exists")
            hash_str = engine.add_magnet(magnet)
            # Run blocking metadata wait in thread pool so event loop stays free
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, engine.wait_for_metadata, hash_str, 10)
        else:
            hash_str = engine.add_torrent_file(torrent_bytes)

        s = engine.get_status(hash_str)
        if not s:
            raise HTTPException(500, "Torrent added but status unavailable")

        added_at = int(time.time() * 1000)
        record = TorrentRecord(
            id=hash_str,
            name=s["name"] or hash_str,
            size=s["size"],
            status=s["status"],
            progress=s["progress"],
            download_dir=s["save_path"],
            magnet_uri=magnet,
            added_at=added_at,
        )
        # Upsert: replace stale DB entry if present (handles server-restart re-add)
        db.delete(hash_str)
        db.insert(record)

        await sio.emit("torrent:added", {"torrent": record.model_dump()})
        return record.model_dump()

    @router.delete("/{hash_str}", status_code=204)
    async def delete_torrent(hash_str: str, deleteFiles: bool = False):
        engine.remove(hash_str, deleteFiles)
        db.delete(hash_str)
        await sio.emit("torrent:removed", {"hash": hash_str})
        return Response(status_code=204)

    @router.patch("/{hash_str}/pause")
    async def pause_torrent(hash_str: str):
        engine.pause(hash_str)
        record = db.get(hash_str)
        if record:
            record.status = "paused"
            db.delete(hash_str)
            db.insert(record)
        await sio.emit("torrent:status", {"hash": hash_str, "status": "paused"})
        return {"status": "paused"}

    @router.patch("/{hash_str}/resume")
    async def resume_torrent(hash_str: str):
        engine.resume(hash_str)
        record = db.get(hash_str)
        if record:
            record.status = "downloading"
            db.delete(hash_str)
            db.insert(record)
        await sio.emit("torrent:status", {"hash": hash_str, "status": "downloading"})
        return {"status": "downloading"}

    @router.get("/{hash_str}/files")
    async def list_files(hash_str: str):
        if hash_str not in engine.handles:
            raise HTTPException(404, "Torrent not found")
        return engine.get_files(hash_str)

    @router.get("/{hash_str}/files/{file_index}")
    async def download_file(hash_str: str, file_index: int):
        if hash_str not in engine.handles:
            raise HTTPException(404, "Torrent not found")
        path = engine.get_file_path(hash_str, file_index)
        if path is None:
            raise HTTPException(400, "Invalid file index or no metadata")
        if not os.path.exists(path):
            raise HTTPException(404, "File not found on disk")
        filename = os.path.basename(path)
        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=filename,
        )

    return router
