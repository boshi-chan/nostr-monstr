/**
 * Metadata service
 * Fetches and caches user profiles (NIP-01 kind 0 events)
 */

import { metadataCache as metadataCacheStore } from '$stores/feed'
import { subscribe } from './nostr'
import type { NostrEvent } from '$types/nostr'
import type { UserMetadata } from '$types/user'

const metadataCache = new Map<string, UserMetadata & { fetched: number }>()
const pendingFetches = new Set<string>()
const CACHE_TTL = 3600000 // 1 hour

/**
 * Get user metadata (cached)
 */
export function getUserMetadata(pubkey: string): UserMetadata | null {
  const cached = metadataCache.get(pubkey)
  
  if (cached && Date.now() - cached.fetched < CACHE_TTL) {
    return cached
  }
  
  return null
}

/**
 * Fetch user metadata from events
 */
export function fetchUserMetadata(pubkey: string): void {
  // Check if already cached
  const cached = metadataCache.get(pubkey)
  if (cached && Date.now() - cached.fetched < CACHE_TTL) {
    return
  }

  // Check if already fetching
  if (pendingFetches.has(pubkey)) {
    return
  }

  // Mark as pending
  pendingFetches.add(pubkey)

  // Subscribe to user's metadata events
  const filter = {
    authors: [pubkey],
    kinds: [0], // Metadata kind
    limit: 1,
  }

  subscribe(`metadata:${pubkey}`, filter)

  // Clear pending after a short delay (subscription is fire-and-forget)
  setTimeout(() => pendingFetches.delete(pubkey), 1000)
}

/**
 * Parse metadata from event
 */
export function parseMetadataEvent(event: NostrEvent): UserMetadata | null {
  if (event.kind !== 0) return null
  
  try {
    const metadata = JSON.parse(event.content) as UserMetadata
    
    // Cache it
    metadataCache.set(event.pubkey, {
      ...metadata,
      fetched: Date.now(),
    })
    
    // Update reactive store for UI updates
    metadataCacheStore.update(cache => {
      const newCache = new Map(cache)
      newCache.set(event.pubkey, metadata)
      return newCache
    })
    
    return metadata
  } catch (err) {
    console.error('Failed to parse metadata:', err)
    return null
  }
}

/**
 * Get display name for user
 */
export function getDisplayName(pubkey: string, metadata?: UserMetadata): string {
  if (metadata?.name) return metadata.name
  if (metadata?.nip05) return metadata.nip05.split('@')[0]
  return pubkey.slice(0, 8)
}

/**
 * Get avatar URL
 */
export function getAvatarUrl(metadata?: UserMetadata): string | null {
  if (!metadata?.picture) return null
  
  // Handle ipfs:// URLs
  if (metadata.picture.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${metadata.picture.slice(7)}`
  }
  
  // Handle regular URLs
  if (metadata.picture.startsWith('http')) {
    return metadata.picture
  }
  
  return null
}

/**
 * Verify NIP-05 (simplified)
 */
export function getNip05Display(nip05?: string): string | null {
  if (!nip05) return null
  return nip05
}
