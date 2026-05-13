import asyncio
import os
from contextlib import asynccontextmanager
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

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

engine = TorrentEngine(DOWNLOAD_DIR)
db = TorrentDb(DB_PATH)


async def _progress_loop():
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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    loaded = 0
    for record in db.list_all():
        try:
            if record.magnet_uri:
                engine.add_magnet(record.magnet_uri)
            else:
                if not engine.load_torrent_file(record.id):
                    continue
            if record.status == "paused":
                engine.pause(record.id)
            loaded += 1
        except Exception as exc:
            print(f"[Startup] Could not reload {record.id}: {exc}")
    print(f"[Startup] Reloaded {loaded}/{len(db.list_all())} torrents")
    task = asyncio.create_task(_progress_loop())
    yield
    task.cancel()


fastapi_app = FastAPI(lifespan=lifespan)
fastapi_app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

fastapi_app.include_router(
    make_torrents_router(engine, db, sio),
    prefix="/api/torrents",
)
fastapi_app.include_router(
    make_settings_router(engine),
    prefix="/api/settings",
)

app = socketio.ASGIApp(sio, fastapi_app)


@sio.event
def connect(sid, environ):
    print(f"[Socket.io] client connected: {sid}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
