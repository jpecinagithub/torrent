export type TorrentStatus = 'downloading' | 'seeding' | 'paused' | 'completed'

export interface TorrentRow {
  id: string
  name: string
  size: number
  status: TorrentStatus
  progress: number
  download_dir: string
  magnet_uri: string | null
  added_at: number
  downloadSpeed: number
  uploadSpeed: number
  peers: number
  eta: number
  hasError: boolean
  errorMessage: string
}

export interface ProgressEvent {
  hash: string
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  peers: number
  eta: number
}
