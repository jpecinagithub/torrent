import { useState, useRef } from 'react'
import { api } from '../api/client'

interface Props {
  onAdded: () => void
  onError: (msg: string) => void
  onClose: () => void
}

export function AddTorrentDialog({ onAdded, onError, onClose }: Props) {
  const [magnet, setMagnet] = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleMagnet() {
    if (!magnet.trim()) return
    setLoading(true)
    try {
      await api.addMagnet(magnet.trim())
      onAdded()
      onClose()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error adding torrent')
    } finally {
      setLoading(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      await api.addFile(file)
      onAdded()
      onClose()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error adding torrent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-crust/80">
      <div className="bg-mantle border border-surface0 rounded-lg p-6 w-[480px] space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-text font-semibold">Añadir torrent</h2>
          <button onClick={onClose} className="text-overlay0 hover:text-text">✕</button>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-overlay0 uppercase">Magnet link</label>
          <input
            className="w-full bg-base border border-surface0 rounded px-3 py-2 text-sm text-text placeholder-overlay0 focus:outline-none focus:border-blue"
            placeholder="magnet:?xt=urn:btih:..."
            value={magnet}
            onChange={(e) => setMagnet(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleMagnet() }}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleMagnet()}
            disabled={loading || !magnet.trim()}
            className="bg-blue text-crust font-semibold px-4 py-2 rounded text-sm disabled:opacity-40 hover:opacity-90"
          >
            {loading ? 'Añadiendo...' : 'Añadir magnet'}
          </button>
          <span className="text-overlay0 text-sm">o</span>
          <button
            onClick={() => fileRef.current?.click()}
            className="bg-surface0 text-text px-4 py-2 rounded text-sm hover:bg-surface1"
          >
            Subir .torrent
          </button>
          <input ref={fileRef} type="file" accept=".torrent" className="hidden" onChange={(e) => void handleFile(e)} />
        </div>
      </div>
    </div>
  )
}
