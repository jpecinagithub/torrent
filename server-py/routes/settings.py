from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


class SpeedSettings(BaseModel):
    downloadLimit: int
    uploadLimit: int


def make_settings_router(engine):
    router = APIRouter()

    @router.patch("/speed")
    async def set_speed(body: SpeedSettings):
        engine.set_speed_limits(dl_limit=body.downloadLimit, ul_limit=body.uploadLimit)
        return {"downloadLimit": body.downloadLimit, "uploadLimit": body.uploadLimit}

    return router
