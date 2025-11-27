/**
 * NDK (Nostr Dev Kit) initialization and configuration
 * Provides a clean interface to NDK with proper reactivity
 */

import NDK, { type NDKUser, NDKNip07Signer, NDKPrivateKeySigner, NDKNip46Signer } from '@nostr-dev-kit/ndk'
import { writable } from 'svelte/store'
import { logger } from './logger'
import { setBaseRelayUrls, setUserRelayUrls, markRelaysReady, resetRelayState } from './relay-manager'

// Default relays - can be customized later
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://nostr.mom',
  'wss://nostr.oxtr.dev',
  'wss://relay.nsec.app',  // NIP-46 optimized relay
]

// Global NDK instance
let ndkInstance: NDK | null = null

// Connection state store
export const ndkConnected = writable(false)
export const ndkConnecting = writable(false)
export const ndkError = writable<string | null>(null)

/**
 * Initialize NDK with configuration
 * Optionally pass custom relays, otherwise uses defaults
 */
export async function initNDK(relays: string[] = DEFAULT_RELAYS): Promise<NDK> {
  if (ndkInstance) {
    return ndkInstance
  }

  try {
    setBaseRelayUrls(relays)
    ndkConnecting.set(true)
    ndkError.set(null)

    ndkInstance = new NDK({
      explicitRelayUrls: relays,
      enableOutboxModel: false,
      autoConnectUserRelays: false,
    })

    // Create promise to wait for first relay connection
    let resolveFirstConnection: () => void
    const firstConnectionPromise = new Promise<void>((resolve) => {
      resolveFirstConnection = resolve
    })

    let hasConnected = false

    // Track connection state BEFORE connecting
    ndkInstance.pool.on('relay:connect', (relay: any) => {
      logger.info(`✓ NDK relay connected: ${relay.url}`)
      ndkConnected.set(true)
      ndkConnecting.set(false)

      // Resolve on first connection
      if (!hasConnected) {
        hasConnected = true
        resolveFirstConnection()
      }
    })

    ndkInstance.pool.on('relay:disconnect', (relay: any) => {
      logger.warn(`✗ NDK relay disconnected: ${relay.url}`)
    })

    // Connect to relays
    logger.info('Connecting to NDK relays...', relays)

    // Explicitly add and connect to each relay
    for (const url of relays) {
      const relay = ndkInstance.pool.getRelay(url, true, true)

      relay.connect().catch(err => {
        logger.error(`Failed to connect to ${url}:`, err)
      })
    }

    // Also call ndk.connect() for any additional setup
    await ndkInstance.connect()

    // Wait up to 15 seconds for at least one relay to connect
    const timeoutMs = 15000
    const timeout = new Promise<void>((resolve) =>
      setTimeout(() => {
        logger.warn(`Relay connection timeout after ${timeoutMs}ms - proceeding anyway`)
        resolve()
      }, timeoutMs)
    )

    await Promise.race([firstConnectionPromise, timeout])

    // Check which relays actually connected
    const allRelays = Array.from(ndkInstance.pool.relays.values())

    // Status 5 = connected in NDK
    const connectedRelays = allRelays.filter(relay => relay.status === 5)
    const connectedUrls = connectedRelays.map(r => r.url)

    logger.info(`NDK initialized with ${connectedRelays.length}/${relays.length} relays connected:`, connectedUrls)

    if (connectedRelays.length === 0) {
      logger.warn('No relays connected! Engagement queries will fail.')
    }

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
 * Wait for at least one relay to be connected
 * Useful before making critical queries that need active connections
 * @param timeoutMs Maximum time to wait in milliseconds (default: 5000)
 * @returns true if at least one relay is connected, false if timeout
 */
export async function ensureRelayConnection(timeoutMs = 5000): Promise<boolean> {
  const ndk = getNDK()

  // Check if already connected (status 5 = connected in NDK)
  const connectedRelays = Array.from(ndk.pool.relays.values())
    .filter(relay => relay.status === 5)

  if (connectedRelays.length > 0) {
    return true
  }

  // Wait for connection
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn(`ensureRelayConnection timed out after ${timeoutMs}ms`)
      resolve(false)
    }, timeoutMs)

    const handleConnect = () => {
      clearTimeout(timeout)
      ndk.pool.off('relay:connect', handleConnect)
      resolve(true)
    }

    ndk.pool.on('relay:connect', handleConnect)
  })
}

/**
 * Set NDK signer for authenticated actions
 */
export async function setNDKSigner(signer: NDKNip07Signer | NDKPrivateKeySigner | NDKNip46Signer): Promise<void> {
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

// Reliable relays for NIP-46 communication between app and remote signer
const NIP46_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nsec.app',
  'wss://nos.lol',
]

