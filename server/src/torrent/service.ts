import WebTorrent from 'webtorrent'
import type { TorrentRecord, ProgressPayload, SpeedSettings } from '../types'

type ProgressCallback = (payload: ProgressPayload) => void
type StatusCallback = (hash: string, status: 'seeding' | 'completed' | 'downloading') => void
type ErrorCallback = (hash: string, message: string) => void

export class WebTorrentService {
  private client: WebTorrent.Instance
  onProgress: ProgressCallback = () => {}
  onStatus: StatusCallback = () => {}
  onError: ErrorCallback = () => {}

  constructor() {
    this.client = new WebTorrent()
    this.client.on('error', (err) => console.error('[WebTorrent]', err))
  }

  add(magnetOrBuffer: string | Buffer, downloadDir: string): Promise<TorrentRecord> {
    return new Promise((resolve, reject) => {
      const opts = { path: downloadDir }
      const torrent = this.client.add(magnetOrBuffer as string, opts)

      torrent.on('error', (err: Error) => reject(err))

      torrent.on('metadata', () => {
        const record: TorrentRecord = {
          id: torrent.infoHash,
          name: torrent.name,
          size: torrent.length,
          status: 'downloading',
          progress: torrent.progress,
          download_dir: downloadDir,
          magnet_uri: torrent.magnetURI,
          added_at: Date.now(),
        }
        resolve(record)
      })

      torrent.on('done', () => {
        this.onStatus(torrent.infoHash, 'completed')
      })

      torrent.on('upload', () => {
        if (torrent.done) this.onStatus(torrent.infoHash, 'seeding')
      })
    })
  }

  remove(hash: string, deleteFiles: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.remove(hash, { destroyStore: deleteFiles }, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  pause(hash: string): void {
    const t = this.client.get(hash)
    if (t) t.pause()
  }

  resume(hash: string): void {
    const t = this.client.get(hash)
    if (t) t.resume()
  }

  setSpeedLimits(settings: SpeedSettings): void {
    this.client.throttleDownload(settings.downloadLimit || -1)
    this.client.throttleUpload(settings.uploadLimit || -1)
  }

  getProgress(hash: string): ProgressPayload | null {
    const t = this.client.get(hash)
    if (!t) return null
    return {
      hash: t.infoHash,
      progress: t.progress,
      downloadSpeed: t.downloadSpeed,
      uploadSpeed: t.uploadSpeed,
      peers: t.numPeers,
      eta: t.timeRemaining > 0 ? Math.round(t.timeRemaining / 1000) : -1,
    }
  }

  getActiveHashes(): string[] {
    return this.client.torrents
      .filter((t) => !t.paused)
      .map((t) => t.infoHash)
  }

  destroy(): Promise<void> {
    return new Promise((resolve) => this.client.destroy(resolve))
  }
}
