import { writable, derived } from 'svelte/store'

/**
 * Nostr Wallet Connect (NWC) state management
 */

export interface NWCConnection {
  walletPubkey: string
  relay: string
  secret: string
  connectedAt: number
}

export interface ZapTarget {
  eventId: string
  recipientPubkey: string
  recipientName?: string
  recipientLnurl?: string
}

const NWC_STORAGE_KEY = 'monstr_nwc_connection'

/**
 * Load NWC connection from localStorage
 */
function loadNWCConnection(): NWCConnection | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(NWC_STORAGE_KEY)
    if (!stored) return null

    const parsed = JSON.parse(stored)
    if (!parsed.walletPubkey || !parsed.relay || !parsed.secret) return null

    return parsed as NWCConnection
  } catch (err) {
    console.warn('Failed to load NWC connection from localStorage:', err)
    return null
  }
}

/**
 * Save NWC connection to localStorage
 */
function saveNWCConnection(connection: NWCConnection | null): void {
  if (typeof window === 'undefined') return

  try {
    if (connection) {
      window.localStorage.setItem(NWC_STORAGE_KEY, JSON.stringify(connection))
    } else {
      window.localStorage.removeItem(NWC_STORAGE_KEY)
    }
  } catch (err) {
    console.warn('Failed to save NWC connection to localStorage:', err)
  }
}

/**
 * NWC connection store
 */
export const nwcConnection = writable<NWCConnection | null>(loadNWCConnection())

// Persist to localStorage whenever connection changes
nwcConnection.subscribe(conn => {
  saveNWCConnection(conn)
})

/**
 * Whether NWC is connected
 */
export const nwcConnected = derived(nwcConnection, $conn => $conn !== null)

/**
 * Zap modal state
 */
export const showZapModal = writable<boolean>(false)
export const zapTarget = writable<ZapTarget | null>(null)

/**
 * Set NWC connection from nostr+walletconnect:// URI
 */
export function setNWCFromURI(uri: string): boolean {
  try {
    // Remove the nostr+walletconnect:// protocol
    if (!uri.startsWith('nostr+walletconnect://')) {
      throw new Error('Invalid NWC URI: must start with nostr+walletconnect://')
    }

    // Extract parts: nostr+walletconnect://pubkey?relay=wss://...&secret=...
    const withoutProtocol = uri.replace('nostr+walletconnect://', '')
    const [pubkeyPart, queryPart] = withoutProtocol.split('?')

    if (!pubkeyPart || !queryPart) {
      throw new Error('Invalid NWC URI format')
    }

    const walletPubkey = pubkeyPart.trim()

    // Parse query parameters manually to handle relay URLs properly
    const params = new URLSearchParams(queryPart)
    const relay = params.get('relay')
    const secret = params.get('secret')

    if (!walletPubkey || !relay || !secret) {
      throw new Error('Invalid NWC URI: missing required parameters (pubkey, relay, or secret)')
    }

    console.log('[NWC] Parsed connection:', {
      walletPubkey: walletPubkey.slice(0, 8) + '...',
      relay,
      hasSecret: !!secret
    })

    nwcConnection.set({
      walletPubkey,
      relay,
      secret,
      connectedAt: Date.now(),
    })

    return true
  } catch (err) {
    console.error('Failed to parse NWC URI:', err)
    return false
  }
}

/**
 * Disconnect NWC
 */
export function disconnectNWC(): void {
  nwcConnection.set(null)
}

/**
 * Open zap modal for an event
 */
export function openZapModal(target: ZapTarget): void {
  zapTarget.set(target)
  showZapModal.set(true)
}

/**
 * Close zap modal
 */
export function closeZapModal(): void {
  showZapModal.set(false)
  zapTarget.set(null)
}
