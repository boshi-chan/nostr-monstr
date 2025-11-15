import { writable, derived } from 'svelte/store'
import { encryptWalletData, decryptWalletData } from '$lib/crypto'
import { requireWalletMasterKey, readWalletMasterKey } from '$lib/wallet/lazy'

/**
 * Nostr Wallet Connect (NWC) state management
 */

export interface NWCConnection {
  walletPubkey: string
  relay: string
  secret: string
  connectedAt: number
}

interface EncryptedSecretPayload {
  encryptedData: string
  iv: string
  salt: string
}

interface StoredNWCConnection {
  walletPubkey: string
  relay: string
  encryptedSecret: EncryptedSecretPayload
  connectedAt: number
}

export interface ZapTarget {
  eventId: string
  recipientPubkey: string
  recipientName?: string
  recipientLnurl?: string
}

const NWC_STORAGE_KEY = 'monstr_nwc_connection'

function loadStoredNwcConnection(): StoredNWCConnection | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(NWC_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.walletPubkey || !parsed.relay || !parsed.encryptedSecret) return null
    return parsed as StoredNWCConnection
  } catch (err) {
    logger.warn('Failed to load NWC connection from storage:', err)
    return null
  }
}

function saveStoredNwcConnection(connection: StoredNWCConnection | null): void {
  if (typeof window === 'undefined') return
  try {
    if (connection) {
      window.localStorage.setItem(NWC_STORAGE_KEY, JSON.stringify(connection))
    } else {
      window.localStorage.removeItem(NWC_STORAGE_KEY)
    }
  } catch (err) {
    logger.warn('Failed to persist NWC connection:', err)
  }
}

let encryptedNwcSnapshot: StoredNWCConnection | null =
  typeof window !== 'undefined' ? loadStoredNwcConnection() : null

export const nwcConnection = writable<NWCConnection | null>(null)

async function unlockStoredNwcConnection(options?: { silent?: boolean }): Promise<boolean> {
  if (!encryptedNwcSnapshot) return false
  const allowCancel = options?.silent !== false
  const masterKey = await readWalletMasterKey({ allowCancel })
  if (!masterKey) {
    if (!allowCancel) {
      logger.warn('NWC unlock cancelled by user')
    }
    return false
  }
  try {
    const secret = await decryptWalletData(
      encryptedNwcSnapshot.encryptedSecret.encryptedData,
      encryptedNwcSnapshot.encryptedSecret.iv,
      encryptedNwcSnapshot.encryptedSecret.salt,
      masterKey
    )
    nwcConnection.set({
      walletPubkey: encryptedNwcSnapshot.walletPubkey,
      relay: encryptedNwcSnapshot.relay,
      secret,
      connectedAt: encryptedNwcSnapshot.connectedAt,
    })
    return true
  } catch (err) {
    logger.error('Failed to decrypt stored NWC connection, clearing it', err)
    encryptedNwcSnapshot = null
    saveStoredNwcConnection(null)
    return false
  }
}

if (typeof window !== 'undefined' && encryptedNwcSnapshot) {
  void unlockStoredNwcConnection({ silent: true })
}

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
export async function setNWCFromURI(uri: string): Promise<boolean> {
  try {
    if (!uri.startsWith('nostr+walletconnect://')) {
      throw new Error('Invalid NWC URI: must start with nostr+walletconnect://')
    }

    const withoutProtocol = uri.replace('nostr+walletconnect://', '')
    const [pubkeyPart, queryPart] = withoutProtocol.split('?')

    if (!pubkeyPart || !queryPart) {
      throw new Error('Invalid NWC URI format')
    }

    const walletPubkey = pubkeyPart.trim()
    const params = new URLSearchParams(queryPart)
    const relay = params.get('relay')
    const secret = params.get('secret')

    if (!walletPubkey || !relay || !secret) {
      throw new Error('Invalid NWC URI: missing required parameters (pubkey, relay, or secret)')
    }

    const masterKey = await requireWalletMasterKey()
    const encryptedSecret = await encryptWalletData(secret, masterKey)
    const snapshot: StoredNWCConnection = {
      walletPubkey,
      relay,
      encryptedSecret,
      connectedAt: Date.now(),
    }

    encryptedNwcSnapshot = snapshot
    saveStoredNwcConnection(snapshot)

    nwcConnection.set({
      walletPubkey,
      relay,
      secret,
      connectedAt: snapshot.connectedAt,
    })

    logger.info('[NWC] Wallet connected via NWC.')
    return true
  } catch (err) {
    logger.error('Failed to connect NWC wallet:', err)
    return false
  }
}

/**
 * Disconnect NWC
 */
export function disconnectNWC(): void {
  encryptedNwcSnapshot = null
  saveStoredNwcConnection(null)
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