/**
 * Create Nostr Connect signer for NIP-46 (mobile signers like Amber)
 * This generates a connection URI that should be displayed as QR code
 * @returns The NDKNip46Signer instance and the connection URI
 */
export async function createNostrConnectSigner(relay?: string): Promise<{
  signer: NDKNip46Signer
  uri: string
}> {
  const ndk = getNDK()

  // Use provided relay or primary NIP-46 relay
  // These relays are known to work well for NIP-46 remote signing
  const relayUrl = relay || NIP46_RELAYS[0]

  // Create signer with nostrconnect:// flow
  const signer = NDKNip46Signer.nostrconnect(ndk, relayUrl)

  // The URI to display as QR code
  const uri = signer.nostrConnectUri || ''

  logger.info('Created Nostr Connect signer with URI:', uri)

  return { signer, uri }
}

/**
 * Complete Nostr Connect login after mobile signer approves
 * @param signer The signer instance from createNostrConnectSigner
 * @returns The authenticated user
 */
export async function completeNostrConnectLogin(signer: NDKNip46Signer): Promise<NDKUser> {
  const ndk = getNDK()

  // Set as active signer
  ndk.signer = signer

  // Wait for the remote signer to connect and provide user info
  logger.info('Waiting for Nostr Connect handshake...')
  const user = await signer.blockUntilReadyNostrConnect()

  if (!user.pubkey) {
    throw new Error('Failed to get public key from remote signer')
  }

  // Set activeUser so getCurrentNDKUser() works correctly
  // This is needed for messaging and other features that rely on ndk.activeUser
  ndk.activeUser = user

  logger.info('Nostr Connect login successful:', user.pubkey)
  return user
}

/**
 * Get current authenticated user
 */
export function getCurrentNDKUser(): NDKUser | null {
  const ndk = getNDK()
  const user = ndk.activeUser || null
  if (!user) {
    logger.warn('getCurrentNDKUser: no activeUser set')
  }
  return user
}

/**
 * Logout - clear signer
 */
export function logoutNDK(): void {
  const ndk = getNDK()
  ndk.signer = undefined
}

/**
 * Reload user relays from NIP-65 and connect to them
 * This should be called after login to switch from default relays to user's custom relays
 */
export async function loadUserRelaysAndConnect(): Promise<void> {
  let userRelayUrls: string[] = []
  try {
    if (!ndkInstance) {
      logger.warn('Cannot load user relays - NDK not initialized')
      return
    }

    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      logger.info('No authenticated user - skipping relay reload')
      return
    }

    // Wait for at least one relay to be connected before trying to fetch
    logger.info('Ensuring relay connection before loading user relays...')
    const hasConnection = await ensureRelayConnection(5000)

    if (!hasConnection) {
      logger.warn('No relays connected - cannot fetch NIP-65 relay list. Keeping defaults.')
      return
    }

    logger.info('Loading user relays from NIP-65...')

    // Fetch user's NIP-65 relay list with timeout
    const fetchPromise = ndkInstance.fetchEvent(
      {
        authors: [user.pubkey],
        kinds: [10002],
      },
      { closeOnEose: true }
    )

    // Add 10 second timeout (increased from 5s)
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => {
        logger.warn('NIP-65 fetch timed out after 10s, continuing with default relays')
        resolve(null)
      }, 10000)
    )

    const event = await Promise.race([fetchPromise, timeoutPromise])

    if (!event || !event.tags || event.tags.length === 0) {
      logger.info('No NIP-65 relay list found, keeping default relays')
      return
    }

    // Parse relay URLs from tags
    userRelayUrls = []
    for (const tag of event.tags) {
      if (tag[0] === 'r' && tag[1] && tag[1].startsWith('wss://')) {
        userRelayUrls.push(tag[1])
      }
    }

    if (userRelayUrls.length === 0) {
      logger.info('No valid relays in NIP-65 list, keeping default relays')
      return
    }

    logger.info(`Found ${userRelayUrls.length} relays from NIP-65:`, userRelayUrls)

    // Add user relays to the pool (NDK will handle deduplication)
    for (const url of userRelayUrls) {
      try {
        const relay = ndkInstance.pool.getRelay(url, true, true)
        await relay.connect()
        logger.info(`Connected to user relay: ${url}`)
      } catch (err) {
        logger.warn(`Failed to connect to user relay ${url}:`, err)
      }
    }

    logger.info('User relays loaded and connected')

    // Load user's mute list after relays are connected
    try {
      const { loadMuteList } = await import('./mute')
      await loadMuteList()
    } catch (err) {
      logger.warn('Failed to load mute list:', err)
    }
  } catch (err) {
    logger.error('Failed to load user relays:', err)
  } finally {
    setUserRelayUrls(userRelayUrls)
    markRelaysReady()
  }
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
    resetRelayState()
  }
}

