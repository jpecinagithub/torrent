export type TorrentStatus = 'downloading' | 'seeding' | 'paused' | 'completed'

export interface TorrentRecord {
  id: string           // info hash
  name: string
  size: number         // bytes
  status: TorrentStatus
  progress: number     // 0.0 to 1.0
  download_dir: string
  magnet_uri: string | null
  added_at: number     // unix timestamp ms
}

export interface ProgressPayload {
  hash: string
  progress: number
  downloadSpeed: number  // bytes/s
  uploadSpeed: number    // bytes/s
  peers: number
  eta: number            // seconds, -1 if unknown
}

export interface SpeedSettings {
  downloadLimit: number  // bytes/s, 0 = unlimited
  uploadLimit: number
}
