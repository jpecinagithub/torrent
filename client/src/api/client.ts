import type { TorrentRow } from '../types'

const BASE = (import.meta.env.VITE_BASE_PATH ?? '') + '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listTorrents: (): Promise<TorrentRow[]> =>
    request('/torrents'),

  addMagnet: (magnet: string): Promise<TorrentRow> =>
    request('/torrents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnet }),
    }),

  addFile: (file: File): Promise<TorrentRow> => {
    const form = new FormData()
    form.append('torrent', file)
    return request('/torrents', { method: 'POST', body: form })
  },

  deleteTorrent: (hash: string, deleteFiles = false): Promise<void> =>
    request(`/torrents/${hash}?deleteFiles=${deleteFiles}`, { method: 'DELETE' }),

  pauseTorrent: (hash: string): Promise<void> =>
    request(`/torrents/${hash}/pause`, { method: 'PATCH' }),

  resumeTorrent: (hash: string): Promise<void> =>
    request(`/torrents/${hash}/resume`, { method: 'PATCH' }),

  setSpeedLimits: (downloadLimit: number, uploadLimit: number): Promise<void> =>
    request('/settings/speed', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadLimit, uploadLimit }),
    }),
}
