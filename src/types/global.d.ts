import type { logger as LoggerInstance } from '$lib/logger'

interface NostrExtension {
  getPublicKey(): Promise<string>
  signEvent?(event: any): Promise<any>
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>
    decrypt(pubkey: string, ciphertext: string): Promise<string>
  }
}

declare global {
  interface Window {
    nostr?: NostrExtension
  }
  const logger: typeof LoggerInstance
}

export {}
