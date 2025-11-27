/**
 * Mute/Block functionality for Nostr
 * Handles NIP-51 mute lists (kind 10000)
 *
 * Nostr uses "muting" rather than "blocking" since it's a decentralized protocol.
 * Muting is client-side filtering - you won't see their content, but they can still see yours.
 *
 * NIP-51 defines:
 * - Kind 10000: Mute list (public or private)
 * - 'p' tags: muted public keys
 * - 'e' tags: muted events (threads)
 * - 't' tags: muted hashtags
 * - 'word' tags: muted words/phrases
 */

import { getNDK, getCurrentNDKUser } from './ndk'
import { get } from 'svelte/store'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { publishToConfiguredRelays } from './relay-publisher'
import { logger } from './logger'
import { writable } from 'svelte/store'

// Store for muted pubkeys
export const mutedPubkeys = writable<Set<string>>(new Set())

// Store for muted words/phrases
export const mutedWords = writable<Set<string>>(new Set())

// Store for muted hashtags
export const mutedHashtags = writable<Set<string>>(new Set())

// Store for muted event IDs (threads)
export const mutedEvents = writable<Set<string>>(new Set())

/**
 * Fetch the user's mute list from relays (NIP-51 kind 10000)
 */
export async function loadMuteList(): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      logger.warn('Not authenticated - cannot load mute list')
      return
    }

    const ndk = getNDK()
    const event = await ndk.fetchEvent(
      {
        authors: [user.pubkey],
        kinds: [10000], // NIP-51 Mute list
      },
      { closeOnEose: true }
    )

    if (!event) {
      logger.info('No mute list found')
      return
    }

    const pubkeys = new Set<string>()
    const words = new Set<string>()
    const hashtags = new Set<string>()
    const events = new Set<string>()

    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) {
        pubkeys.add(tag[1])
      } else if (tag[0] === 'e' && tag[1]) {
        events.add(tag[1])
      } else if (tag[0] === 't' && tag[1]) {
        hashtags.add(tag[1].toLowerCase())
      } else if (tag[0] === 'word' && tag[1]) {
        words.add(tag[1].toLowerCase())
      }
    }

    mutedPubkeys.set(pubkeys)
    mutedWords.set(words)
    mutedHashtags.set(hashtags)
    mutedEvents.set(events)

    logger.info(`✓ Loaded mute list: ${pubkeys.size} users, ${words.size} words, ${hashtags.size} hashtags, ${events.size} threads`)
  } catch (err) {
    logger.error('Failed to load mute list:', err)
  }
}

/**
 * Publish the mute list to relays
 */
async function publishMuteList(): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      throw new Error('Not authenticated')
    }

    const ndk = getNDK()
    if (!ndk.signer) {
      throw new Error('No signer available')
    }

    const pubkeys = get(mutedPubkeys)
    const words = get(mutedWords)
    const hashtags = get(mutedHashtags)
    const events = get(mutedEvents)

    const tags: string[][] = []

    // Add muted pubkeys
    pubkeys.forEach(pubkey => {
      tags.push(['p', pubkey])
    })

    // Add muted events
    events.forEach(eventId => {
      tags.push(['e', eventId])
    })

    // Add muted hashtags
    hashtags.forEach(hashtag => {
      tags.push(['t', hashtag])
    })

    // Add muted words
    words.forEach(word => {
      tags.push(['word', word])
    })

    const event = new NDKEvent(ndk, {
      kind: 10000,
      content: '',
      tags: tags,
    })

    await event.sign(ndk.signer)
    await publishToConfiguredRelays(event)

    logger.info('✓ Mute list published successfully')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to publish mute list:', errorMsg)
    throw new Error(`Failed to publish mute list: ${errorMsg}`)
  }
}

/**
 * Mute a user by pubkey
 */
