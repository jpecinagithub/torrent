import type { TorrentRow, TorrentStatus } from '../types'

export type Filter = 'all' | TorrentStatus

interface Props {
  torrents: TorrentRow[]
  filter: Filter
  onFilter: (f: Filter) => void
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'downloading', label: 'Descargando' },
  { key: 'seeding', label: 'Subiendo' },
  { key: 'paused', label: 'Pausados' },
  { key: 'completed', label: 'Completados' },
]

export function Sidebar({ torrents, filter, onFilter }: Props) {
  function count(key: Filter) {
    if (key === 'all') return torrents.length
    return torrents.filter((t) => t.status === key).length
  }

  return (
    <aside className="w-36 bg-mantle border-r border-surface0 flex flex-col text-xs py-1 flex-shrink-0">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onFilter(key)}
          className={`text-left px-3 py-1.5 transition-colors ${
            filter === key
              ? 'text-blue bg-base border-l-2 border-blue'
              : 'text-overlay0 hover:text-text border-l-2 border-transparent'
          }`}
        >
          {label} ({count(key)})
        </button>
      ))}
      <div className="flex-1" />
      <button className="text-left px-3 py-1.5 text-overlay0 hover:text-text border-l-2 border-transparent">
        ⚙ Ajustes
      </button>
    </aside>
  )
}
