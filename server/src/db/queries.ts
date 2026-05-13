import type { JsonDb } from './json-db'
import type { TorrentRecord, TorrentStatus } from '../types'

export function insertTorrent(db: JsonDb, t: TorrentRecord): void {
  db.insert(t)
}

export function getTorrents(db: JsonDb): TorrentRecord[] {
  return db.findAll()
}

export function getTorrent(db: JsonDb, id: string): TorrentRecord | undefined {
  return db.findById(id)
}

export function updateStatus(
  db: JsonDb,
  id: string,
  status: TorrentStatus,
  progress: number
): void {
  db.updateStatus(id, status, progress)
}

export function deleteTorrent(db: JsonDb, id: string): void {
  db.remove(id)
}