export async function muteUser(pubkey: string): Promise<void> {
  try {
    if (!pubkey || pubkey.length !== 64) {
      throw new Error('Invalid pubkey')
    }

    const currentMuted = get(mutedPubkeys)

    if (currentMuted.has(pubkey)) {
      logger.info('User already muted')
      return
    }

    // Update local state FIRST (immediate UI update)
    const newMuted = new Set(currentMuted)
    newMuted.add(pubkey)
    mutedPubkeys.set(newMuted)
    logger.info(`Updated local mute list. Now muting ${newMuted.size} users`)

    // Publish to relays
    await publishMuteList()

    logger.info(`✓ Muted user ${pubkey.slice(0, 8)}... (total: ${newMuted.size} muted)`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to mute user:', errorMsg)
    throw new Error(`Failed to mute user: ${errorMsg}`)
  }
}

/**
 * Unmute a user by pubkey
 */
export async function unmuteUser(pubkey: string): Promise<void> {
  try {
    if (!pubkey || pubkey.length !== 64) {
      throw new Error('Invalid pubkey')
    }

    const currentMuted = get(mutedPubkeys)

    if (!currentMuted.has(pubkey)) {
      logger.info('User not muted')
      return
    }

    // Update local state
    const newMuted = new Set(currentMuted)
    newMuted.delete(pubkey)
    mutedPubkeys.set(newMuted)

    // Publish to relays
    await publishMuteList()

    logger.info(`✓ Unmuted user ${pubkey.slice(0, 8)}...`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to unmute user:', errorMsg)
    throw new Error(`Failed to unmute user: ${errorMsg}`)
  }
}

/**
 * Mute a word/phrase
 */
export async function muteWord(word: string): Promise<void> {
  try {
    if (!word || !word.trim()) {
      throw new Error('Invalid word')
    }

    const normalized = word.toLowerCase().trim()
    const currentMuted = get(mutedWords)

    if (currentMuted.has(normalized)) {
      logger.info('Word already muted')
      return
    }

    // Update local state
    const newMuted = new Set(currentMuted)
    newMuted.add(normalized)
    mutedWords.set(newMuted)

    // Publish to relays
    await publishMuteList()

    logger.info(`✓ Muted word: "${word}"`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to mute word:', errorMsg)
    throw new Error(`Failed to mute word: ${errorMsg}`)
  }
}

/**
 * Unmute a word/phrase
 */
export async function unmuteWord(word: string): Promise<void> {
  try {
    const normalized = word.toLowerCase().trim()
    const currentMuted = get(mutedWords)

    if (!currentMuted.has(normalized)) {
      logger.info('Word not muted')
      return
    }

    // Update local state
    const newMuted = new Set(currentMuted)
    newMuted.delete(normalized)
    mutedWords.set(newMuted)

    // Publish to relays
    await publishMuteList()

    logger.info(`✓ Unmuted word: "${word}"`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to unmute word:', errorMsg)
    throw new Error(`Failed to unmute word: ${errorMsg}`)
  }
}

/**
 * Mute an entire thread by event ID
 */
export async function muteThread(eventId: string): Promise<void> {
  try {
    if (!eventId || eventId.length !== 64) {
      throw new Error('Invalid event ID')
    }

    const currentMuted = get(mutedEvents)

    if (currentMuted.has(eventId)) {
      logger.info('Thread already muted')
      return
    }

    // Update local state
    const newMuted = new Set(currentMuted)
    newMuted.add(eventId)
    mutedEvents.set(newMuted)

    // Publish to relays
    await publishMuteList()

    logger.info(`✓ Muted thread ${eventId.slice(0, 8)}...`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to mute thread:', errorMsg)
    throw new Error(`Failed to mute thread: ${errorMsg}`)
  }
}

/**
 * Check if a user is muted
 */
export function isUserMuted(pubkey: string): boolean {
  const muted = get(mutedPubkeys)
  return muted.has(pubkey)
}

/**
 * Check if content contains muted words
 */
export function containsMutedWords(content: string): boolean {
  const words = get(mutedWords)
  if (words.size === 0) return false

  const normalized = content.toLowerCase()
  for (const word of words) {
    if (normalized.includes(word)) {
      return true
    }
  }
  return false
}

/**
 * Check if an event should be hidden based on mute list
 */
export function shouldHideEvent(event: { id: string; pubkey: string; content?: string; tags?: string[][] }): boolean {
  // Check if author is muted
  const authorMuted = isUserMuted(event.pubkey)
  if (authorMuted) {
    logger.debug(`Hiding event from muted user: ${event.pubkey.slice(0, 8)}`)
    return true
  }

  // Check if event is muted
  const mutedEvt = get(mutedEvents)
  if (mutedEvt.has(event.id)) {
    logger.debug(`Hiding muted event: ${event.id.slice(0, 8)}`)
    return true
  }

  // Check if content contains muted words
  if (event.content && containsMutedWords(event.content)) {
    logger.debug(`Hiding event with muted words`)
    return true
  }

  // Check if hashtags are muted
  const mutedTags = get(mutedHashtags)
  if (mutedTags.size > 0 && event.tags) {
    for (const tag of event.tags) {
      if (tag[0] === 't' && tag[1] && mutedTags.has(tag[1].toLowerCase())) {
        logger.debug(`Hiding event with muted hashtag: #${tag[1]}`)
        return true
      }
    }
  }

  return false
}

/**
 * Check if a repost/quote contains content from a muted user
 * Returns the pubkey of the muted nested author, or null if not muted
 */
export function getNestedMutedAuthor(event: { kind?: number; pubkey: string; content?: string; tags?: string[][] }): string | null {
  // Only check reposts (kind 6) and quotes (kind 1 with nevent/note1 in content)
  if (!event.kind) return null

  // For kind 6 reposts, check the 'p' tag (author of reposted content)
  if (event.kind === 6 && event.tags) {
    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) {
        const nestedAuthor = tag[1]
        if (isUserMuted(nestedAuthor)) {
          logger.debug(`Detected muted nested author in repost: ${nestedAuthor.slice(0, 8)}`)
          return nestedAuthor
        }
        break // Only check first 'p' tag for reposts
      }
    }
  }

  // For quotes (kind 1 with embedded nevent/note1), check for 'q' tag or 'e' tag with 'mention' marker
  if (event.kind === 1 && event.tags) {
    // NIP-18: Check 'q' tag (quoted event reference)
    for (const tag of event.tags) {
      if (tag[0] === 'q' && tag[1]) {
        // We need to check if this quoted event is from a muted user
        // But we don't have the event data here, so we'll need to parse it elsewhere
        // For now, skip this case
        break
      }
    }
  }

  return null
}
