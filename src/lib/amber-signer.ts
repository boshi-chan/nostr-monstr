/**
 * Native Amber Signer Integration
 * Uses Android Intents for direct IPC with Amber app (bypasses relay-based NIP-46)
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { NDKSigner, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'
import { getNDK } from './ndk'

// Define the plugin interface
interface AmberSignerPlugin {
  isAmberInstalled(): Promise<AmberStatus>
  getAmberStatus?: () => Promise<AmberStatus>
  getCachedPubkey?: () => Promise<{ pubkey?: string | null }>
  getPublicKey(): Promise<{ pubkey: string }>
  signEvent(options: { event: string }): Promise<{ signature: string; event?: string }>
  nip04Encrypt(options: { plaintext: string; pubkey: string }): Promise<{ ciphertext: string }>
  nip04Decrypt(options: { ciphertext: string; pubkey: string }): Promise<{ plaintext: string }>
  nip44Encrypt(options: { plaintext: string; pubkey: string }): Promise<{ ciphertext: string }>
  nip44Decrypt(options: { ciphertext: string; pubkey: string }): Promise<{ plaintext: string }>
}

export type AmberStatus = {
  installed: boolean
  packageFound?: boolean
  intentAvailable?: boolean
  versionName?: string
  versionCode?: number
}

// Register the native plugin
const AmberSigner = registerPlugin<AmberSignerPlugin>('AmberSigner')

/**
 * Check if we're running on Android in Capacitor
 */
export function isCapacitorAndroid(): boolean {
  const platform = Capacitor.getPlatform()
  const result = platform === 'android'
  console.log('[AmberSigner] isCapacitorAndroid platform check:', platform, 'result:', result)
  return result
}

function normalizePubkey(pubkey: string): string {
  let value = pubkey
  if (value.startsWith('npub')) {
    try {
      const decoded = nip19.decode(value)
      if (decoded.type === 'npub') {
        if (typeof decoded.data === 'string') {
          value = decoded.data
        } else if (decoded.data instanceof Uint8Array) {
          value = Array.from(decoded.data)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
        }
      }
    } catch (err) {
      console.warn('[AmberSigner] Failed to decode npub', err)
    }
  }
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`Amber returned invalid pubkey: ${pubkey}`)
  }
  return value.toLowerCase()
}

async function fetchAmberStatus(): Promise<AmberStatus> {
  if (!isCapacitorAndroid()) {
    return { installed: false }
  }

  try {
    const pluginAny = AmberSigner as AmberSignerPlugin
    if (typeof pluginAny.getAmberStatus === 'function') {
      return await pluginAny.getAmberStatus()
    }
    return await pluginAny.isAmberInstalled()
  } catch (err) {
    console.warn('[AmberSigner] Failed to query Amber status:', err)
    return { installed: false }
  }
}

/**
 * Check if Amber signer app is installed
 */
export async function getAmberInstallStatus(): Promise<{ installed: boolean; packageFound?: boolean; intentAvailable?: boolean }> {
  const status = await fetchAmberStatus()
  console.log('[AmberSigner] Amber status:', status)
  return status
}

export async function isAmberInstalled(): Promise<boolean> {
  const status = await getAmberInstallStatus()
  return status.installed
}

export async function pingAmber(): Promise<boolean> {
  if (!isCapacitorAndroid()) return false
  try {
    const pluginAny = AmberSigner as AmberSignerPlugin
    if (typeof pluginAny.pingAmber === 'function') {
      const result = await pluginAny.pingAmber()
      return Boolean(result?.ready ?? result?.installed ?? false)
    }
  } catch (err) {
    console.warn('[AmberSigner] pingAmber failed via plugin:', err)
  }
  const status = await fetchAmberStatus()
  return status.installed
}

export async function getCachedAmberPubkey(): Promise<string | null> {
  if (!isCapacitorAndroid()) return null
  try {
    const pluginAny = AmberSigner as AmberSignerPlugin
    if (typeof pluginAny.getCachedPubkey !== 'function') return null
    const result = await pluginAny.getCachedPubkey()
    const pubkey = result?.pubkey
    if (!pubkey) return null
    try {
      return normalizePubkey(pubkey)
    } catch (err) {
      console.warn('[AmberSigner] Cached pubkey invalid:', err)
      return null
    }
  } catch (err) {
    console.warn('[AmberSigner] Failed to read cached pubkey:', err)
    return null
  }
}

/**
 * NDK-compatible signer that uses native Amber Intents
 * This replaces NDKNip46Signer for Android devices with Amber installed
 */
