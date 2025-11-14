/**
 * Message Decryption Service
 * Handles automatic decryption of NIP-04, NIP-44, NIP-17, and NIP-59 encrypted messages
 * When user is authenticated, messages are automatically decrypted
 *
 * NIP-17 Gift Wrap Structure:
 * - Outer: kind:1059 (gift wrap) encrypted TO RECIPIENT with random ephemeral sender key
 * - Middle: kind:14 (seal) encrypted TO RECIPIENT with real sender key
 * - Inner: kind:1059 (rumor/unsigned message) - the actual content
 * 
 * CRITICAL: Gift wrap is encrypted TO THE RECIPIENT, not from the ephemeral key!
 */

import { getNDK } from '$lib/ndk'
import type { NostrEvent } from '$types/nostr'

const DIRECT_MESSAGE_KIND = 4 // NIP-04 (legacy)
const NIP44_KIND = 44 // NIP-44 (modern)
const SEAL_KIND = 14 // NIP-17 (seal - middle layer)
const GIFTWRAP_KIND = 1059 // NIP-17/59 (giftwrap - outer layer)

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
      logger.warn('Cannot decrypt: no signer available (user not authenticated)')
      return null
    }

    // Determine who sent the message
    const senderPubkey = event.pubkey
    const recipientPubkey = event.tags.find(t => t[0] === 'p')?.[1]

    // Get our pubkey from signer
    const user = await signer.user()
    if (!user?.pubkey) {
      logger.warn('Cannot decrypt: failed to get user pubkey from signer')
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
      logger.warn('Cannot determine message recipient/sender for decryption')
      return null
    }

    logger.info(`📦 Decrypting message from ${otherPubkey.slice(0, 8)}...`)

    // Handle different encryption types
    let decrypted: string | null = null

    if (event.kind === DIRECT_MESSAGE_KIND) {
      // NIP-04 (legacy) - use signer's decrypt method
      logger.info('📦 NIP-04 decryption (will prompt signer)...')
      try {
        // This will prompt the user's signer!
        const counterpart = ndk.getUser({ pubkey: otherPubkey })
        decrypted = await signer.decrypt(counterpart, event.content)
        logger.info('✓ NIP-04 message decrypted')
      } catch (err) {
        logger.error('Failed to decrypt NIP-04:', err)
        return null
      }
    } else if (event.kind === NIP44_KIND) {
      // NIP-44 (modern) - use signer's decrypt method
      logger.info('📦 NIP-44 decryption (will prompt signer)...')
      try {
        // This will prompt the user's signer!
        const counterpart = ndk.getUser({ pubkey: otherPubkey })
        decrypted = await signer.decrypt(counterpart, event.content)
        logger.info('✓ NIP-44 message decrypted')
      } catch (err) {
        logger.error('Failed to decrypt NIP-44:', err)
        return null
      }
    } else if (event.kind === GIFTWRAP_KIND) {
      // NIP-17 / NIP-59 (giftwrap) - two-layer unwrapping
      logger.info('📦 NIP-17/59 giftwrap (will prompt signer)...')
      try {
        // Step 1: Verify we are the recipient
        const taggedRecipient = event.tags.find(t => t[0] === 'p')?.[1]
        
        if (!taggedRecipient) {
          logger.warn('Gift wrap missing recipient tag')
          return null
        }
        
        if (taggedRecipient !== user.pubkey) {
          logger.warn('Gift wrap not addressed to us')
          return null
        }
        
        logger.info(`📦 Decrypting gift wrap addressed to us (ephemeral sender: ${event.pubkey.slice(0, 8)})`)
        
        // Step 2: Decrypt outer gift wrap
        // CRITICAL: The gift wrap is encrypted TO US (the recipient)
        // We use OUR pubkey to decrypt, not the ephemeral sender key
        const recipient = ndk.getUser({ pubkey: user.pubkey })
        const sealJson = await signer.decrypt(recipient, event.content)
        logger.info('✓ Gift wrap outer layer decrypted')

        // Step 3: Parse the seal (middle layer)
        const seal = JSON.parse(sealJson) as NostrEvent

        // Verify it's actually a seal
        if (seal.kind === SEAL_KIND) {
          // This is NIP-17 with seal layer
          logger.info('📦 NIP-17 seal detected, unwrapping...')
          logger.info(`   Real sender: ${seal.pubkey.slice(0, 8)}`)

          // Step 4: Decrypt seal to get rumor
          // The seal is encrypted from the REAL sender to us
          const realSender = ndk.getUser({ pubkey: seal.pubkey })
          const rumorJson = await signer.decrypt(realSender, seal.content)
          logger.info('✓ NIP-17 seal decrypted')

          // Step 5: Parse the rumor (actual message)
          const rumor = JSON.parse(rumorJson) as Partial<NostrEvent>
          decrypted = rumor.content || null
          logger.info('✓ NIP-17 message fully unwrapped:', decrypted?.slice(0, 30) + '...')
        } else {
          // Fallback: treat seal content as the message (NIP-59 style)
          decrypted = seal.content || sealJson
          logger.info('✓ NIP-59 message decrypted (no seal layer)')
        }
      } catch (err) {
        logger.error('Failed to decrypt NIP-17/59:', err)
        logger.error('  Event ID:', event.id.slice(0, 8))
        logger.error('  Ephemeral pubkey:', event.pubkey.slice(0, 8))
        logger.error('  Tagged recipient:', event.tags.find(t => t[0] === 'p')?.[1]?.slice(0, 8))
        return null
      }
    } else {
      logger.warn(`Unknown message kind: ${event.kind}`)
      return null
    }

    if (!decrypted) {
      logger.warn('Decryption returned empty string')
      return null
    }

    logger.info('✓ Message decrypted successfully')
    return decrypted
  } catch (err) {
    logger.error('Message decryption error:', err)
    return null
  }
}

