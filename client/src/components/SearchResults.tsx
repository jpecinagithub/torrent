import type { SearchResult } from '../api/search'

interface Props {
  results: SearchResult[]
  query: string
  onAdd: (result: SearchResult) => void
  onClose: () => void
  adding: string | null
  error: string | null
}

function SeedBadge({ seeds }: { seeds: number }) {
  const color = seeds > 100 ? 'text-green' : seeds > 20 ? 'text-yellow' : 'text-red'
  return <span className={`text-xs ${color}`}>▲ {seeds}</span>
}

export function SearchResults({ results, query, onAdd, onClose, adding, error }: Props) {
  const movies = results.filter(r => r.type === 'movie')
  const series = results.filter(r => r.type === 'series')

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-crust/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-mantle border border-surface0 rounded-lg shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface0">
          <span className="text-text text-sm font-medium">
            Resultados para <span className="text-blue">"{query}"</span>
            <span className="text-overlay0 font-normal ml-2">({results.length})</span>
          </span>
          <button onClick={onClose} className="text-overlay0 hover:text-text text-xs px-1">✕</button>
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-red bg-red/10 border-b border-surface0">{error}</div>
        )}

        <div className="overflow-y-auto flex-1">
          {results.length === 0 && (
            <p className="text-overlay0 text-xs text-center py-10">No se encontraron resultados.</p>
          )}
          {movies.length > 0 && (
            <Section title="Películas" results={movies} onAdd={onAdd} adding={adding} />
          )}
          {series.length > 0 && (
            <Section title="Series" results={series} onAdd={onAdd} adding={adding} />
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, results, onAdd, adding }: {
  title: string
  results: SearchResult[]
  onAdd: (r: SearchResult) => void
  adding: string | null
}) {
  return (
    <div>
      <div className="px-4 py-1.5 bg-surface0/50 text-overlay0 text-xs font-medium sticky top-0">
        {title}
      </div>
      {results.map((r, i) => (
        <Row key={i} result={r} onAdd={onAdd} adding={adding} />
      ))}
    </div>
  )
}

function Row({ result: r, onAdd, adding }: {
  result: SearchResult
  onAdd: (r: SearchResult) => void
  adding: string | null
}) {
  const key = r.torrent_url ?? r.magnet_url ?? ''
  const isAdding = adding === key

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-surface0/40 hover:bg-surface0/30 transition-colors">
      <div className="w-8 h-12 flex-shrink-0 bg-surface0 rounded overflow-hidden">
        {r.poster
          ? <img src={r.poster} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-overlay0 text-lg">🎬</div>
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-text text-xs truncate leading-tight">{r.title}</p>
        <p className="text-overlay0 text-xs mt-0.5">
          {r.year && <span className="mr-2">{r.year}</span>}
          {r.quality && <span className="mr-2 text-blue">{r.quality}</span>}
          {r.size && <span className="mr-2">{r.size}</span>}
          <SeedBadge seeds={r.seeds} />
        </p>
      </div>

      <button
        onClick={() => onAdd(r)}
        disabled={isAdding}
        className="text-xs px-2 py-1 rounded bg-blue/20 text-blue hover:bg-blue/30 disabled:opacity-40 transition-colors flex-shrink-0"
      >
        {isAdding ? '…' : '+ Añadir'}
      </button>
    </div>
  )
}
