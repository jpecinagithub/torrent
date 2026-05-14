import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'
import { api } from '../api/client'
import { FileListPopover } from './FileListPopover'
import type { TorrentRow } from '../types'

interface DeleteDialogProps {
  name: string
  onConfirm: (deleteFiles: boolean) => void
  onCancel: () => void
}

function DeleteDialog({ name, onConfirm, onCancel }: DeleteDialogProps) {
  const [deleteFiles, setDeleteFiles] = useState(false)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-crust/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-mantle border border-surface0 rounded-lg shadow-xl w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="text-red text-xl leading-none mt-0.5">🗑</span>
          <div className="flex-1 min-w-0">
            <p className="text-text font-medium mb-1">Eliminar torrent</p>
            <p className="text-overlay0 text-xs truncate" title={name}>{name}</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-subtext0 mb-5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            className="accent-red"
          />
          Borrar también los archivos descargados
        </label>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs text-subtext0 hover:text-text bg-surface0 hover:bg-surface1 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(deleteFiles)}
            className="px-3 py-1.5 rounded text-xs text-base bg-red hover:bg-red/80 transition-colors font-medium"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}

const helper = createColumnHelper<TorrentRow>()

function fmtSize(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function fmtSpeed(bps: number): string {
  if (bps === 0) return '—'
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
}

const STATUS_COLOR: Record<TorrentRow['status'], string> = {
  downloading: 'text-green',
  seeding: 'text-peach',
  paused: 'text-overlay0',
  completed: 'text-blue',
}

const STATUS_LABEL: Record<TorrentRow['status'], string> = {
  downloading: '● Descargando',
  seeding: '▲ Subiendo',
  paused: '⏸ Pausado',
  completed: '✓ Completo',
}

interface Props {
  torrents: TorrentRow[]
  selected: string | null
  onSelect: (id: string) => void
  onError: (msg: string) => void
}

export function TorrentTable({ torrents, selected, onSelect, onError }: Props) {
  const [deleting, setDeleting] = useState<TorrentRow | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const columns = [
    helper.accessor('name', {
      header: 'Nombre',
      cell: (info) => (
        <span className={`truncate block max-w-xs ${info.row.original.hasError ? 'text-red' : 'text-text'}`}>
          {info.getValue()}
          {info.row.original.hasError && (
            <span className="ml-2 text-xs bg-red/20 text-red px-1 rounded">error</span>
          )}
        </span>
      ),
    }),
    helper.accessor('size', {
      header: 'Tamaño',
      cell: (info) => <span className="text-overlay0">{fmtSize(info.getValue())}</span>,
    }),
    helper.accessor('progress', {
      header: 'Progreso',
      cell: (info) => {
        const pct = Math.round(info.getValue() * 100)
        return (
          <div className="w-20">
            <div className="bg-surface0 rounded-sm h-1.5 mb-0.5">
              <div
                className={`h-1.5 rounded-sm ${info.row.original.status === 'completed' ? 'bg-green' : 'bg-blue'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-blue">{pct}%</span>
          </div>
        )
      },
    }),
    helper.accessor('status', {
      header: 'Estado',
      cell: (info) => (
        <span className={`text-xs ${STATUS_COLOR[info.getValue()]}`}>
          {STATUS_LABEL[info.getValue()]}
        </span>
      ),
    }),
    helper.accessor('downloadSpeed', {
      header: '↓ Vel.',
      cell: (info) => (
        <span className={info.getValue() > 0 ? 'text-green' : 'text-overlay0'}>
          {fmtSpeed(info.getValue())}
        </span>
      ),
    }),
    helper.accessor('uploadSpeed', {
      header: '↑ Vel.',
      cell: (info) => (
        <span className={info.getValue() > 0 ? 'text-peach' : 'text-overlay0'}>
          {fmtSpeed(info.getValue())}
        </span>
      ),
    }),
    helper.accessor('peers', {
      header: 'Peers',
      cell: (info) => <span className="text-overlay0">{info.getValue() || '—'}</span>,
    }),
    helper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const t = row.original
        return (
          <div className="flex gap-1 justify-end relative">
            {(t.status === 'seeding' || t.status === 'completed') && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDownloading(downloading === t.id ? null : t.id)
                  }}
                  className="text-overlay0 hover:text-blue text-xs px-1"
                  title="Descargar al PC"
                >
                  ⬇
                </button>
                {downloading === t.id && (
                  <FileListPopover
                    hash={t.id}
                    onClose={() => setDownloading(null)}
                  />
                )}
              </>
            )}
            {t.status === 'downloading' && (
              <button
                onClick={(e) => { e.stopPropagation(); void api.pauseTorrent(t.id).catch((err: Error) => onError(err.message)) }}
                className="text-overlay0 hover:text-text text-xs px-1"
              >⏸</button>
            )}
            {t.status === 'paused' && (
              <button
                onClick={(e) => { e.stopPropagation(); void api.resumeTorrent(t.id).catch((err: Error) => onError(err.message)) }}
                className="text-overlay0 hover:text-text text-xs px-1"
              >▶</button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setDeleting(t) }}
              className="text-overlay0 hover:text-red text-xs px-1"
            >✕</button>
          </div>
        )
      },
    }),
  ]

  const table = useReactTable({
    data: torrents,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-mantle z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-surface0">
              {hg.headers.map((h) => (
                <th key={h.id} className="text-left px-3 py-1.5 text-overlay0 font-normal whitespace-nowrap">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.original.id)}
              className={`border-b border-surface0/40 cursor-pointer hover:bg-base transition-colors ${
                selected === row.original.id ? 'bg-base' : ''
              }`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-1.5 whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {torrents.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-overlay0 py-12">
                No hay torrents. Añade uno con el botón de arriba.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {deleting && (
        <DeleteDialog
          name={deleting.name}
          onConfirm={(deleteFiles) => {
            void api.deleteTorrent(deleting.id, deleteFiles).catch((err: Error) => onError(err.message))
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
