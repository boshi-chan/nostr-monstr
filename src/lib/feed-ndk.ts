/**
 * Feed management with NDK
 * Handles following feed, global feed, and event subscriptions
 */

import { get } from 'svelte/store'
import { getNDK, getCurrentNDKUser } from './ndk'
import {
  feedEvents,
  activeSubscriptions,
  feedLoading,
  feedError,
  following,
  circles,
  longReadAuthors,
  userEventIds,
} from '$stores/feed'
import { parseMetadataEvent, fetchUserMetadata } from './metadata'
import { feedSource, type FeedSource } from '$stores/feedSource'
import type { NostrEvent } from '$types/nostr'
import { NDKEvent, type NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'

const subscriptionRefs = new Map<string, any>()
const eventCache = new Map<string, NostrEvent>()

type FeedOrigin = FeedSource | 'local'

// Debounce settings to prevent firehose
const FEED_DEBOUNCE_MS = 100
const MAX_FEED_SIZE = 120
const BATCH_SIZE = 30
let debounceTimeout: ReturnType<typeof setTimeout> | null = null
let pendingEvents: Array<{ event: NostrEvent; origin: FeedOrigin }> = []

/**
 * Queue event for debounced feed update
 */
export function addEventToFeed(event: NostrEvent, origin: FeedOrigin = 'global'): void {
  const currentFeed = get(feedSource)
  if (!shouldIncludeEvent(origin, currentFeed)) {
    return
  }

  if (eventCache.has(event.id)) {
    return
  }

  eventCache.set(event.id, event)
  recordUserEvent(event)

  if (event.kind === 0) {
    parseMetadataEvent(event)
  } else {
    void fetchUserMetadata(event.pubkey)
  }

  pendingEvents.push({ event, origin })

  if (!debounceTimeout) {
    debounceTimeout = setTimeout(flushPendingEvents, FEED_DEBOUNCE_MS)
  }
}

function shouldIncludeEvent(origin: FeedOrigin, currentFeed: FeedSource): boolean {
  if (origin === 'local') {
    return true
  }

  return origin === currentFeed
}

function flushPendingEvents(): void {
  if (pendingEvents.length === 0) {
    debounceTimeout = null
    return
  }

  const currentFeed = get(feedSource)
  const chunk = pendingEvents.splice(0, BATCH_SIZE)
  const eventsToMerge: NostrEvent[] = []

  for (const { event, origin } of chunk) {
    if (shouldIncludeEvent(origin, currentFeed)) {
      eventsToMerge.push(event)
    } else {
      eventCache.delete(event.id)
    }
  }

  if (eventsToMerge.length > 0) {
    feedEvents.update(existing => {
      const combined = [...eventsToMerge, ...existing]
      combined.sort((a, b) => b.created_at - a.created_at)

      const seen = new Set<string>()
      const next: NostrEvent[] = []

      for (const ev of combined) {
        if (seen.has(ev.id)) continue
        seen.add(ev.id)
        next.push(ev)
        if (next.length >= MAX_FEED_SIZE) break
      }

      // Keep cache size under control
      if (eventCache.size > MAX_FEED_SIZE * 2) {
        const keep = new Set(next.map(ev => ev.id))
        for (const key of eventCache.keys()) {
          if (!keep.has(key)) {
            eventCache.delete(key)
          }
        }
      }

      return next
    })
  }

  if (pendingEvents.length > 0) {
    debounceTimeout = setTimeout(flushPendingEvents, FEED_DEBOUNCE_MS)
  } else {
    debounceTimeout = null
  }
}

/**
 * Clear all feed events
 */
export function clearFeed(): void {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout)
    debounceTimeout = null
  }
  pendingEvents = []
  feedEvents.set([])
  eventCache.clear()
}

function recordUserEvent(event: NostrEvent): void {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) return
  if (event.pubkey !== user.pubkey) return

  userEventIds.update(set => {
    if (set.has(event.id)) return set
    const next = new Set(set)
    next.add(event.id)
    return next
  })
}

