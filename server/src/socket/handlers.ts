import type { Server as IOServer } from 'socket.io'
import type { QBittorrentService } from '../torrent/qbittorrent'

export function setupSocket(io: IOServer, torrentService: QBittorrentService): void {
  setInterval(async () => {
    try {
      const hashes = await torrentService.getActiveHashes()
      for (const hash of hashes) {
        const payload = await torrentService.getProgress(hash)
        if (payload) io.emit('torrent:progress', payload)
      }
    } catch {
      // qBittorrent may be temporarily unreachable
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
