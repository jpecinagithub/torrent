import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import { useSocket } from './useSocket'
import type { TorrentRow } from '../types'

const DEFAULT_LIVE: Pick<TorrentRow, 'downloadSpeed' | 'uploadSpeed' | 'peers' | 'eta' | 'hasError' | 'errorMessage'> = {
  downloadSpeed: 0,
  uploadSpeed: 0,
  peers: 0,
  eta: -1,
  hasError: false,
  errorMessage: '',
}

export function useTorrents() {
  const [torrents, setTorrents] = useState<TorrentRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.listTorrents()
      setTorrents(data.map((t) => ({ ...DEFAULT_LIVE, ...t })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load torrents')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useSocket({
    onProgress(e) {
      setTorrents((prev) =>
        prev.map((t) =>
          t.id === e.hash
            ? { ...t, progress: e.progress, downloadSpeed: e.downloadSpeed, uploadSpeed: e.uploadSpeed, peers: e.peers, eta: e.eta }
            : t
        )
      )
    },
    onAdded({ torrent }) {
      setTorrents((prev) => [{ ...DEFAULT_LIVE, ...torrent }, ...prev])
    },
    onRemoved({ hash }) {
      setTorrents((prev) => prev.filter((t) => t.id !== hash))
    },
    onStatus({ hash, status }) {
      setTorrents((prev) => prev.map((t) => (t.id === hash ? { ...t, status } : t)))
    },
    onError({ hash, message }) {
      setTorrents((prev) =>
        prev.map((t) => (t.id === hash ? { ...t, hasError: true, errorMessage: message } : t))
      )
    },
  })

  return { torrents, error, reload: load }
}
