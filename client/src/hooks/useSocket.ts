import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import type { ProgressEvent, TorrentRow } from '../types'

interface SocketEvents {
  onProgress: (e: ProgressEvent) => void
  onAdded: (e: { torrent: TorrentRow }) => void
  onRemoved: (e: { hash: string }) => void
  onStatus: (e: { hash: string; status: TorrentRow['status'] }) => void
  onError: (e: { hash: string; message: string }) => void
}

export function useSocket(events: SocketEvents) {
  const socketRef = useRef<Socket | null>(null)
  const eventsRef = useRef(events)
  eventsRef.current = events

  useEffect(() => {
    const socket = io({ path: (import.meta.env.VITE_BASE_PATH ?? '') + '/socket.io' })
    socketRef.current = socket

    socket.on('torrent:progress', (e: ProgressEvent) => eventsRef.current.onProgress(e))
    socket.on('torrent:added', (e: { torrent: TorrentRow }) => eventsRef.current.onAdded(e))
    socket.on('torrent:removed', (e: { hash: string }) => eventsRef.current.onRemoved(e))
    socket.on('torrent:status', (e: { hash: string; status: TorrentRow['status'] }) =>
      eventsRef.current.onStatus(e)
    )
    socket.on('torrent:error', (e: { hash: string; message: string }) =>
      eventsRef.current.onError(e)
    )

    return () => { socket.disconnect() }
  }, [])
}