async function fetchFollowing(pubkey: string): Promise<Set<string>> {
  const ndk = getNDK()
  const follows = new Set<string>()

  await new Promise<void>(resolve => {
    const sub = ndk.subscribe(
      { authors: [pubkey], kinds: [3], limit: 1 },
      { closeOnEose: true } as NDKSubscriptionOptions,
      undefined,
      false
    )

    const finish = () => {
      sub.stop()
      resolve()
    }

    sub.on('event', (event: any) => {
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1]) {
          follows.add(tag[1])
        }
      }
    })

    sub.on('eose', finish)
    ;(sub as any).on?.('error', (err: unknown) => {
      console.warn('Failed to fetch following list:', err)
      finish()
    })
  })

  return follows
}

async function fetchCirclesFromFollowing(follows: Set<string>): Promise<Set<string>> {
  const ndk = getNDK()
  const circleSet = new Set<string>()
  const authors = Array.from(follows)

  if (authors.length === 0) {
    return circleSet
  }

  const chunkSize = 50

  const fetchChunk = (chunk: string[]) =>
    new Promise<void>(resolve => {
      const sub = ndk.subscribe(
        { authors: chunk, kinds: [3], limit: 1 },
        { closeOnEose: true } as NDKSubscriptionOptions,
        undefined,
        false
      )

      const finish = () => {
        sub.stop()
        resolve()
      }

      sub.on('event', (event: any) => {
        for (const tag of event.tags) {
          if (tag[0] === 'p' && tag[1] && !follows.has(tag[1])) {
            circleSet.add(tag[1])
          }
        }
      })

      sub.on('eose', finish)
      ;(sub as any).on?.('error', (err: unknown) => {
        console.warn('Failed to fetch circles for chunk:', err)
        finish()
      })
    })

  for (let i = 0; i < authors.length; i += chunkSize) {
    const chunk = authors.slice(i, i + chunkSize)
    await fetchChunk(chunk)
  }

  return circleSet
}

function registerSubscription(label: FeedSource, subscription: any): void {
  const subId = `${label}:${Date.now()}`
  subscriptionRefs.set(subId, subscription)
  activeSubscriptions.update(subs => {
    const next = new Set(subs)
    next.add(subId)
    return next
  })
}

function subscribeWithFilter(
  filter: Record<string, any>,
  label: FeedSource,
  options?: NDKSubscriptionOptions
): void {
  const ndk = getNDK()
  const subscription = ndk.subscribe(filter, options ?? ({ closeOnEose: false } as NDKSubscriptionOptions), undefined, false)

  registerSubscription(label, subscription)

  subscription.on('event', (event: any) => {
    addEventToFeed(event, label)
  })

  subscription.on('eose', () => {
    feedLoading.set(false)
  })

  ;(subscription as any).on?.('error', (err: unknown) => {
    console.error(`${label} feed error:`, err)
    feedError.set(`Feed error: ${String(err)}`)
    feedLoading.set(false)
  })
}

async function ensureFollowing(pubkey: string): Promise<Set<string>> {
  const existing = get(following)
  if (existing.size > 0) {
    return new Set(existing)
  }
  const fetched = await fetchFollowing(pubkey)
  const next = new Set(fetched)
  following.set(next)
  return next
}

async function ensureCircles(follows: Set<string>): Promise<Set<string>> {
  if (follows.size === 0) {
    circles.set(new Set())
    return new Set()
  }
  const existing = get(circles)
  if (existing.size > 0) {
    return new Set(existing)
  }
  const fetched = await fetchCirclesFromFollowing(follows)
  circles.set(fetched)
  return fetched
}

/**
 * Subscribe to following feed
 */
