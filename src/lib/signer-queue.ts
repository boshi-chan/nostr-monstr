/**
 * Queued signing and decryption for NIP-46 remote signers
 * Prevents rate limiting by sequentially processing requests with delays
 * For native Amber signer, bypasses queue for instant operations
 */

import { getNDK } from './ndk'
import { getDB } from './db'
import type { NDKUser } from '@nostr-dev-kit/ndk'

/**
 * Check if current signer is native Amber (Intent-based, no queue needed)
 */
function isNativeAmberSigner(): boolean {
  const ndk = getNDK()
  const signer = ndk.signer as any
  const signerName = signer?.constructor?.name
  console.log('[SignerQueue] Checking signer type:', signerName)
  return signerName === 'AmberNativeSigner'
}

// Track if NIP-46 signer is ready
let nip46ReadyPromise: Promise<void> | null = null
let nip46IsReady = false

/**
 * Wait for NIP-46 signer to be ready (RPC connection established)
 * Call this before any decrypt/encrypt operations
 */
export async function nip46Ready(): Promise<void> {
  if (nip46IsReady) return

  if (nip46ReadyPromise) {
    return nip46ReadyPromise
  }

  nip46ReadyPromise = new Promise<void>(async (resolve) => {
    const ndk = getNDK()
    const signer = ndk.signer as any

    if (!signer) {
      console.warn('[SignerQueue] No signer, nip46Ready resolving immediately')
      resolve()
      return
    }

    // Check if it's a NIP-46 signer
    if (signer.constructor.name !== 'NDKNip46Signer') {
      console.log('[SignerQueue] Not a NIP-46 signer, ready immediately')
      nip46IsReady = true
      resolve()
      return
    }

    // For NIP-46 signers, ensure the RPC connection is established
    console.log('[SignerQueue] Waiting for NIP-46 signer to be ready...')

    try {
      // The rpc property handles the WebSocket connection for NIP-46
      if (signer.rpc) {
        // Wait for the RPC to be connected
        await new Promise<void>((rpcResolve) => {
          if (signer.rpc.connected) {
            rpcResolve()
          } else {
            // Give it a moment to connect
            setTimeout(rpcResolve, 1000)
          }
        })
      }

      nip46IsReady = true
      console.log('[SignerQueue] NIP-46 signer is ready')
      resolve()
    } catch (err) {
      console.warn('[SignerQueue] Error waiting for NIP-46 ready:', err)
      resolve() // Resolve anyway to not block
    }
  })

  return nip46ReadyPromise
}

/**
 * Reset NIP-46 ready state (call on logout)
 */
export function resetNip46Ready(): void {
  nip46IsReady = false
  nip46ReadyPromise = null
}

// Decrypt queue
interface DecryptJob {
  user: NDKUser
  ciphertext: string
  scheme: 'nip04' | 'nip44'
  resolve: (value: string | null) => void
}

const decryptQueue: DecryptJob[] = []
let decryptActive = 0
const MAX_DECRYPT_ACTIVE = 2
const DECRYPT_DELAY_MS = 50
const DECRYPT_TIMEOUT_MS = 15000  // 15 second timeout per decrypt

function pumpDecryptQueue(): void {
  if (decryptActive >= MAX_DECRYPT_ACTIVE) return

  const job = decryptQueue.shift()
  if (!job) return

  decryptActive++
  console.log('[SignerQueue] Starting decrypt, active:', decryptActive, 'queued:', decryptQueue.length)

  const ndk = getNDK()
  if (!ndk.signer) {
    console.warn('[SignerQueue] No signer!')
    job.resolve(null)
    decryptActive--
    setTimeout(pumpDecryptQueue, DECRYPT_DELAY_MS)
    return
  }

  console.log('[SignerQueue] Signer type:', ndk.signer.constructor.name)
  console.log('[SignerQueue] Calling decrypt for pubkey:', job.user.pubkey?.slice(0, 8))

  // Log signer details for debugging
  const signerAny = ndk.signer as any
  if (signerAny.relayUrl) {
    console.log('[SignerQueue] Signer relay:', signerAny.relayUrl)
  }
  if (signerAny.remotePubkey) {
    console.log('[SignerQueue] Remote signer pubkey:', signerAny.remotePubkey?.slice(0, 8))
  }

  // Add timeout to prevent hanging
  let completed = false
  const timeoutId = setTimeout(() => {
    if (completed) return
    completed = true
    console.warn('[SignerQueue] Decrypt timed out after', DECRYPT_TIMEOUT_MS, 'ms')
    job.resolve(null)
    decryptActive--
    setTimeout(pumpDecryptQueue, DECRYPT_DELAY_MS)
  }, DECRYPT_TIMEOUT_MS)

  ndk.signer.decrypt(job.user, job.ciphertext, job.scheme)
    .then(decrypted => {
      if (completed) return
      completed = true
      clearTimeout(timeoutId)
      console.log('[SignerQueue] Decrypt success')
      job.resolve(decrypted)
      decryptActive--
      setTimeout(pumpDecryptQueue, DECRYPT_DELAY_MS)
    })
    .catch(err => {
      if (completed) return
      completed = true
      clearTimeout(timeoutId)
      console.warn('[SignerQueue] Decrypt failed:', err)
      job.resolve(null)
      decryptActive--
      setTimeout(pumpDecryptQueue, DECRYPT_DELAY_MS)
    })

  // Pump again immediately to fill remaining slots
  pumpDecryptQueue()
}