/**
 * Decrypt message and extract metadata (real sender for NIP-17)
 * Returns both decrypted content and the real sender pubkey
 */
export async function decryptMessageWithMetadata(event: NostrEvent): Promise<{
  content: string
  realSenderPubkey: string
} | null> {
  try {
    const ndk = getNDK()
    const signer = ndk.signer

    if (!signer) {
      logger.warn('Cannot decrypt: no signer available')
      return null
    }

    const user = await signer.user()
    if (!user?.pubkey) {
      logger.warn('Cannot decrypt: failed to get user pubkey')
      return null
    }

    // For NIP-17 gift wraps, we need to unwrap to get the real sender
    if (event.kind === GIFTWRAP_KIND) {
      try {
        // Step 1: Verify we are the recipient
        const recipientPubkey = event.tags.find(t => t[0] === 'p')?.[1]
        
        if (!recipientPubkey || recipientPubkey !== user.pubkey) {
          logger.warn('Gift wrap not for us:', {
            tagged: recipientPubkey?.slice(0, 8),
            us: user.pubkey.slice(0, 8),
          })
          return null
        }
        
        logger.info(`📦 Unwrapping gift wrap for metadata (ephemeral: ${event.pubkey.slice(0, 8)})`)
        
        // Step 2: Decrypt outer gift wrap
        // CRITICAL: The gift wrap is encrypted TO US (the recipient)
        const recipient = ndk.getUser({ pubkey: user.pubkey })
        const sealJson = await signer.decrypt(recipient, event.content)
        logger.info('✓ Gift wrap decrypted')

        // Step 3: Parse seal
        const seal = JSON.parse(sealJson) as NostrEvent

        if (seal.kind === SEAL_KIND) {
          // NIP-17: Real sender is in the seal
          const realSenderPubkey = seal.pubkey
          logger.info(`   Real sender identified: ${realSenderPubkey.slice(0, 8)}`)

          // Step 4: Decrypt seal to get rumor
          // The seal is encrypted from the REAL sender to us
          const realSender = ndk.getUser({ pubkey: realSenderPubkey })
          const rumorJson = await signer.decrypt(realSender, seal.content)
          logger.info('✓ Seal decrypted')

          // Step 5: Parse rumor
          const rumor = JSON.parse(rumorJson) as Partial<NostrEvent>
          const content = rumor.content || ''

          logger.info('✓ Gift wrap fully unwrapped:', {
            realSender: realSenderPubkey.slice(0, 8),
            contentPreview: content.slice(0, 30),
          })

          return {
            content,
            realSenderPubkey,
          }
        } else {
          // NIP-59: Use seal pubkey as sender
          logger.info('âš ï¸  No seal layer found (NIP-59 style)')
          return {
            content: seal.content || sealJson,
            realSenderPubkey: seal.pubkey,
          }
        }
      } catch (err) {
        logger.error('Failed to decrypt gift wrap:', err)
        return null
      }
    } else {
      // For NIP-04 and NIP-44, sender is in event.pubkey
      const content = await decryptMessage(event)
      if (!content) return null

      return {
        content,
        realSenderPubkey: event.pubkey,
      }
    }
  } catch (err) {
    logger.error('Decrypt with metadata error:', err)
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
      logger.error(`Failed to decrypt event ${event.id}:`, err)
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
export function getEncryptionType(event: NostrEvent): 'nip4' | 'nip44' | 'nip17' | 'nip59' | 'none' {
  switch (event.kind) {
    case DIRECT_MESSAGE_KIND:
      return 'nip4'
    case NIP44_KIND:
      return 'nip44'
    case SEAL_KIND:
      return 'nip17' // Seal indicates NIP-17
    case GIFTWRAP_KIND:
      return 'nip17' // Gift wrap - assume NIP-17 (will fallback to NIP-59 if no seal)
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

