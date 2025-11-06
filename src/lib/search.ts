/**
 * Search functionality for posts and users
 */

import { getNDK } from './ndk'
import { fetchUserMetadata } from './metadata'
import type { NostrEvent } from '$types/nostr'
import type { SearchResult } from '$stores/search'
import type { NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'

/**
 * Search for posts by content
 */
export async function searchPosts(query: string, limit: number = 50): Promise<NostrEvent[]> {
  if (!query.trim()) {
    return []
  }

  try {
    const ndk = getNDK()
    const results: NostrEvent[] = []
    const seen = new Set<string>()

    // Search in recent posts (kind 1)
    const subscription = ndk.subscribe(
      {
        kinds: [1],
        limit: limit,
        search: query,
      },
      { closeOnEose: true } as NDKSubscriptionOptions,
      undefined,
      false
    )

    await new Promise<void>(resolve => {
      subscription.on('event', (event: any) => {
        const raw = event.rawEvent?.() ?? event
        if (!seen.has(raw.id)) {
          seen.add(raw.id)
          results.push(raw as NostrEvent)
        }
      })

      subscription.on('eose', () => {
        subscription.stop()
        resolve()
      })

      // Timeout after 5 seconds
      setTimeout(() => {
        subscription.stop()
        resolve()
      }, 5000)
    })

    // Filter by query content
    return results.filter(
      event =>
        event.content.toLowerCase().includes(query.toLowerCase()) ||
        event.content.includes(query)
    )
  } catch (err) {
    console.error('Post search error:', err)
    return []
  }
}

/**
 * Search for users by name or pubkey
 */
export async function searchUsers(
  query: string,
  limit: number = 20
): Promise<Array<{ pubkey: string; name?: string; picture?: string; about?: string }>> {
  if (!query.trim()) {
    return []
  }

  try {
    const ndk = getNDK()
    const results: Array<{ pubkey: string; name?: string; picture?: string; about?: string }> = []
    const seen = new Set<string>()

    // Search by pubkey if it looks like one (64 hex chars)
    if (/^[a-f0-9]{64}$/i.test(query)) {
      void fetchUserMetadata(query)
      // Note: fetchUserMetadata updates cache, we'll get it from there
    }

    // Search in user metadata (kind 0)
    const subscription = ndk.subscribe(
      {
        kinds: [0],
        limit: limit * 2,
        search: query,
      },
      { closeOnEose: true } as NDKSubscriptionOptions,
      undefined,
      false
    )

    await new Promise<void>(resolve => {
      subscription.on('event', (event: any) => {
        const raw = event.rawEvent?.() ?? event
        if (!seen.has(raw.pubkey)) {
          seen.add(raw.pubkey)
          try {
            const metadata = JSON.parse(raw.content)
            const name = metadata.name || ''
            const about = metadata.about || ''

            // Match query
            if (
              name.toLowerCase().includes(query.toLowerCase()) ||
              about.toLowerCase().includes(query.toLowerCase()) ||
              name.includes(query) ||
              about.includes(query)
            ) {
              results.push({
                pubkey: raw.pubkey,
                name: metadata.name,
                picture: metadata.picture,
                about: metadata.about,
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

      // Timeout after 5 seconds
      setTimeout(() => {
        subscription.stop()
        resolve()
      }, 5000)
    })

    return results.slice(0, limit)
  } catch (err) {
    console.error('User search error:', err)
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
    console.error('Search error:', err)
    return []
  }
}
