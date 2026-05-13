import type { TorrentRecord, ProgressPayload, SpeedSettings } from '../types'

const BASE = 'http://localhost:8080/api/v2'

async function qbt(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new Error(`qBittorrent API error: ${res.status} ${path}`)
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

function mapStatus(state: string): TorrentRecord['status'] {
  if (['downloading', 'stalledDL', 'checkingDL', 'forcedDL', 'allocating', 'metaDL'].includes(state))
    return 'downloading'
  if (['uploading', 'stalledUP', 'forcedUP'].includes(state))
    return 'seeding'
  if (['pausedDL', 'pausedUP'].includes(state))
    return 'paused'
  if (state === 'checkingUP' || state === 'queuedUP')
    return 'completed'
  return 'downloading'
}

interface QbtTorrent {
  hash: string
  name: string
  size: number
  progress: number
  state: string
  save_path: string
  magnet_uri: string
  added_on: number
  dlspeed: number
  upspeed: number
  num_seeds: number
  eta: number
}

export class QBittorrentService {
  onStatus: (hash: string, status: TorrentRecord['status']) => void = () => {}
  onError: (hash: string, message: string) => void = () => {}

  async add(magnetOrBuffer: string | Buffer, _downloadDir: string): Promise<TorrentRecord> {
    const form = new FormData()

    // Extract hash from magnet URI so we can look it up after adding
    let magnetHash: string | null = null
    if (typeof magnetOrBuffer === 'string') {
      form.append('urls', magnetOrBuffer)
      const match = magnetOrBuffer.match(/xt=urn:btih:([a-fA-F0-9]{40})/i)
      if (match) magnetHash = match[1].toLowerCase()
    } else {
      const blob = new Blob([new Uint8Array(magnetOrBuffer)], { type: 'application/x-bittorrent' })
      form.append('torrents', blob, 'upload.torrent')
    }

    await qbt('/torrents/add', { method: 'POST', body: form })

    // If we already know the hash, look it up directly
    if (magnetHash) {
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const list = (await qbt(`/torrents/info?hashes=${magnetHash}`)) as QbtTorrent[]
        if (list.length) return this.mapTorrent(list[0])
      }
      throw new Error('Torrent added but metadata not resolved in time')
    }

    // .torrent file: poll for recently added torrent
    const before = Date.now() / 1000
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const list = (await qbt('/torrents/info')) as QbtTorrent[]
      const recent = list.find((t) => t.added_on >= before - 2)
      if (recent) return this.mapTorrent(recent)
    }
    throw new Error('Torrent added but metadata not resolved in time')
  }

  async remove(hash: string, deleteFiles: boolean): Promise<void> {
    const form = new FormData()
    form.append('hashes', hash)
    form.append('deleteFiles', deleteFiles ? 'true' : 'false')
    await qbt('/torrents/delete', { method: 'POST', body: form })
  }

  async pause(hash: string): Promise<void> {
    const form = new FormData()
    form.append('hashes', hash)
    await qbt('/torrents/pause', { method: 'POST', body: form })
  }

  async resume(hash: string): Promise<void> {
    const form = new FormData()
    form.append('hashes', hash)
    await qbt('/torrents/resume', { method: 'POST', body: form })
  }

  async setSpeedLimits(settings: SpeedSettings): Promise<void> {
    const dl = new FormData()
    dl.append('limit', String(settings.downloadLimit))
    await qbt('/transfer/setDownloadLimit', { method: 'POST', body: dl })

    const ul = new FormData()
    ul.append('limit', String(settings.uploadLimit))
    await qbt('/transfer/setUploadLimit', { method: 'POST', body: ul })
  }

  async getProgress(hash: string): Promise<ProgressPayload | null> {
    const list = (await qbt(`/torrents/info?hashes=${hash}`)) as QbtTorrent[]
    if (!list.length) return null
    const t = list[0]
    return {
      hash: t.hash,
      progress: t.progress,
      downloadSpeed: t.dlspeed,
      uploadSpeed: t.upspeed,
      peers: t.num_seeds,
      eta: t.eta > 8640000 ? -1 : t.eta,
    }
  }

  async getActiveHashes(): Promise<string[]> {
    const list = (await qbt('/torrents/info?filter=active')) as QbtTorrent[]
    return list.map((t) => t.hash)
  }

  async listAll(): Promise<TorrentRecord[]> {
    const list = (await qbt('/torrents/info')) as QbtTorrent[]
    return list.map((t) => this.mapTorrent(t))
  }

  private mapTorrent(t: QbtTorrent): TorrentRecord {
    return {
      id: t.hash,
      name: t.name,
      size: t.size,
      status: mapStatus(t.state),
      progress: t.progress,
      download_dir: t.save_path,
      magnet_uri: t.magnet_uri ?? null,
      added_at: t.added_on * 1000,
    }
  }

  destroy(): Promise<void> {
    return Promise.resolve()
  }
}
