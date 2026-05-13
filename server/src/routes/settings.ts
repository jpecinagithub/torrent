import { Router } from 'express'
import type { QBittorrentService } from '../torrent/qbittorrent'

export function settingsRouter(torrentService: QBittorrentService): Router {
  const router = Router()

  // PATCH /api/settings/speed
  router.patch('/speed', (req, res) => {
    const { downloadLimit, uploadLimit } = req.body
    if (typeof downloadLimit !== 'number' || typeof uploadLimit !== 'number') {
      return res.status(400).json({ error: 'downloadLimit and uploadLimit must be numbers' })
    }
    torrentService.setSpeedLimits({ downloadLimit, uploadLimit })
    res.json({ downloadLimit, uploadLimit })
  })

  return router
}
