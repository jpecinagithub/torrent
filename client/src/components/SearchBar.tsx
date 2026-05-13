import { useState } from 'react'

interface Props {
  onSearch: (q: string) => void
  loading: boolean
}

export function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState('')

  const submit = () => {
    const q = value.trim()
    if (q.length >= 2) onSearch(q)
  }

  return (
    <div className="flex gap-1">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Buscar series y películas…"
        className="bg-surface0 text-text text-xs px-2 py-1 rounded border border-surface1 focus:outline-none focus:border-blue w-48 placeholder-overlay0"
      />
      <button
        onClick={submit}
        disabled={loading || value.trim().length < 2}
        className="text-xs px-2 py-1 rounded bg-surface0 border border-surface1 text-subtext0 hover:text-text disabled:opacity-40 transition-colors"
      >
        {loading ? '…' : '🔍'}
      </button>
    </div>
  )
}
