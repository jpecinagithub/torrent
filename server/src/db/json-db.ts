import fs from 'fs'
import path from 'path'
import type { TorrentRecord, TorrentStatus } from '../types'

interface DbData {
  torrents: TorrentRecord[]
}

export class JsonDb {
  private filePath: string
  private data: DbData

  constructor(filePath: string) {
    if (filePath === ':memory:') {
      this.filePath = ''
      this.data = { torrents: [] }
      return
    }
    this.filePath = path.resolve(filePath)
    if (fs.existsSync(this.filePath)) {
      this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as DbData
    } else {
      this.data = { torrents: [] }
      this.persist()
    }
  }

  private persist(): void {
    if (!this.filePath) return
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  insert(t: TorrentRecord): void {
    if (this.data.torrents.find((r) => r.id === t.id)) {
      throw new Error(`UNIQUE constraint failed: torrents.id = ${t.id}`)
    }
    this.data.torrents.push(t)
    this.persist()
  }

  findAll(): TorrentRecord[] {
    return [...this.data.torrents].sort((a, b) => b.added_at - a.added_at)
  }

  findById(id: string): TorrentRecord | undefined {
    return this.data.torrents.find((r) => r.id === id)
  }

  updateStatus(id: string, status: TorrentStatus, progress: number): void {
    const t = this.data.torrents.find((r) => r.id === id)
    if (t) {
      t.status = status
      t.progress = progress
      this.persist()
    }
  }

  remove(id: string): void {
    this.data.torrents = this.data.torrents.filter((r) => r.id !== id)
    this.persist()
  }

  close(): void {
    // no-op — for API compatibility
  }
}
