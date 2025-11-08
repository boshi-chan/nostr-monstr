/**
 * Message Decryption Service
 * Handles automatic decryption of NIP-04, NIP-44, and NIP-59 encrypted messages
 * When user is authenticated, messages are automatically decrypted
 */

import { getNDK } from '$lib/ndk'
import type { NostrEvent } from '$types/nostr'

const DIRECT_MESSAGE_KIND = 4 // NIP-04 (legacy)
const NIP44_KIND = 44 // NIP-44 (modern)
const GIFTWRAP_KIND = 1059 // NIP-59 (giftwrap)

/**
 * Decrypt a direct message event
 * Handles NIP-04 (legacy), NIP-44 (modern), and NIP-59 (giftwrap)
 * 
 * This will prompt the user's signer (Alby, nos2x, etc.) to decrypt
 */
export async function decryptMessage(event: NostrEvent): Promise<string | null> {
  try {
    const ndk = getNDK()
    const signer = ndk.signer

    // Must have a signer to decrypt (will prompt user)
    if (!signer) {
      console.warn('Cannot decrypt: no signer available (user not authenticated)')
      return null
    }

    // Determine who sent the message
    const senderPubkey = event.pubkey
    const recipientPubkey = event.tags.find(t => t[0] === 'p')?.[1]

    // Get our pubkey from signer
    const user = await signer.user()
    if (!user?.pubkey) {
      console.warn('Cannot decrypt: failed to get user pubkey from signer')
      return null
    }

    // Determine the other party (for decryption key derivation)
    let otherPubkey: string | null = null

    if (senderPubkey === user.pubkey) {
      // We sent this message - decrypt with recipient
      otherPubkey = recipientPubkey || null
    } else {
      // We received this message - decrypt with sender
      otherPubkey = senderPubkey
    }

    if (!otherPubkey) {
      console.warn('Cannot determine message recipient/sender for decryption')
      return null
    }

    console.log(`📦 Decrypting message from ${otherPubkey.slice(0, 8)}...`)

    // Handle different encryption types
    let decrypted: string | null = null

    if (event.kind === DIRECT_MESSAGE_KIND) {
      // NIP-04 (legacy) - use signer's decrypt method
      console.log('📦 NIP-04 decryption (will prompt signer)...')
      try {
        // This will prompt the user's signer!
        const counterpart = ndk.getUser({ pubkey: otherPubkey })
        decrypted = await signer.decrypt(counterpart, event.content)
        console.log('✓ NIP-04 message decrypted')
      } catch (err) {
        console.error('Failed to decrypt NIP-04:', err)
        return null
      }
    } else if (event.kind === NIP44_KIND) {
      // NIP-44 (modern) - use signer's decrypt method
      console.log('📦 NIP-44 decryption (will prompt signer)...')
      try {
        // This will prompt the user's signer!
        const counterpart = ndk.getUser({ pubkey: otherPubkey })
        decrypted = await signer.decrypt(counterpart, event.content)
        console.log('✓ NIP-44 message decrypted')
      } catch (err) {
        console.error('Failed to decrypt NIP-44:', err)
        return null
      }
    } else if (event.kind === GIFTWRAP_KIND) {
      // NIP-59 (giftwrap) - use signer's decrypt method
      console.log('📦 NIP-59 giftwrap (will prompt signer)...')
      try {
        // Giftwrap content is encrypted - use signer to decrypt
        const counterpart = ndk.getUser({ pubkey: otherPubkey })
        decrypted = await signer.decrypt(counterpart, event.content)
        console.log('✓ NIP-59 message decrypted')
      } catch (err) {
        console.error('Failed to decrypt NIP-59:', err)
        return null
      }
    } else {
      console.warn(`Unknown message kind: ${event.kind}`)
      return null
    }

    if (!decrypted) {
      console.warn('Decryption returned empty string')
      return null
    }

    console.log('✓ Message decrypted successfully')
    return decrypted
  } catch (err) {
    console.error('Message decryption error:', err)
    return null
  }
}

/**
 * Batch decrypt multiple messages
 */
export async function decryptMessages(events: NostrEvent[]): Promise<Map<string, string>> {
  const decrypted = new Map<string, string>()

  for (const event of events) {
    try {
      const content = await decryptMessage(event)
      if (content) {
        decrypted.set(event.id, content)
      }
    } catch (err) {
      console.error(`Failed to decrypt event ${event.id}:`, err)
    }
  }

  return decrypted
}

/**
 * Check if message is encrypted
 */
export function isEncryptedMessage(event: NostrEvent): boolean {
  return (
    event.kind === DIRECT_MESSAGE_KIND ||
    event.kind === NIP44_KIND ||
    event.kind === GIFTWRAP_KIND
  )
}

/**
 * Get encryption type from event
 */
export function getEncryptionType(event: NostrEvent): 'nip4' | 'nip44' | 'nip59' | 'none' {
  switch (event.kind) {
    case DIRECT_MESSAGE_KIND:
      return 'nip4'
    case NIP44_KIND:
      return 'nip44'
    case GIFTWRAP_KIND:
      return 'nip59'
    default:
      return 'none'
  }
}

/**
 * Cache for decrypted messages
 * Maps event ID to decrypted content
 */
const decryptionCache = new Map<string, string>()

/**
 * Get cached decrypted message
 */
export function getCachedDecryption(eventId: string): string | null {
  return decryptionCache.get(eventId) || null
}

/**
 * Cache a decrypted message
 */
export function cacheDecryption(eventId: string, content: string): void {
  decryptionCache.set(eventId, content)
  
  // Keep cache size manageable
  if (decryptionCache.size > 1000) {
    const firstKey = decryptionCache.keys().next().value
    if (typeof firstKey === 'string') {
      decryptionCache.delete(firstKey)
    }
  }
}

/**
 * Clear decryption cache
 */
export function clearDecryptionCache(): void {
  decryptionCache.clear()
}

/**
 * Decrypt message with caching
 */
export async function decryptMessageCached(event: NostrEvent): Promise<string | null> {
  // Check cache first
  const cached = getCachedDecryption(event.id)
  if (cached) {
    return cached
  }

  // Decrypt and cache
  const decrypted = await decryptMessage(event)
  if (decrypted) {
    cacheDecryption(event.id, decrypted)
  }

  return decrypted
}
