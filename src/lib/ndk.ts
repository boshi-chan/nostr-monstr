/**
 * NDK (Nostr Dev Kit) initialization and configuration
 * Provides a clean interface to NDK with proper reactivity
 */

import NDK, { NDKUser, NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { writable } from 'svelte/store'

// Default relays - can be customized later
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.primal.net', // Good for long-form content
]

// Global NDK instance
let ndkInstance: NDK | null = null

// Connection state store
export const ndkConnected = writable(false)
export const ndkConnecting = writable(false)
export const ndkError = writable<string | null>(null)

/**
 * Initialize NDK with configuration
 */
export async function initNDK(relays: string[] = DEFAULT_RELAYS): Promise<NDK> {
  if (ndkInstance) {
    return ndkInstance
  }

  try {
    ndkConnecting.set(true)
    ndkError.set(null)

    ndkInstance = new NDK({
      explicitRelayUrls: relays,
      enableOutboxModel: false,
      autoConnectUserRelays: false,
    })
    
    // Track connection state BEFORE connecting
    ndkInstance.pool.on('relay:connect', () => {
      logger.info('✓ NDK relay connected')
      ndkConnected.set(true)
      ndkConnecting.set(false)
    })

    ndkInstance.pool.on('relay:disconnect', () => {
      logger.info('✗ NDK relay disconnected')
    })

    // Connect to relays
    logger.info('Connecting to NDK relays...', relays)
    await ndkInstance.connect()
    logger.info('NDK connect() completed')

    return ndkInstance
  } catch (err) {
    const errorMsg = `NDK initialization failed: ${err}`
    logger.error(errorMsg)
    ndkError.set(errorMsg)
    ndkConnecting.set(false)
    throw err
  }
}

/**
 * Get the current NDK instance
 */
export function getNDK(): NDK {
  if (!ndkInstance) {
    throw new Error('NDK not initialized. Call initNDK() first.')
  }
  return ndkInstance
}

/**
 * Set NDK signer for authenticated actions
 */
export async function setNDKSigner(signer: NDKNip07Signer | NDKPrivateKeySigner): Promise<void> {
  const ndk = getNDK()
  ndk.signer = signer
}

/**
 * Login with NIP-07 browser extension
 */
export async function loginWithNIP07(): Promise<NDKUser> {
  const ndk = getNDK()

  if (!window.nostr) {
    throw new Error('No Nostr extension detected')
  }

  const signer = new NDKNip07Signer()
  ndk.signer = signer

  const user = await signer.user()

  if (!user.pubkey) {
    throw new Error('Failed to get public key from extension')
  }

  return user
}

/**
 * Login with private key (for testing/development)
 */
export async function loginWithPrivateKey(privateKey: string): Promise<NDKUser> {
  const ndk = getNDK()

  const signer = new NDKPrivateKeySigner(privateKey)
  ndk.signer = signer

  const user = await signer.user()

  if (!user.pubkey) {
    throw new Error('Failed to derive public key from private key')
  }

  return user
}

/**
 * Get current authenticated user
 */
export function getCurrentNDKUser(): NDKUser | null {
  const ndk = getNDK()
  return ndk.activeUser || null
}

/**
 * Logout - clear signer
 */
export function logoutNDK(): void {
  const ndk = getNDK()
  ndk.signer = undefined
}

/**
 * Cleanup and disconnect
 */
export function disconnectNDK(): void {
  if (ndkInstance) {
    // Close all relay connections
    for (const relay of ndkInstance.pool.relays.values()) {
      relay.disconnect()
    }
    ndkInstance = null
    ndkConnected.set(false)
  }
}

