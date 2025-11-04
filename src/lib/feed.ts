/**
 * Feed utilities for Nostr events
 * Implements filtering and thread aggregation (NIP-10)
 */

import { subscribe, unsubscribe } from './nostr'
import type { NostrEvent, NostrFilter } from '$types/nostr'

/**
 * Parse contact list from kind 3 event
 */
export function parseContactList(event: NostrEvent): Set<string> {
  const contacts = new Set<string>()
  for (const tag of event.tags) {
    if (tag[0] === 'p' && tag[1]) {
      contacts.add(tag[1])
    }
  }
  return contacts
}

/**
 * Subscribe to all feeds at once
 */
export function subscribeToAllFeeds(pubkey: string): void {
  if (!pubkey) {
    subscribeToGlobalFeed()
    return
  }

  // Fetch user's contact list first
  const contactFilter: NostrFilter = {
    authors: [pubkey],
    kinds: [3],
    limit: 1,
  }
  subscribe('user-contacts', contactFilter)

  // Subscribe to global feed (all posts)
  subscribe('global', { kinds: [1, 6, 16], limit: 500 })

  // Subscribe to long-reads
  subscribe('long-reads', { kinds: [30023], limit: 50 })

  // Wait a moment for contacts to be fetched, then subscribe to following/circles feeds
  setTimeout(() => {
    import('$stores/feed').then(({ userContacts }) => {
      let unsubscribe: (() => void) | null = null
      unsubscribe = userContacts.subscribe((contacts: Set<string>) => {
        if (contacts.size > 0) {
          const authors = Array.from(contacts) as string[]

          // Subscribe to posts from contacts (following feed)
          subscribe('following-posts', {
            authors,
            kinds: [1, 6, 16],
            limit: 100,
          })

          // Fetch contact lists of your contacts (for circles)
          subscribe('contacts-of-contacts', {
            authors,
            kinds: [3],
            limit: authors.length,
          })

          if (unsubscribe) unsubscribe()
        }
      })
    })
  }, 1000)
}

/**
 * Subscribe to following feed
 */
export function subscribeToFollowingFeed(): void {
  // No-op: filtering happens client-side now
}

/**
 * Subscribe to circles (follows-of-follows) feed
 */
export function subscribeToCirclesFeed(): void {
  // No-op: filtering happens client-side now
}

/**
 * Subscribe to long-reads feed (NIP-23)
 */
export function subscribeToLongReadsFeed(): void {
  // No-op: filtering happens client-side now
}

/**
 * Subscribe to global feed
 */
export function subscribeToGlobalFeed(): void {
  // No-op: filtering happens client-side now
}

/**
 * Unsubscribe from all feeds
 */
export function unsubscribeFromAll(): void {
  const subscriptions = ['following', 'follows-of-follows', 'long-reads', 'global']
  subscriptions.forEach(sub => unsubscribe(sub))
}

/**
 * Build thread from events (NIP-10)
 * Returns the full conversation thread including parent and replies
 */
export function buildThread(rootEvent: NostrEvent, events: NostrEvent[]): NostrEvent[] {
  const eventMap = new Map(events.map((e) => [e.id, e]))
  const thread: NostrEvent[] = []

  // Find all parent events (walk up the chain)
  let current: NostrEvent | undefined = rootEvent
  const parents: NostrEvent[] = []

  while (current) {
    const parentId = findReplyTo(current)
    if (!parentId || !eventMap.has(parentId)) break

    const parent = eventMap.get(parentId)
    if (!parent) break

    parents.unshift(parent)
    current = parent
  }

  // Build thread: parents + root + replies
  thread.push(...parents)
  thread.push(rootEvent)

  // Add replies
  const replies = getReplies(rootEvent.id, events)
  thread.push(...replies)

  return thread
}

/**
 * Find the direct parent event ID from tags (NIP-10)
 * NIP-10 specifies the last 'e' tag is the direct reply
 */
function findReplyTo(event: NostrEvent): string | null {
  // Look for 'e' tags in reverse order (last one is direct reply in NIP-10)
  for (let i = event.tags.length - 1; i >= 0; i--) {
    const tag = event.tags[i]
    if (tag[0] === 'e' && tag[1]) {
      return tag[1]
    }
  }
  return null
}

/**
 * Get direct replies to an event
 */
export function getReplies(eventId: string, events: NostrEvent[]): NostrEvent[] {
  return events.filter((e) => {
    // Check if this event directly replies to the given eventId
    const replyTo = findReplyTo(e)
    return replyTo === eventId
  })
}

/**
 * Check if event is a repost
 */
export function isRepost(event: NostrEvent): boolean {
  return event.kind === 6 || event.kind === 16
}

/**
 * Get reposted event ID
 */
export function getRepostedEventId(event: NostrEvent): string | null {
  for (const tag of event.tags) {
    if (tag[0] === 'e' && tag[1]) {
      return tag[1]
    }
  }
  return null
}
