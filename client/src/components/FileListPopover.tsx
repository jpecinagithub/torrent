import { useEffect, useState } from 'react'
import { api, type FileEntry } from '../api/client'

interface Props {
  hash: string
  onClose: () => void
}

const BASE = (import.meta.env.VITE_BASE_PATH ?? '') + '/api'

function fmtSize(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function FileListPopover({ hash, onClose }: Props) {
  const [files, setFiles] = useState<FileEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getFiles(hash)
      .then(result => {
        if (result.length === 1) {
          // Single file: trigger download immediately without showing the list
          const a = document.createElement('a')
          a.href = `${BASE}/torrents/${hash}/files/0`
          a.download = result[0].name
          a.click()
          onClose()
        } else {
          setFiles(result)
        }
      })
      .catch(e => setError((e as Error).message))
  }, [hash, onClose])

  // Close when clicking outside the popover
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-file-popover]')) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      data-file-popover
      className="absolute right-0 top-6 z-50 bg-mantle border border-surface0 rounded shadow-xl min-w-56 max-w-xs max-h-60 overflow-y-auto"
      onClick={e => e.stopPropagation()}
    >
      {error && (
        <p className="text-red text-xs px-3 py-2">{error}</p>
      )}
      {!error && !files && (
        <p className="text-overlay0 text-xs px-3 py-2">Cargando…</p>
      )}
      {files && files.map(f => (
        <a
          key={f.index}
          href={`${BASE}/torrents/${hash}/files/${f.index}`}
          download={f.name}
          onClick={onClose}
          className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface0 transition-colors border-b border-surface0/40 last:border-0 cursor-pointer"
        >
          <span className="text-text text-xs truncate">{f.name}</span>
          <span className="text-overlay0 text-xs flex-shrink-0">{fmtSize(f.size)}</span>
        </a>
      ))}
    </div>
  )
}
