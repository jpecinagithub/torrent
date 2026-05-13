import { useState } from 'react'
import { api } from '../api/client'
import { AddTorrentDialog } from './AddTorrentDialog'
import type { TorrentRow } from '../types'

interface Props {
  torrents: TorrentRow[]
  onAdded: () => void
  onError: (msg: string) => void
}

function fmt(bps: number): string {
  if (bps === 0) return '0 B/s'
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
}

export function Toolbar({ torrents, onAdded, onError }: Props) {
  const [showAdd, setShowAdd] = useState(false)

  const totalDown = torrents.reduce((s, t) => s + t.downloadSpeed, 0)
  const totalUp = torrents.reduce((s, t) => s + t.uploadSpeed, 0)

  function pauseAll() {
    void Promise.all(
      torrents.filter((t) => t.status === 'downloading').map((t) => api.pauseTorrent(t.id))
    )
  }

  function resumeAll() {
    void Promise.all(
      torrents.filter((t) => t.status === 'paused').map((t) => api.resumeTorrent(t.id))
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-mantle border-b border-surface0 text-sm">
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue text-crust font-semibold px-3 py-1 rounded text-xs hover:opacity-90"
        >
          + Añadir torrent
        </button>
        <button
          onClick={pauseAll}
          className="bg-surface0 text-text px-3 py-1 rounded text-xs hover:bg-surface1"
        >
          ⏸ Pausar todo
        </button>
        <button
          onClick={resumeAll}
          className="bg-surface0 text-text px-3 py-1 rounded text-xs hover:bg-surface1"
        >
          ▶ Reanudar todo
        </button>
        <div className="flex-1" />
        <span className="text-overlay0 text-xs font-mono">
          ↓ {fmt(totalDown)} &nbsp; ↑ {fmt(totalUp)}
        </span>
      </div>

      {showAdd && (
        <AddTorrentDialog
          onAdded={onAdded}
          onError={onError}
          onClose={() => setShowAdd(false)}
        />
      )}
    </>
  )
}
