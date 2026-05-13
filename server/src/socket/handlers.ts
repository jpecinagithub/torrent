import type { Server as IOServer } from 'socket.io'
import type { WebTorrentService } from '../torrent/service'

export function setupSocket(io: IOServer, torrentService: WebTorrentService): void {
  setInterval(() => {
    const hashes = torrentService.getActiveHashes()
    for (const hash of hashes) {
      const payload = torrentService.getProgress(hash)
      if (payload) io.emit('torrent:progress', payload)
    }
  }, 1000)

  torrentService.onStatus = (hash, status) => {
    io.emit('torrent:status', { hash, status })
  }

  torrentService.onError = (hash, message) => {
    io.emit('torrent:error', { hash, message })
  }

  io.on('connection', (socket) => {
    console.log('[Socket.io] client connected:', socket.id)
  })
}
