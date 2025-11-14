/**
 * Nostr URI parsing and handling (NIP-19, NIP-21)
 * Handles nostr: URIs like nostr:nevent1..., nostr:npub1..., etc.
 */

import { nip19 } from 'nostr-tools'

export type NostrURIType = 'note' | 'nevent' | 'npub' | 'nprofile' | 'naddr' | 'unknown'

export interface NostrURI {
  type: NostrURIType
  data: any
  raw: string
}

export interface NostrEventReference {
  id: string
  pubkey?: string
  relays?: string[]
}

export interface NostrProfileReference {
  pubkey: string
  relays?: string[]
}

export interface NostrAddressableEvent {
  identifier: string
  pubkey: string
  kind: number
  relays?: string[]
}

/**
 * Parse a nostr: URI or bare NIP-19 identifier
 */
export function parseNostrURI(uri: string): NostrURI | null {
  // Handle both "nostr:nevent1..." and bare "nevent1..." formats
  let encoded: string
  if (uri.startsWith('nostr:')) {
    encoded = uri.slice(6) // Remove 'nostr:' prefix
  } else {
    encoded = uri
  }

  try {
    // Determine type from prefix
    let type: NostrURIType = 'unknown'
    let data: any = null

    if (encoded.startsWith('note1')) {
      type = 'note'
      const result = nip19.decode(encoded) as any
      data = { id: result.data }
    } else if (encoded.startsWith('nevent1')) {
      type = 'nevent'
      const result = nip19.decode(encoded) as any
      data = result.data
    } else if (encoded.startsWith('npub1')) {
      type = 'npub'
      const result = nip19.decode(encoded) as any
      data = { pubkey: result.data }
    } else if (encoded.startsWith('nprofile1')) {
      type = 'nprofile'
      const result = nip19.decode(encoded) as any
      data = result.data
    } else if (encoded.startsWith('naddr1')) {
      type = 'naddr'
      const result = nip19.decode(encoded) as any
      data = result.data
    }

    if (type === 'unknown') {
      logger.warn('Unknown Nostr URI type:', encoded.slice(0, 20))
      return null
    }

    return {
      type,
      data,
      raw: uri,
    }
  } catch (err) {
    logger.warn('Failed to parse Nostr URI:', err)
    return null
  }
}

/**
 * Extract all nostr: URIs and bare NIP-19 identifiers from text
 */
export function extractNostrURIs(text: string): string[] {
  const regex = /(?:nostr:)?(note1|nevent1|npub1|nprofile1|naddr1)[a-z0-9]+/gi
  const matches = text.match(regex)
  // Normalize all to include nostr: prefix
  return matches?.map(m => m.startsWith('nostr:') ? m : `nostr:${m}`) ?? []
}

/**
 * Replace nostr: URIs and bare NIP-19 identifiers in text with placeholders
 * Returns: { text with placeholders, map of placeholder -> URI }
 */
export function replaceNostrURIs(text: string): {
  text: string
  uris: Map<string, NostrURI>
} {
  const uris = new Map<string, NostrURI>()
  const regex = /(?:nostr:)?(note1|nevent1|npub1|nprofile1|naddr1)[a-z0-9]+/gi

  let counter = 0
  const replacedText = text.replace(regex, (match) => {
    const parsed = parseNostrURI(match)
    if (parsed) {
      const placeholder = `__NOSTR_URI_${counter}__`
      uris.set(placeholder, parsed)
      counter++
      return placeholder
    }
    return match
  })

  return { text: replacedText, uris }
}

/**
 * Get display label for a Nostr URI
 */
export function getNostrURILabel(uri: NostrURI): string {
  switch (uri.type) {
    case 'note':
      return `Note ${uri.data.id.slice(0, 8)}...`
    case 'nevent':
      return `Event ${uri.data.id.slice(0, 8)}...`
    case 'npub':
      return `User ${uri.data.pubkey.slice(0, 8)}...`
    case 'nprofile':
      return `Profile ${uri.data.pubkey.slice(0, 8)}...`
    case 'naddr': {
      const addr = uri.data as NostrAddressableEvent
      return `Article ${addr.identifier.slice(0, 8)}...`
    }
    default:
      return 'Nostr Link'
  }
}

/**
 * Get the event ID from a Nostr URI (if applicable)
 */
export function getEventIdFromURI(uri: NostrURI): string | null {
  switch (uri.type) {
    case 'note':
    case 'nevent':
      return uri.data.id
    default:
      return null
  }
}

/**
 * Get the pubkey from a Nostr URI (if applicable)
 */
export function getPubkeyFromURI(uri: NostrURI): string | null {
  switch (uri.type) {
    case 'npub':
      return uri.data.pubkey
    case 'nprofile':
      return uri.data.pubkey
    case 'nevent':
      return uri.data.pubkey ?? null
    case 'naddr':
      return uri.data.pubkey
    default:
      return null
  }
}

/**
 * Get relays from a Nostr URI (if applicable)
 */
export function getRelaysFromURI(uri: NostrURI): string[] {
  switch (uri.type) {
    case 'nevent':
      return uri.data.relays ?? []
    case 'nprofile':
      return uri.data.relays ?? []
    case 'naddr':
      return uri.data.relays ?? []
    default:
      return []
  }
}

/**
 * Check if URI is a note/event reference
 */
export function isEventURI(uri: NostrURI): boolean {
  return uri.type === 'note' || uri.type === 'nevent'
}

/**
 * Check if URI is a profile/user reference
 */
export function isProfileURI(uri: NostrURI): boolean {
  return uri.type === 'npub' || uri.type === 'nprofile'
}

/**
 * Check if URI is an addressable event reference
 */
export function isAddressableEventURI(uri: NostrURI): boolean {
  return uri.type === 'naddr'
}

