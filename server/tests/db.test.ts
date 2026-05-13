import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../src/db/schema'
import { insertTorrent, getTorrents, getTorrent, updateStatus, deleteTorrent } from '../src/db/queries'
import type { TorrentRecord } from '../src/types'
import type { JsonDb } from '../src/db/json-db'

let db: JsonDb

beforeEach(() => {
  db = openDb(':memory:')
})

const sample: TorrentRecord = {
  id: 'abc123',
  name: 'Test Torrent',
  size: 1024,
  status: 'downloading',
  progress: 0.5,
  download_dir: '/downloads',
  magnet_uri: 'magnet:?xt=urn:btih:abc123',
  added_at: Date.now(),
}

describe('insertTorrent', () => {
  it('inserts and retrieves a torrent', () => {
    insertTorrent(db, sample)
    const result = getTorrent(db, 'abc123')
    expect(result?.name).toBe('Test Torrent')
    expect(result?.progress).toBe(0.5)
  })

  it('throws on duplicate id', () => {
    insertTorrent(db, sample)
    expect(() => insertTorrent(db, sample)).toThrow()
  })
})

describe('getTorrents', () => {
  it('returns all torrents', () => {
    insertTorrent(db, sample)
    insertTorrent(db, { ...sample, id: 'def456', name: 'Another' })
    expect(getTorrents(db)).toHaveLength(2)
  })
})

describe('updateStatus', () => {
  it('updates status and progress', () => {
    insertTorrent(db, sample)
    updateStatus(db, 'abc123', 'paused', 0.5)
    expect(getTorrent(db, 'abc123')?.status).toBe('paused')
  })
})

describe('deleteTorrent', () => {
  it('removes the torrent', () => {
    insertTorrent(db, sample)
    deleteTorrent(db, 'abc123')
    expect(getTorrent(db, 'abc123')).toBeUndefined()
  })
})
