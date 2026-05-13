import { Router } from 'express'
import multer from 'multer'
import type { Server as IOServer } from 'socket.io'
import type { JsonDb } from '../db/json-db'
import { insertTorrent, getTorrents, getTorrent, updateStatus, deleteTorrent } from '../db/queries'
import type { WebTorrentService } from '../torrent/service'

const upload = multer({ storage: multer.memoryStorage() })

export function torrentRouter(
  db: JsonDb,
  torrentService: WebTorrentService,
  io: IOServer,
  downloadDir: string
): Router {
  const router = Router()

  // GET /api/torrents
  router.get('/', (_req, res) => {
    res.json(getTorrents(db))
  })

  // POST /api/torrents  (magnet or .torrent file)
  router.post('/', upload.single('torrent'), async (req, res) => {
    try {
      const magnet: string | undefined = req.body?.magnet
      const file: Buffer | undefined = req.file?.buffer

      if (!magnet && !file) {
        return res.status(400).json({ error: 'Provide a magnet URI or .torrent file' })
      }

      const input = (magnet ?? file) as string | Buffer
      const record = await torrentService.add(input, downloadDir)

      if (getTorrent(db, record.id)) {
        return res.status(409).json({ error: 'Torrent already exists' })
      }

      insertTorrent(db, record)
      io.emit('torrent:added', { torrent: record })
      res.status(201).json(record)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      const isDuplicate = msg.toLowerCase().includes('duplicate')
      res.status(isDuplicate ? 409 : 400).json({
        error: isDuplicate ? 'Este torrent ya está en la lista' : msg,
      })
    }
  })

  // DELETE /api/torrents/:hash
  router.delete('/:hash', async (req, res) => {
    const { hash } = req.params
    const deleteFiles = req.query.deleteFiles === 'true'

    if (!getTorrent(db, hash)) {
      return res.status(404).json({ error: 'Torrent not found' })
    }

    await torrentService.remove(hash, deleteFiles)
    deleteTorrent(db, hash)
    io.emit('torrent:removed', { hash })
    res.status(204).send()
  })

  // PATCH /api/torrents/:hash/pause
  router.patch('/:hash/pause', (req, res) => {
    const { hash } = req.params
    if (!getTorrent(db, hash)) return res.status(404).json({ error: 'Torrent not found' })
    torrentService.pause(hash)
    updateStatus(db, hash, 'paused', getTorrent(db, hash)!.progress)
    io.emit('torrent:status', { hash, status: 'paused' })
    res.json({ status: 'paused' })
  })

  // PATCH /api/torrents/:hash/resume
  router.patch('/:hash/resume', (req, res) => {
    const { hash } = req.params
    if (!getTorrent(db, hash)) return res.status(404).json({ error: 'Torrent not found' })
    torrentService.resume(hash)
    updateStatus(db, hash, 'downloading', getTorrent(db, hash)!.progress)
    io.emit('torrent:status', { hash, status: 'downloading' })
    res.json({ status: 'downloading' })
  })

  return router
}
