export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface NostrFilter {
  ids?: string[]
  authors?: string[]
  kinds?: number[]
  since?: number
  until?: number
  limit?: number
  [key: string]: any
}

export interface RelayMessage {
  type: 'EVENT' | 'EOSE' | 'NOTICE' | 'OK' | 'AUTH'
  data?: any
}