export class AmberNativeSigner implements NDKSigner {
  private _pubkey: string | null = null
  private _user: NDKUser | null = null

  constructor(cachedPubkey?: string) {
    if (cachedPubkey) {
      try {
        this._pubkey = normalizePubkey(cachedPubkey)
      } catch (err) {
        console.warn('[AmberSigner] Ignoring invalid cached pubkey:', err)
        this._pubkey = null
      }
    }
    console.log('[AmberSigner] Creating native Amber signer')
  }

  /**
   * Get user's public key from Amber
   */
  async user(): Promise<NDKUser> {
    if (!this._user) {
      const pubkey = this._pubkey ?? await this.getPublicKey()
      const ndk = getNDK()
      this._user = ndk.getUser({ pubkey })
    }
    return this._user
  }

  /**
   * Get public key, requesting from Amber if needed
   */
  private async getPublicKey(): Promise<string> {
    if (this._pubkey) {
      return this._pubkey
    }

    console.log('[AmberSigner] Requesting public key from Amber')
    const result = await AmberSigner.getPublicKey()
    const pubkey = normalizePubkey(result.pubkey)
    this._pubkey = pubkey
    console.log('[AmberSigner] Got public key:', this._pubkey.slice(0, 8) + '...')

    return this._pubkey
  }

  /**
   * Sign an event with Amber
   */
  async sign(event: NostrEvent): Promise<string> {
    console.log('[AmberSigner] Signing event kind:', event.kind)

    // Prepare unsigned event JSON (without id/sig)
    const unsignedEvent = {
      pubkey: event.pubkey || await this.getPublicKey(),
      created_at: event.created_at || Math.floor(Date.now() / 1000),
      kind: event.kind,
      tags: event.tags || [],
      content: event.content || '',
    }

    const eventJson = JSON.stringify(unsignedEvent)
    const result = await AmberSigner.signEvent({ event: eventJson })

    console.log('[AmberSigner] Event signed successfully')
    return result.signature
  }

  /**
   * Encrypt a message for a user
   */
  async encrypt(user: NDKUser, plaintext: string, scheme: 'nip04' | 'nip44' = 'nip04'): Promise<string> {
    const pubkey = user.pubkey
    console.log('[AmberSigner] Encrypting for:', pubkey.slice(0, 8) + '...', 'scheme:', scheme)

    let result
    if (scheme === 'nip44') {
      result = await AmberSigner.nip44Encrypt({ plaintext, pubkey })
    } else {
      result = await AmberSigner.nip04Encrypt({ plaintext, pubkey })
    }

    console.log('[AmberSigner] Encryption successful')
    return result.ciphertext
  }

  /**
   * Decrypt a message from a user
   */
  async decrypt(user: NDKUser, ciphertext: string, scheme: 'nip04' | 'nip44' = 'nip04'): Promise<string> {
    const pubkey = user.pubkey
    console.log('[AmberSigner] Decrypting from:', pubkey.slice(0, 8) + '...', 'scheme:', scheme)

    let result
    if (scheme === 'nip44') {
      result = await AmberSigner.nip44Decrypt({ ciphertext, pubkey })
    } else {
      result = await AmberSigner.nip04Decrypt({ ciphertext, pubkey })
    }

    console.log('[AmberSigner] Decryption successful')
    return result.plaintext
  }

  /**
   * Block until signer is ready (immediate for native Amber)
   */
  async blockUntilReady(): Promise<NDKUser> {
    return this.user()
  }

  /**
   * Get relay URLs (not applicable for native Amber)
   */
  relays(): string[] {
    return []
  }
}

/**
 * Login with native Amber signer
 * Returns the user's public key and sets up the signer
 */
export async function loginWithAmber(options?: { force?: boolean }): Promise<{ pubkey: string; signer: AmberNativeSigner }> {
  if (!isCapacitorAndroid()) {
    throw new Error('Amber native signing is only available on Android')
  }

  const force = options?.force ?? false

  if (!force) {
    const installed = await isAmberInstalled()
    if (!installed) {
      throw new Error('Amber is not installed on this device')
    }
  }

  console.log('[AmberSigner] Starting native Amber login')

  const signer = new AmberNativeSigner()
  const user = await signer.user()

  // Set as NDK signer
  const ndk = getNDK()
  ndk.signer = signer
  ndk.activeUser = user

  console.log('[AmberSigner] Login complete, pubkey:', user.pubkey.slice(0, 8) + '...')

  return {
    pubkey: user.pubkey,
    signer,
  }
}