export async function subscribeToFollowingFeed(): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      feedError.set('Not authenticated')
      feedLoading.set(false)
      return
    }

    feedLoading.set(true)
    feedError.set(null)

    const follows = await fetchFollowing(user.pubkey)
    const followingSet = new Set(follows)
    following.set(followingSet)

    // refresh circles in background
    void ensureCircles(followingSet)

    const authors = Array.from(followingSet)
    if (authors.length === 0) {
      feedLoading.set(false)
      feedError.set('Follow someone to see this feed')
      return
    }

    subscribeWithFilter(
      {
        authors,
        kinds: [1, 6, 16],
        limit: 150,
        since: Math.floor(Date.now() / 1000) - 86400 * 3,
      },
      'following'
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to subscribe to following feed:', err)
    feedError.set(message)
    feedLoading.set(false)
  }
}

/**
 * Subscribe to circles feed (contacts of contacts)
 */
export async function subscribeToCirclesFeed(): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      feedError.set('Not authenticated')
      feedLoading.set(false)
      return
    }

    feedLoading.set(true)
    feedError.set(null)

    const followSet = await ensureFollowing(user.pubkey)
    if (followSet.size === 0) {
      feedLoading.set(false)
      feedError.set('Follow someone to build your circles')
      return
    }

    const circleSet = await ensureCircles(followSet)

    const authors = Array.from(circleSet)
    if (authors.length === 0) {
      feedLoading.set(false)
      feedError.set('No second-degree contacts yet')
      return
    }

    subscribeWithFilter(
      {
        authors,
        kinds: [1, 6, 16],
        limit: 150,
        since: Math.floor(Date.now() / 1000) - 86400 * 3,
      },
      'circles'
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to subscribe to circles feed:', err)
    feedError.set(message)
    feedLoading.set(false)
  }
}

/**
 * Subscribe to long-form content (kind 30023)
 */
export async function subscribeToLongReadsFeed(): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      feedError.set('Not authenticated')
      feedLoading.set(false)
      return
    }

    feedLoading.set(true)
    feedError.set(null)

    const followSet = await ensureFollowing(user.pubkey)
    if (followSet.size === 0) {
      feedLoading.set(false)
      feedError.set('Follow someone to build your long read feed')
      return
    }

    await ensureCircles(followSet)

    const authors = Array.from(get(longReadAuthors))
    if (authors.length === 0) {
      feedLoading.set(false)
      feedError.set('No long-read authors discovered yet')
      return
    }

    subscribeWithFilter(
      {
        authors,
        kinds: [30023],
        limit: 100,
        since: Math.floor(Date.now() / 1000) - 86400 * 30,
      },
      'long-reads'
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to subscribe to long reads:', err)
    feedError.set(message)
    feedLoading.set(false)
  }
}

/**
 * Subscribe to global feed
 */
