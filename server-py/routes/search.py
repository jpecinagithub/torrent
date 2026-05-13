from fastapi import APIRouter
from search import search as do_search


def make_search_router() -> APIRouter:
    router = APIRouter()

    @router.get("")
    async def search_torrents(q: str = ""):
        if len(q) < 2:
            return []
        return await do_search(q)

    return router
