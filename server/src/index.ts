import express from 'express'
import { createServer } from 'http'
import { Server as IOServer } from 'socket.io'
import path from 'path'
import { openDb } from './db/schema'
import { insertTorrent, getTorrent } from './db/queries'
import { QBittorrentService } from './torrent/qbittorrent'
import { torrentRouter } from './routes/torrents'
import { settingsRouter } from './routes/settings'
import { setupSocket } from './socket/handlers'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000
const DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_DIR ?? '../downloads')
const DB_PATH = process.env.DB_PATH ?? 'torrents.db'

const app = express()
const httpServer = createServer(app)
const io = new IOServer(httpServer, { cors: { origin: '*' } })

app.use(express.json())

const db = openDb(DB_PATH)
const torrentService = new QBittorrentService()

async function reloadTorrents() {
  // qBittorrent persists its own state; sync any missing records into our local db
  try {
    const all = await torrentService.listAll()
    for (const t of all) {
      if (!getTorrent(db, t.id)) insertTorrent(db, t)
    }
    console.log(`[Startup] Synced ${all.length} torrents from qBittorrent`)
  } catch {
    console.warn('[Startup] Could not reach qBittorrent — is it running?')
  }
}

app.use('/api/torrents', torrentRouter(db, torrentService, io, DOWNLOAD_DIR))
app.use('/api/settings', settingsRouter(torrentService))

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve('../client/dist')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

setupSocket(io, torrentService)

reloadTorrents().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`)
  })
})

process.on('SIGINT', async () => {
  await torrentService.destroy()
  db.close()
  process.exit(0)
})
