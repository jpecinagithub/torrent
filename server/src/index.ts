import express from 'express'
import { createServer } from 'http'
import { Server as IOServer } from 'socket.io'
import path from 'path'
import { openDb } from './db/schema'
import type { JsonDb } from './db/json-db'
import { getTorrents, updateStatus } from './db/queries'
import { WebTorrentService } from './torrent/service'
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
const torrentService = new WebTorrentService()

async function reloadTorrents() {
  const torrents = getTorrents(db).filter(
    (t) => t.status === 'downloading' || t.status === 'paused'
  )
  for (const t of torrents) {
    try {
      const input = t.magnet_uri ?? t.id
      await torrentService.add(input, t.download_dir)
      if (t.status === 'paused') torrentService.pause(t.id)
    } catch {
      updateStatus(db, t.id, 'paused', t.progress)
    }
  }
  console.log(`[Startup] Reloaded ${torrents.length} torrents`)
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
