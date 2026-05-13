import asyncio
import os
import aiohttp

OMDB_API_KEY = os.environ.get("OMDB_API_KEY", "")


async def search_movies(q: str) -> list[dict]:
    url = f"https://yts.mx/api/v2/list_movies.json?query_term={q}&limit=20&sort_by=seeds"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            data = await resp.json(content_type=None)
    movies = (data.get("data") or {}).get("movies") or []
    results = []
    for m in movies:
        for t in m.get("torrents", []):
            results.append({
                "type": "movie",
                "title": m["title"],
                "year": m.get("year"),
                "poster": m.get("medium_cover_image"),
                "quality": t.get("quality"),
                "seeds": t.get("seeds", 0),
                "peers": t.get("peers", 0),
                "size": t.get("size", ""),
                "torrent_url": t.get("url"),
            })
    return results


async def search_series(q: str) -> list[dict]:
    if not OMDB_API_KEY:
        return []
    async with aiohttp.ClientSession() as session:
        omdb_url = f"https://www.omdbapi.com/?apikey={OMDB_API_KEY}&s={q}&type=series"
        async with session.get(omdb_url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
            omdb_data = await resp.json(content_type=None)
        shows = (omdb_data.get("Search")) or []

        async def fetch_eztv(show: dict) -> list[dict]:
            imdb_num = show["imdbID"].lstrip("t")
            eztv_url = f"https://eztvx.to/api/get-torrents?imdb_id={imdb_num}&limit=30"
            async with session.get(eztv_url, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                eztv_data = await resp.json(content_type=None)
            results = []
            for t in (eztv_data.get("torrents") or []):
                size_bytes = int(t.get("size_bytes", 0))
                size_str = f"{round(size_bytes / 1024 ** 3, 2)} GB" if size_bytes else ""
                results.append({
                    "type": "series",
                    "title": t.get("title", show["Title"]),
                    "show": show["Title"],
                    "year": show.get("Year"),
                    "poster": show.get("Poster") if show.get("Poster") != "N/A" else None,
                    "seeds": t.get("seeds", 0),
                    "peers": t.get("peers", 0),
                    "size": size_str,
                    "torrent_url": t.get("torrent_url"),
                    "magnet_url": t.get("magnet_url"),
                })
            return results

        lists = await asyncio.gather(*[fetch_eztv(s) for s in shows[:3]])
    return [item for sublist in lists for item in sublist]


async def search(q: str) -> list[dict]:
    movies, series = await asyncio.gather(
        search_movies(q),
        search_series(q),
    )
    return movies + series
