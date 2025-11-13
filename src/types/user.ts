export interface User {
  pubkey: string
  privateKey?: string
  name?: string
  display_name?: string
  picture?: string
  about?: string
  nip05?: string
  website?: string
}

export interface UserProfile extends User {
  followers: number
  following: number
  notes: number
  followList?: string[] // Array of pubkeys this user follows
}

export interface UserMetadata {
  name?: string
  display_name?: string
  about?: string
  picture?: string
  banner?: string
  nip05?: string
  website?: string
  lud06?: string
  lud16?: string
  monero_address?: string
  [key: string]: any
}
