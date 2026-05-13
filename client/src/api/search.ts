const BASE = (import.meta.env.VITE_BASE_PATH ?? '') + '/api'

export interface SearchResult {
  type: 'movie' | 'series'
  title: string
  show?: string
  year?: number | string
  poster?: string
  quality?: string
  seeds: number
  peers: number
  size: string
  torrent_url?: string
  magnet_url?: string
}

export async function searchTorrents(q: string): Promise<SearchResult[]> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function addFromUrl(torrentUrl: string): Promise<void> {
  const res = await fetch(`${BASE}/torrents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ torrent_url: torrentUrl }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
}
