import { SpeedChart } from './SpeedChart'
import type { TorrentRow } from '../types'

interface Props { torrent: TorrentRow | null }

function fmtSize(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtEta(seconds: number): string {
  if (seconds < 0) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function DetailPanel({ torrent }: Props) {
  if (!torrent) {
    return (
      <div className="h-32 flex items-center justify-center text-overlay0 text-xs border-t border-surface0">
        Selecciona un torrent para ver los detalles
      </div>
    )
  }

  const downloaded = torrent.progress * torrent.size

  return (
    <div className="border-t border-surface0 bg-mantle px-4 py-3">
      <p className="text-overlay0 text-xs mb-2 uppercase truncate">{torrent.name}</p>
      <div className="grid grid-cols-4 gap-4 mb-3">
        <div>
          <p className="text-xs text-overlay0">DESCARGADO</p>
          <p className="text-sm text-text font-mono">{fmtSize(downloaded)}</p>
        </div>
        <div>
          <p className="text-xs text-overlay0">TAMAÑO TOTAL</p>
          <p className="text-sm text-text font-mono">{fmtSize(torrent.size)}</p>
        </div>
        <div>
          <p className="text-xs text-overlay0">PEERS</p>
          <p className="text-sm text-text font-mono">{torrent.peers}</p>
        </div>
        <div>
          <p className="text-xs text-overlay0">ETA</p>
          <p className="text-sm text-text font-mono">{fmtEta(torrent.eta)}</p>
        </div>
      </div>
      <SpeedChart downloadSpeed={torrent.downloadSpeed} uploadSpeed={torrent.uploadSpeed} />
    </div>
  )
}
