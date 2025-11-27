/**
 * Relay management for Nostr
 * Handles relay configuration, import from NIP-65, and publishing
 */

import { getNDK, getCurrentNDKUser } from './ndk'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { logger } from '$lib/logger'
import { publishToConfiguredRelays } from './relay-publisher'

export interface RelayConfig {
  url: string
  read: boolean
  write: boolean
}

/**
 * Get all relays from NIP-65 (kind 10002) for a specific pubkey
 */
export async function getRelaysForPubkey(pubkey: string): Promise<string[]> {
  try {
    const ndk = getNDK()
    const event = await ndk.fetchEvent(
      {
        authors: [pubkey],
        kinds: [10002],
      },
      { closeOnEose: true }
    )

    if (!event) {
      return []
    }

    const relays: string[] = []

    for (const tag of event.tags) {
      if (tag[0] !== 'r' || !tag[1]) continue
      // Only include read relays (where engagement would be stored)
      const isReadRelay = tag[2] !== 'write'
      if (isReadRelay) {
        relays.push(tag[1])
      }
    }

    return relays
  } catch (err) {
    logger.warn('Failed to fetch relays for pubkey:', pubkey.slice(0, 8), err)
    return []
  }
}

/**
 * Get all relays from NIP-65 (kind 10002) for current user
 */
export async function getRelaysFromNIP65(): Promise<RelayConfig[]> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      throw new Error('Not authenticated')
    }

    const ndk = getNDK()
    const event = await ndk.fetchEvent(
      {
        authors: [user.pubkey],
        kinds: [10002],
      },
      { closeOnEose: true }
    )

    if (!event) {
      return []
    }

    const relays: RelayConfig[] = []

    for (const tag of event.tags) {
      if (tag[0] !== 'r' || !tag[1]) continue

      const url = tag[1]
      const read = tag[2] !== 'write'
      const write = tag[2] !== 'read'

      relays.push({ url, read, write })
    }

    return relays
  } catch (err) {
    logger.error('Failed to fetch relays from NIP-65:', err)
    return []
  }
}

/**
 * Publish relays to NIP-65 (kind 10002)
 * IMPORTANT: This NEVER publishes a 0-length contact list!
 */
export async function publishRelays(relays: RelayConfig[]): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      throw new Error('Not authenticated')
    }

    // CRITICAL: Never publish empty relay list!
    if (!relays || relays.length === 0) {
      throw new Error('Cannot publish empty relay list - this would nuke your configuration!')
    }

    // Validate all relays
    for (const relay of relays) {
      if (!relay.url || !relay.url.startsWith('wss://')) {
        throw new Error(`Invalid relay URL: ${relay.url}. Must be wss:// URL.`)
      }
      if (!relay.read && !relay.write) {
        throw new Error(`Relay ${relay.url} must have read or write enabled`)
      }
    }

    const ndk = getNDK()
    if (!ndk.signer) {
      throw new Error('No signer available')
    }

    const event = new NDKEvent(ndk, {
      kind: 10002,
      content: '',
      tags: relays.map(r => {
        const tag = ['r', r.url]
        if (!r.read && r.write) {
          tag.push('write')
        } else if (r.read && !r.write) {
          tag.push('read')
        }
        return tag
      }),
    })

    await event.sign(ndk.signer)
    await publishToConfiguredRelays(event)

    logger.info('âœ“ Relays published successfully')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to publish relays:', errorMsg)
    throw new Error(`Failed to publish relays: ${errorMsg}`)
  }
}

/**
 * Get default relays
 */
export function getDefaultRelays(): RelayConfig[] {
  return [
    { url: 'wss://relay.damus.io', read: true, write: true },
    { url: 'wss://relay.nostr.band', read: true, write: true },
    { url: 'wss://nos.lol', read: true, write: true },
    { url: 'wss://relay.snort.social', read: true, write: true },
  ]
}

/**
 * Validate relay URL
 */
export function isValidRelayUrl(url: string): boolean {
  try {
    if (!url.startsWith('wss://')) {
      return false
    }
    new URL(url)
    return true
  } catch {
    return false
  }
}

