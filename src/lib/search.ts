/**
 * Search functionality for posts and users
 * Supports: npubs, hex pubkeys, names, NIP-05, post content, hashtags
 */

import { getNDK } from './ndk'
import { fetchUserMetadata, getUserMetadata } from './metadata'
import { metadataCache } from '$stores/feed'
import { get } from 'svelte/store'
import type { NostrEvent } from '$types/nostr'
import type { SearchResult } from '$stores/search'
import type { NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'
import { normalizeEvent } from '$lib/event-validation'

/**
 * Search for posts by content, hashtags, or note ID
 */
export async function searchPosts(query: string, limit: number = 50): Promise<NostrEvent[]> {
  if (!query.trim()) {
    return []
  }

  try {
    const ndk = getNDK()
    const results: NostrEvent[] = []
    const seen = new Set<string>()
    const queryLower = query.toLowerCase().trim()

    // 1. Check if it's a note ID (note1...)
    const decoded = decodeNostrEntity(query)
    if (decoded && decoded.type === 'note') {
      // Fetch specific note by ID
      const noteFilter = {
        ids: [decoded.hex],
        kinds: [1, 30023], // short-form and long-form
        limit: 1,
      }

      const sub = ndk.subscribe(
        noteFilter,
        { closeOnEose: true } as NDKSubscriptionOptions,
        undefined,
        false
      )

      await new Promise<void>(resolve => {
        sub.on('event', (event: any) => {
          const raw = normalizeEvent(event as NostrEvent)
          if (!raw) return
          results.push(raw)
        })

        sub.on('eose', () => {
          sub.stop()
          resolve()
        })

        setTimeout(() => {
          sub.stop()
          resolve()
        }, 2000)
      })

      return results
    }

    // 2. Check if it's a hex note ID (64 hex chars)
    if (/^[a-f0-9]{64}$/i.test(queryLower)) {
      const noteFilter = {
        ids: [queryLower],
        kinds: [1, 30023],
        limit: 1,
      }

      const sub = ndk.subscribe(
        noteFilter,
        { closeOnEose: true } as NDKSubscriptionOptions,
        undefined,
        false
      )

      await new Promise<void>(resolve => {
        sub.on('event', (event: any) => {
          const raw = normalizeEvent(event as NostrEvent)
          if (!raw) return
          results.push(raw)
        })

        sub.on('eose', () => {
          sub.stop()
          resolve()
        })

        setTimeout(() => {
          sub.stop()
          resolve()
        }, 2000)
      })

      return results
    }

    // 3. Check if it's a hashtag search
    const isHashtagSearch = queryLower.startsWith('#')
    const hashtag = isHashtagSearch ? queryLower.slice(1) : null

    if (hashtag) {
      // Search by hashtag using 't' tag
      const hashtagFilter = {
        kinds: [1],
        '#t': [hashtag],
        limit: limit,
      }

      const sub = ndk.subscribe(
        hashtagFilter,
        { closeOnEose: true } as NDKSubscriptionOptions,
        undefined,
        false
      )

      await new Promise<void>(resolve => {
        sub.on('event', (event: any) => {
          const raw = normalizeEvent(event as NostrEvent)
          if (!raw) return
          if (!seen.has(raw.id)) {
            seen.add(raw.id)
            results.push(raw)
          }
        })

        sub.on('eose', () => {
          sub.stop()
          resolve()
        })

        setTimeout(() => {
          sub.stop()
          resolve()
        }, 3000)
      })

      return results
    }

    // 4. Regular content search using relay's search filter
    const subscription = ndk.subscribe(
      {
        kinds: [1],
        limit: limit * 2, // Request more to filter down
        search: query,
      },
      { closeOnEose: true } as NDKSubscriptionOptions,
      undefined,
      false
    )

    await new Promise<void>(resolve => {
      subscription.on('event', (event: any) => {
        const raw = normalizeEvent(event as NostrEvent)
        if (!raw) return
        if (!seen.has(raw.id)) {
          seen.add(raw.id)
          results.push(raw)
        }
      })

      subscription.on('eose', () => {
        subscription.stop()
        resolve()
      })

      // Timeout after 3 seconds
      setTimeout(() => {
        subscription.stop()
        resolve()
      }, 3000)
    })

    // Filter by query content (client-side filtering for better accuracy)
    const filtered = results.filter(event => {
      const content = event.content.toLowerCase()
      return content.includes(queryLower)
    })

    // Sort by created_at (newest first)
    filtered.sort((a, b) => b.created_at - a.created_at)

    return filtered.slice(0, limit)
  } catch (err) {
    logger.error('Post search error:', err)
    return []
  }
}

/**
 * Decode npub/note if provided, or return null
 */
function decodeNostrEntity(query: string): { type: 'pubkey' | 'note'; hex: string } | null {
  const trimmed = query.trim()

  try {
    // Try npub (public key)
    if (trimmed.toLowerCase().startsWith('npub1')) {
      const decoded = nip19.decode(trimmed)
      if (decoded.type === 'npub') {
        return { type: 'pubkey', hex: decoded.data as string }
      }
    }

    // Try note (note ID)
    if (trimmed.toLowerCase().startsWith('note1')) {
      const decoded = nip19.decode(trimmed)
      if (decoded.type === 'note') {
        return { type: 'note', hex: decoded.data as string }
      }
    }

    // Try nprofile
    if (trimmed.toLowerCase().startsWith('nprofile1')) {
      const decoded = nip19.decode(trimmed)
      if (decoded.type === 'nprofile') {
        return { type: 'pubkey', hex: decoded.data.pubkey }
      }
    }
  } catch (err) {
    // Not a valid nostr entity
  }

  return null
}

/**
 * Search for users by name, npub, pubkey, or NIP-05
 */
export async function searchUsers(
  query: string,
  limit: number = 20
): Promise<Array<{ pubkey: string; name?: string; picture?: string; about?: string; nip05?: string }>> {
  if (!query.trim()) {
    return []
  }

  try {
    const ndk = getNDK()
    const results: Array<{ pubkey: string; name?: string; picture?: string; about?: string; nip05?: string }> = []
    const seen = new Set<string>()
    const queryLower = query.toLowerCase().trim()

    // 1. Check if it's an npub or nprofile
    const decoded = decodeNostrEntity(query)
    if (decoded && decoded.type === 'pubkey') {
      // Fetch metadata for this specific pubkey
      await fetchUserMetadata(decoded.hex)
      const metadata = getUserMetadata(decoded.hex)
      if (metadata) {
        return [{
          pubkey: decoded.hex,
          name: metadata.name,
          picture: metadata.picture,
          about: metadata.about,
          nip05: metadata.nip05,
        }]
      }
      // Even if no metadata, return the pubkey
      return [{ pubkey: decoded.hex }]
    }

    // 2. Check if it's a hex pubkey (64 hex chars)
    if (/^[a-f0-9]{64}$/i.test(queryLower)) {
      await fetchUserMetadata(queryLower)
      const metadata = getUserMetadata(queryLower)
      if (metadata) {
        return [{
          pubkey: queryLower,
          name: metadata.name,
          picture: metadata.picture,
          about: metadata.about,
          nip05: metadata.nip05,
        }]
      }
      return [{ pubkey: queryLower }]
    }

    // 3. Search local metadata cache first (instant results)
    const cache = get(metadataCache)
    cache.forEach((metadata, pubkey) => {
      if (seen.has(pubkey)) return

      const name = metadata.name?.toLowerCase() || ''
      const about = metadata.about?.toLowerCase() || ''
      const nip05 = metadata.nip05?.toLowerCase() || ''

      // Match against name, about, or NIP-05
      if (
        name.includes(queryLower) ||
        about.includes(queryLower) ||
        nip05.includes(queryLower) ||
        nip05.startsWith(queryLower) // Prioritize NIP-05 prefix matches
      ) {
        seen.add(pubkey)
        results.push({
          pubkey,
          name: metadata.name,
          picture: metadata.picture,
          about: metadata.about,
          nip05: metadata.nip05,
        })
      }
    })

    // 4. Search on relays for additional results
    const subscription = ndk.subscribe(
      {
        kinds: [0],
        limit: limit * 3, // Request more to filter down
        search: query,
      },
      { closeOnEose: true } as NDKSubscriptionOptions,
      undefined,
      false
    )

    await new Promise<void>(resolve => {
      subscription.on('event', (event: any) => {
        const raw = normalizeEvent(event as NostrEvent)
        if (!raw) return
        if (!seen.has(raw.pubkey)) {
          seen.add(raw.pubkey)
          try {
            const metadata = JSON.parse(raw.content)
            const name = metadata.name?.toLowerCase() || ''
            const about = metadata.about?.toLowerCase() || ''
            const nip05 = metadata.nip05?.toLowerCase() || ''

            // Match query
            if (
              name.includes(queryLower) ||
              about.includes(queryLower) ||
              nip05.includes(queryLower)
            ) {
              results.push({
                pubkey: raw.pubkey,
                name: metadata.name,
                picture: metadata.picture,
                about: metadata.about,
                nip05: metadata.nip05,
              })
            }
          } catch (e) {
            // Invalid metadata, skip
          }
        }
      })

      subscription.on('eose', () => {
        subscription.stop()
        resolve()
      })

      // Timeout after 3 seconds
      setTimeout(() => {
        subscription.stop()
        resolve()
      }, 3000)
    })

    // Sort: prioritize name matches, then NIP-05 matches
    results.sort((a, b) => {
      const aName = a.name?.toLowerCase() || ''
      const bName = b.name?.toLowerCase() || ''
      const aNip05 = a.nip05?.toLowerCase() || ''
      const bNip05 = b.nip05?.toLowerCase() || ''

      // Exact name match comes first
      if (aName === queryLower) return -1
      if (bName === queryLower) return 1

      // Name starts with query
      if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1
      if (!aName.startsWith(queryLower) && bName.startsWith(queryLower)) return 1

      // NIP-05 starts with query
      if (aNip05.startsWith(queryLower) && !bNip05.startsWith(queryLower)) return -1
      if (!aNip05.startsWith(queryLower) && bNip05.startsWith(queryLower)) return 1

      return 0
    })

    return results.slice(0, limit)
  } catch (err) {
    logger.error('User search error:', err)
    return []
  }
}

/**
 * Combined search for posts and users
 */
export async function search(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return []
  }

  try {
    const [posts, users] = await Promise.all([searchPosts(query, 30), searchUsers(query, 15)])

    const results: SearchResult[] = []

    // Add posts
    for (const post of posts) {
      results.push({
        type: 'post',
        id: post.id,
        data: post,
      })
    }

    // Add users
    for (const user of users) {
      results.push({
        type: 'user',
        id: user.pubkey,
        data: user as any,
      })
    }

    return results
  } catch (err) {
    logger.error('Search error:', err)
    return []
  }
}

