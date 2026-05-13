import type { TorrentRow } from '../types'

interface Props { torrents: TorrentRow[] }

function fmtSpeed(bps: number): string {
  if (bps === 0) return '0 B/s'
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
}

export function StatusBar({ torrents }: Props) {
  const totalDown = torrents.reduce((s, t) => s + t.downloadSpeed, 0)
  const totalUp = torrents.reduce((s, t) => s + t.uploadSpeed, 0)

  return (
    <div className="flex gap-6 px-3 py-1 bg-mantle border-t border-surface0 text-xs text-overlay0 font-mono">
      <span>{torrents.length} torrents</span>
      <span>↓ {fmtSpeed(totalDown)}</span>
      <span>↑ {fmtSpeed(totalUp)}</span>
    </div>
  )
}
