import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createServer } from 'http'
import { Server as IOServer } from 'socket.io'
import { openDb } from '../src/db/schema'
import { WebTorrentService } from '../src/torrent/service'
import { torrentRouter } from '../src/routes/torrents'
import { settingsRouter } from '../src/routes/settings'
import { setupSocket } from '../src/socket/handlers'

let app: express.Express
let httpServer: ReturnType<typeof createServer>
let torrentService: WebTorrentService

beforeAll(async () => {
  app = express()
  app.use(express.json())
  httpServer = createServer(app)
  const io = new IOServer(httpServer)
  const db = openDb(':memory:')
  torrentService = new WebTorrentService()
  const downloadDir = './tests/fixtures'

  app.use('/api/torrents', torrentRouter(db, torrentService, io, downloadDir))
  app.use('/api/settings', settingsRouter(torrentService))
  setupSocket(io, torrentService)

  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
})

afterAll(async () => {
  await torrentService.destroy()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

describe('GET /api/torrents', () => {
  it('returns empty array initially', async () => {
    const res = await request(app).get('/api/torrents')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('POST /api/torrents', () => {
  it('returns 400 with no body', async () => {
    const res = await request(app).post('/api/torrents').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })
})

describe('PATCH /api/settings/speed', () => {
  it('accepts valid speed limits', async () => {
    const res = await request(app)
      .patch('/api/settings/speed')
      .send({ downloadLimit: 0, uploadLimit: 0 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ downloadLimit: 0, uploadLimit: 0 })
  })

  it('returns 400 with invalid body', async () => {
    const res = await request(app)
      .patch('/api/settings/speed')
      .send({ downloadLimit: 'fast' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/torrents/:hash', () => {
  it('returns 404 for unknown hash', async () => {
    const res = await request(app).delete('/api/torrents/nonexistent')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/torrents/:hash/pause', () => {
  it('returns 404 for unknown hash', async () => {
    const res = await request(app).patch('/api/torrents/nonexistent/pause')
    expect(res.status).toBe(404)
  })
})