export async function queueDecrypt(user: NDKUser, ciphertext: string, scheme: 'nip04' | 'nip44'): Promise<string | null> {
  // For native Amber, bypass queue entirely - Intents are instant
  if (isNativeAmberSigner()) {
    console.log('[SignerQueue] Native Amber detected, bypassing queue')
    try {
      const ndk = getNDK()
      if (!ndk.signer) return null
      const result = await ndk.signer.decrypt(user, ciphertext, scheme)
      console.log('[SignerQueue] Native Amber decrypt success')
      return result
    } catch (err) {
      console.warn('[SignerQueue] Native Amber decrypt failed:', err)
      return null
    }
  }

  // For NIP-46/other signers, use queue to prevent rate limiting
  console.log('[SignerQueue] queueDecrypt called, queue length:', decryptQueue.length, 'active:', decryptActive)
  return new Promise(resolve => {
    decryptQueue.push({ user, ciphertext, scheme, resolve })
    pumpDecryptQueue()
  })
}

// Encrypt queue
interface EncryptJob {
  user: NDKUser
  plaintext: string
  scheme: 'nip04' | 'nip44'
  resolve: (value: string | null) => void
}

const encryptQueue: EncryptJob[] = []
let encryptActive = 0
const MAX_ENCRYPT_ACTIVE = 1
const ENCRYPT_DELAY_MS = 100

async function pumpEncryptQueue(): Promise<void> {
  if (encryptActive >= MAX_ENCRYPT_ACTIVE) return

  const job = encryptQueue.shift()
  if (!job) return

  encryptActive++

  try {
    const ndk = getNDK()
    if (!ndk.signer) {
      job.resolve(null)
    } else {
      const encrypted = await ndk.signer.encrypt(job.user, job.plaintext, job.scheme)
      job.resolve(encrypted)
    }
  } catch (err) {
    console.warn('[SignerQueue] Encrypt failed:', err)
    job.resolve(null)
  }

  encryptActive--
  setTimeout(pumpEncryptQueue, ENCRYPT_DELAY_MS)
}

export async function queueEncrypt(user: NDKUser, plaintext: string, scheme: 'nip04' | 'nip44'): Promise<string | null> {
  // For native Amber, bypass queue entirely - Intents are instant
  if (isNativeAmberSigner()) {
    console.log('[SignerQueue] Native Amber detected for encrypt, bypassing queue')
    try {
      const ndk = getNDK()
      if (!ndk.signer) return null
      const result = await ndk.signer.encrypt(user, plaintext, scheme)
      console.log('[SignerQueue] Native Amber encrypt success')
      return result
    } catch (err) {
      console.warn('[SignerQueue] Native Amber encrypt failed:', err)
      return null
    }
  }

  // For NIP-46/other signers, use queue
  return new Promise(resolve => {
    encryptQueue.push({ user, plaintext, scheme, resolve })
    pumpEncryptQueue()
  })
}

// Message cache
export async function getCachedDecryptedMessage(eventId: string): Promise<string | null> {
  try {
    const db = getDB()
    const cached = await db.get('decryptedMessages', eventId)
    return cached?.content ?? null
  } catch {
    return null
  }
}

export async function cacheDecryptedMessage(eventId: string, content: string): Promise<void> {
  try {
    const db = getDB()
    await db.put('decryptedMessages', {
      id: eventId,
      content,
      timestamp: Date.now()
    })
  } catch (err) {
    console.warn('[SignerQueue] Failed to cache message:', err)
  }
}

// Clear queue (for logout)
export function clearSignerQueues(): void {
  decryptQueue.length = 0
  encryptQueue.length = 0
}
