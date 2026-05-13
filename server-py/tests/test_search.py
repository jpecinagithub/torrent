import pytest
from unittest.mock import AsyncMock, patch, MagicMock

YTS_RESPONSE = {
    "data": {
        "movies": [{
            "title": "Inception",
            "year": 2010,
            "medium_cover_image": "https://img.yts.mx/inception.jpg",
            "torrents": [{
                "quality": "1080p",
                "seeds": 500,
                "peers": 120,
                "size": "2.1 GB",
                "url": "https://yts.mx/torrent/download/ABC123",
            }]
        }]
    }
}

OMDB_RESPONSE = {
    "Search": [{
        "Title": "Breaking Bad",
        "Year": "2008–2013",
        "imdbID": "tt0903747",
        "Poster": "https://m.media-amazon.com/images/bb.jpg",
    }]
}

EZTV_RESPONSE = {
    "torrents": [{
        "title": "Breaking.Bad.S01E01.720p.mkv",
        "seeds": 300,
        "peers": 80,
        "size_bytes": 1500000000,
        "torrent_url": "https://eztvx.to/ep/123/bb-s01e01.torrent",
        "magnet_url": "magnet:?xt=urn:btih:DEADBEEF",
    }]
}


@pytest.mark.asyncio
async def test_search_movies_returns_results():
    from search import search_movies

    mock_resp = AsyncMock()
    mock_resp.json = AsyncMock(return_value=YTS_RESPONSE)
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_resp)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("search.aiohttp.ClientSession", return_value=mock_session):
        results = await search_movies("inception")

    assert len(results) == 1
    assert results[0]["title"] == "Inception"
    assert results[0]["type"] == "movie"
    assert results[0]["quality"] == "1080p"
    assert results[0]["seeds"] == 500
    assert results[0]["torrent_url"] == "https://yts.mx/torrent/download/ABC123"


@pytest.mark.asyncio
async def test_search_movies_empty_when_no_results():
    from search import search_movies

    mock_resp = AsyncMock()
    mock_resp.json = AsyncMock(return_value={"data": {}})
    mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
    mock_resp.__aexit__ = AsyncMock(return_value=False)

    mock_session = MagicMock()
    mock_session.get = MagicMock(return_value=mock_resp)
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("search.aiohttp.ClientSession", return_value=mock_session):
        results = await search_movies("xyznotfound")

    assert results == []


@pytest.mark.asyncio
async def test_search_series_returns_results():
    from search import search_series

    responses = [OMDB_RESPONSE, EZTV_RESPONSE]
    call_count = 0

    def mock_get(url, **kwargs):
        nonlocal call_count
        resp = AsyncMock()
        resp.json = AsyncMock(return_value=responses[min(call_count, 1)])
        resp.__aenter__ = AsyncMock(return_value=resp)
        resp.__aexit__ = AsyncMock(return_value=False)
        call_count += 1
        return resp

    mock_session = MagicMock()
    mock_session.get = mock_get
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("search.aiohttp.ClientSession", return_value=mock_session):
        with patch("search.OMDB_API_KEY", "testkey"):
            results = await search_series("breaking bad")

    assert len(results) == 1
    assert results[0]["type"] == "series"
    assert results[0]["show"] == "Breaking Bad"
    assert results[0]["torrent_url"] == "https://eztvx.to/ep/123/bb-s01e01.torrent"


@pytest.mark.asyncio
async def test_search_series_empty_without_api_key():
    from search import search_series

    with patch("search.OMDB_API_KEY", ""):
        results = await search_series("breaking bad")

    assert results == []