export async function subscribeToGlobalFeed(): Promise<void> {
  try {
    feedLoading.set(true)
    feedError.set(null)

    subscribeWithFilter(
      {
        kinds: [1],
        limit: 100,
        since: Math.floor(Date.now() / 1000) - 3600,
      },
      'global'
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to subscribe to global feed:', err)
    feedError.set(message)
    feedLoading.set(false)
  }
}

/**
 * Stop specific subscription
 */
export function stopSubscription(subId: string): void {
  const sub = subscriptionRefs.get(subId)
  if (sub) {
    sub.stop()
    subscriptionRefs.delete(subId)
    activeSubscriptions.update(subs => {
      const newSubs = new Set(subs)
      newSubs.delete(subId)
      return newSubs
    })
  }
}

/**
 * Stop all subscriptions
 */
export function stopAllSubscriptions(): void {
  for (const sub of subscriptionRefs.values()) {
    sub?.stop?.()
  }
  subscriptionRefs.clear()
  activeSubscriptions.set(new Set())
}

/**
 * Get event by ID
 */
export function getEventById(id: string): NostrEvent | undefined {
  return eventCache.get(id)
}

/**
 * Get replies to an event
 */
export function getReplies(eventId: string, allEvents: NostrEvent[]): NostrEvent[] {
  return allEvents.filter(event => {
    // Check if event has 'e' tag referencing the parent
    for (const tag of event.tags) {
      if (tag[0] === 'e' && tag[1] === eventId) {
        return true
      }
    }
    return false
  })
}

/**
 * Build thread for an event (replies + parent)
 */
export function buildThread(event: NostrEvent, allEvents: NostrEvent[]): NostrEvent[] {
  const thread: NostrEvent[] = [event]

  // Find parent events
  let current = event
  const visited = new Set<string>()

  while (current && !visited.has(current.id)) {
    visited.add(current.id)

    // Find parent
    let parentId: string | null = null
    for (const tag of current.tags) {
      if (tag[0] === 'e' && tag[1]) {
        parentId = tag[1]
        break
      }
    }

    if (!parentId) break

    const parent = allEvents.find(e => e.id === parentId)
    if (!parent) break

    thread.unshift(parent)
    current = parent
  }

  // Get replies
  const replies = getReplies(event.id, allEvents)
  thread.push(...replies)

  return thread
}

/**
 * Publish a note
 */
export async function publishNote(content: string, replyTo?: NostrEvent): Promise<NostrEvent> {
  const ndk = getNDK()
  const user = getCurrentNDKUser()

  if (!user?.pubkey || !ndk.signer) {
    throw new Error('Not authenticated')
  }

  const tags: string[][] = []

  // Add reply tags if replying
  if (replyTo) {
    tags.push(['e', replyTo.id, '', 'reply'])
    tags.push(['p', replyTo.pubkey])
  }

  // Create event
  const ndkEvent = new NDKEvent(ndk)
  ndkEvent.kind = 1
  ndkEvent.content = content
  ndkEvent.tags = tags
  ndkEvent.created_at = Math.floor(Date.now() / 1000)

  await ndkEvent.sign()
  await ndkEvent.publish()

  const raw = ndkEvent.rawEvent()
  recordUserEvent(raw)
  addEventToFeed(raw, 'local')

  return raw
}

/**
 * Publish a reaction (like/emoji)
 */
export async function publishReaction(eventId: string, emoji: string = '+'): Promise<void> {
  const ndk = getNDK()
  const user = getCurrentNDKUser()

  if (!user?.pubkey || !ndk.signer) {
    throw new Error('Not authenticated')
  }

  const ndkEvent = new NDKEvent(ndk)
  ndkEvent.kind = 7
  ndkEvent.content = emoji
  ndkEvent.tags = [['e', eventId]]
  ndkEvent.created_at = Math.floor(Date.now() / 1000)

  await ndkEvent.sign()
  await ndkEvent.publish()
}

/**
 * Publish a repost
 */
export async function publishRepost(event: NostrEvent): Promise<void> {
  const ndk = getNDK()
  const user = getCurrentNDKUser()

  if (!user?.pubkey || !ndk.signer) {
    throw new Error('Not authenticated')
  }

  const ndkEvent = new NDKEvent(ndk)
  ndkEvent.kind = 6
  ndkEvent.content = JSON.stringify(event)
  ndkEvent.tags = [
    ['e', event.id],
    ['p', event.pubkey],
  ]
  ndkEvent.created_at = Math.floor(Date.now() / 1000)

  await ndkEvent.sign()
  await ndkEvent.publish()
}

/**
 * Publish a zap request (NIP-57)
 */
export async function publishZapRequest(
  eventId: string,
  amount: number,
  relayUrl: string
): Promise<void> {
  const ndk = getNDK()
  const user = getCurrentNDKUser()

  if (!user?.pubkey || !ndk.signer) {
    throw new Error('Not authenticated')
  }

  // This is a simplified version - full NIP-57 requires LNURL
  const ndkEvent = new NDKEvent(ndk)
  ndkEvent.kind = 9734
  ndkEvent.content = ''
  ndkEvent.tags = [
    ['e', eventId],
    ['relays', relayUrl],
    ['amount', String(amount * 1000)],
  ]
  ndkEvent.created_at = Math.floor(Date.now() / 1000)

  await ndkEvent.sign()
  await ndkEvent.publish()
}
