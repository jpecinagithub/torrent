import { useState } from 'react'
import { useTorrents } from './hooks/useTorrents'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { TorrentTable } from './components/TorrentTable'
import { DetailPanel } from './components/DetailPanel'
import { StatusBar } from './components/StatusBar'
import { Toast } from './components/Toast'
import type { Filter } from './components/Sidebar'

export function App() {
  const { torrents, reload } = useTorrents()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null)

  const filtered = filter === 'all' ? torrents : torrents.filter((t) => t.status === filter)
  const selectedTorrent = torrents.find((t) => t.id === selected) ?? null

  function showError(msg: string) {
    setToast({ message: msg, type: 'error' })
  }

  return (
    <div className="h-screen flex flex-col bg-crust overflow-hidden">
      <Toolbar torrents={torrents} onAdded={reload} onError={showError} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar torrents={torrents} filter={filter} onFilter={setFilter} />

        <main className="flex flex-col flex-1 overflow-hidden">
          <TorrentTable
            torrents={filtered}
            selected={selected}
            onSelect={setSelected}
            onError={showError}
          />
          <DetailPanel torrent={selectedTorrent} />
        </main>
      </div>

      <StatusBar torrents={torrents} />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
