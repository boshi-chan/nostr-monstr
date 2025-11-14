/**
 * Feed management with NDK
 * Handles following feed, global feed, and event subscriptions
 */

import { get } from 'svelte/store'
import { getNDK, getCurrentNDKUser } from './ndk'
import {
  unfilteredFeedEvents,
  activeSubscriptions,
  feedLoading,
  feedError,
  following,
  followingCache,
  circles,
  circlesCache,
  userEventIds,
  likedEvents,
  repostedEvents,
  zappedEvents,
  commentedThreads,
} from '$stores/feed'
import { parseMetadataEvent, fetchUserMetadata } from './metadata'
import { feedSource, type FeedSource } from '$stores/feedSource'
import { feedFilters } from '$stores/feedFilters'
import type { NostrEvent } from '$types/nostr'
import { NDKEvent, type NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'
import { parseContent, isReply, isRepostEvent } from './content'
import {
  queueEngagementHydration,
  incrementLikeCount,
  incrementRepostCount,
} from '$lib/engagement'
import { persistInteractionsSnapshot } from '$lib/interaction-cache'

const subscriptionRefs = new Map<string, any>()
const eventCache = new Map<string, NostrEvent>()

type FeedOrigin = FeedSource | 'local'

// Debounce settings to prevent firehose
const FEED_DEBOUNCE_MS = 100
const MAX_FEED_SIZE = 120
const BATCH_SIZE = 30
let debounceTimeout: ReturnType<typeof setTimeout> | null = null
let pendingEvents: Array<{ event: NostrEvent; origin: FeedOrigin }> = []

// Subscription timeout and retry settings
const SUBSCRIPTION_TIMEOUT = 8000 // 8 seconds
const MAX_RETRIES = 2
const RETRY_DELAY = 1000 // 1 second
const HEX_PUBKEY_REGEX = /^[0-9a-f]{64}$/i
const MAX_CIRCLE_AUTHORS = 400

function isHexPubkey(value: unknown): value is string {
  return typeof value === 'string' && HEX_PUBKEY_REGEX.test(value)
}

function sanitizePubkeySet(values: Iterable<string>): Set<string> {
  const sanitized = new Set<string>()
  for (const value of values) {
    if (isHexPubkey(value)) {
      sanitized.add(value.toLowerCase())
    }
  }
  return sanitized
}

function limitAuthors(values: Iterable<string>, limit = MAX_CIRCLE_AUTHORS): string[] {
  const result: string[] = []
  for (const value of values) {
    if (result.length >= limit) break
    result.push(value)
  }
  return result
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) {
      return false
    }
  }
  return true
}

function collectEngagementTargets(event: NostrEvent): string[] {
  const targets = new Set<string>()
  targets.add(event.id)

  if (isRepostEvent(event)) {
    try {
      const parsed = parseContent(event)
      const nestedId = parsed.repostId ?? parsed.nestedEvent?.id ?? null
      if (nestedId) {
        targets.add(nestedId)
      }
    } catch (err) {
      console.warn('Failed to parse repost while collecting engagement targets:', err)
    }
  }

  return Array.from(targets)
}

/**
 * Queue event for debounced feed update
 */
export function addEventToFeed(event: NostrEvent, origin: FeedOrigin = 'global'): void {
  const currentFeed = get(feedSource)
  if (!shouldIncludeEvent(origin, currentFeed)) {
    return
  }

  // Early exit if already cached (prevents duplicate processing)
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

  // Only add to pending if not already queued
  const alreadyQueued = pendingEvents.some(pe => pe.event.id === event.id)
  if (!alreadyQueued) {
    pendingEvents.push({ event, origin })
  }

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

/**
 * Check if event passes the current feed filters
 * Note: Currently unused, but kept for future filtering needs
 */
// @ts-ignore - unused function kept for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function passesFilters(event: NostrEvent): boolean {
  const filters = get(feedFilters)

  // Check if it's a repost
  if (isRepostEvent(event)) {
    return filters.showReposts
  }

  // Check if it's a reply
  if (isReply(event)) {
    return filters.showReplies
  }

  // It's a regular post - always show regular posts if they're not replies/reposts
  return true
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
    // Only check feed source, NOT filters (filters applied in App.svelte)
    if (shouldIncludeEvent(origin, currentFeed)) {
      eventsToMerge.push(event)
    } else {
      eventCache.delete(event.id)
    }
  }

  if (eventsToMerge.length > 0) {
    const engagementIds: string[] = []
    for (const event of eventsToMerge) {
      engagementIds.push(...collectEngagementTargets(event))
    }
    queueEngagementHydration(engagementIds)

    unfilteredFeedEvents.update(existing => {
      const combined = [...eventsToMerge, ...existing]
      combined.sort((a, b) => b.created_at - a.created_at)

      // Deduplicate by ID and maintain size limit
      const seen = new Set<string>()
      const next: NostrEvent[] = []

      for (const ev of combined) {
        if (seen.has(ev.id)) continue
        seen.add(ev.id)
        next.push(ev)
        if (next.length >= MAX_FEED_SIZE) break
      }

      // Keep cache size under control - remove events not in current feed
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
  unfilteredFeedEvents.set([])
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
  // Check cache first (5 minute TTL)
  const cache = get(followingCache)
  const cached = cache.get(pubkey)
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    console.log(`✓ Using cached following list for ${pubkey.slice(0, 8)} (${cached.pubkeys.size} follows)`)
    return sanitizePubkeySet(cached.pubkeys)
  }

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
        if (tag[0] === 'p' && isHexPubkey(tag[1])) {
          follows.add(tag[1].toLowerCase())
        }
      }
    })

    sub.on('eose', finish)
    ;(sub as any).on?.('error', (err: unknown) => {
      console.warn('Failed to fetch following list:', err)
      finish()
    })
  })

  const sanitized = sanitizePubkeySet(follows)

  // Cache the result
  followingCache.update(c => {
    const next = new Map(c)
    next.set(pubkey, {
      pubkeys: sanitized,
      fetchedAt: Date.now(),
    })
    return next
  })

  return sanitized
}

async function fetchCirclesFromFollowing(follows: Set<string>, pubkey: string): Promise<Set<string>> {
  // Check cache first (5 minute TTL like following)
  const cache = get(circlesCache)
  const cached = cache.get(pubkey)
  const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    console.log(`✓ Using cached circles for ${pubkey.slice(0, 8)} (${cached.pubkeys.size} circles)`)
    return sanitizePubkeySet(cached.pubkeys)
  }

  console.log(`⏳ Fetching circles from ${follows.size} follows...`)
  const startTime = Date.now()

  const ndk = getNDK()
  const circleSet = new Set<string>()
  const authors = Array.from(follows).filter(isHexPubkey).map(pk => pk.toLowerCase())

  if (authors.length === 0) {
    return circleSet
  }

  const chunkSize = 50

  const fetchChunk = (chunk: string[], index: number) =>
    new Promise<void>(resolve => {
      // Add timeout per chunk to prevent hanging
      const timeout = setTimeout(() => {
        console.warn(`⚠️ Chunk ${index} timed out after 3s`)
        resolve()
      }, 3000)

      const sub = ndk.subscribe(
        { authors: chunk, kinds: [3], limit: 1 },
        { closeOnEose: true } as NDKSubscriptionOptions,
        undefined,
        false
      )

      const finish = () => {
        clearTimeout(timeout)
        sub.stop()
        resolve()
      }

      sub.on('event', (event: any) => {
        for (const tag of event.tags) {
          if (tag[0] === 'p' && isHexPubkey(tag[1])) {
            const pk = tag[1].toLowerCase()
            if (!follows.has(pk)) {
              circleSet.add(pk)
            }
          }
        }
      })

      sub.on('eose', finish)
      ;(sub as any).on?.('error', (err: unknown) => {
        console.warn(`Failed to fetch circles for chunk ${index}:`, err)
        finish()
      })
    })

  // Fetch all chunks in parallel for much faster loading
  const chunks = []
  for (let i = 0; i < authors.length; i += chunkSize) {
    chunks.push(authors.slice(i, i + chunkSize))
  }

  await Promise.all(chunks.map((chunk, idx) => fetchChunk(chunk, idx)))

  const sanitized = sanitizePubkeySet(circleSet)
  const duration = Date.now() - startTime

  // Cache the result
  circlesCache.update(c => {
    const next = new Map(c)
    next.set(pubkey, {
      pubkeys: sanitized,
      fetchedAt: Date.now(),
    })
    return next
  })

  console.log(`✓ Fetched ${sanitized.size} circles in ${duration}ms`)
  return sanitized
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

function stopSubscriptionsByLabel(label: FeedSource): void {
  const idsToRemove: string[] = []
  for (const [subId, sub] of subscriptionRefs.entries()) {
    if (subId.startsWith(`${label}:`)) {
      sub?.stop?.()
      subscriptionRefs.delete(subId)
      idsToRemove.push(subId)
    }
  }

  if (idsToRemove.length > 0) {
    activeSubscriptions.update(subs => {
      const next = new Set(subs)
      for (const id of idsToRemove) {
        next.delete(id)
      }
      return next
    })
  }
}

function startCirclesSubscription(authors: string[], reason: 'cached' | 'fallback' | 'fresh'): void {
  if (authors.length === 0) return

  const limitedAuthors = limitAuthors(authors)
  const sinceWindow = reason === 'fallback' ? 7 : 14

  console.log(
    `⚡ Subscribing to circles feed with ${limitedAuthors.length} authors (${reason})`
  )

  stopSubscriptionsByLabel('circles')

  subscribeWithFilter(
    {
      authors: limitedAuthors,
      kinds: [1, 6, 16],
      limit: 250,
      since: Math.floor(Date.now() / 1000) - 86400 * sinceWindow,
    },
    'circles'
  )

  feedLoading.set(false)
}

async function ensureFollowing(pubkey: string): Promise<Set<string>> {
  const existing = get(following)
  if (existing.size > 0) {
    return sanitizePubkeySet(existing)
  }
  const fetched = await fetchFollowing(pubkey)
  const next = sanitizePubkeySet(fetched)
  following.set(next)
  return next
}

async function ensureCircles(follows: Set<string>, pubkey: string): Promise<Set<string>> {
  if (follows.size === 0) {
    circles.set(new Set())
    return new Set()
  }
  // Always fetch (it will use cache if available)
  const fetched = await fetchCirclesFromFollowing(follows, pubkey)
  const sanitized = sanitizePubkeySet(fetched)
  circles.set(sanitized)
  return sanitized
}

/**
 * Subscribe to following feed with timeout and retry
 */
export async function subscribeToFollowingFeed(retryCount = 0): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      feedError.set('Not authenticated')
      feedLoading.set(false)
      return
    }

    feedLoading.set(true)
    feedError.set(null)

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Following feed subscription timeout')),
        SUBSCRIPTION_TIMEOUT
      )
    )

    // Create subscription promise
    const subscriptionPromise = new Promise<void>(async (resolve, reject) => {
      try {
        const follows = await fetchFollowing(user.pubkey)
        const followingSet = new Set(follows)
        following.set(followingSet)

        // refresh circles in background
        void ensureCircles(followingSet, user.pubkey)

        const authors = Array.from(followingSet)
        if (authors.length === 0) {
          feedError.set('Follow someone to see this feed')
          feedLoading.set(false)
          resolve()
          return
        }

        // Optimized for following feed: recent posts from trusted sources
        subscribeWithFilter(
          {
            authors,
            kinds: [1, 6, 16],
            limit: 200, // Increased for better coverage
            since: Math.floor(Date.now() / 1000) - 86400 * 7, // 7 days instead of 3
          },
          'following'
        )
        resolve()
      } catch (err) {
        reject(err)
      }
    })

    // Race timeout vs subscription
    await Promise.race([subscriptionPromise, timeoutPromise])

  } catch (err) {
    const errorMsg = String(err)
    console.error(`✗ Following feed error (attempt ${retryCount + 1}):`, errorMsg)

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`↻ Retrying following feed in ${RETRY_DELAY}ms...`)
      feedError.set(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`)
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return subscribeToFollowingFeed(retryCount + 1)
    }

    // Final error
    feedError.set(`Failed to load following feed: ${errorMsg}`)
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

    const liveCircles = get(circles)
    const cacheEntry = get(circlesCache).get(user.pubkey)
    let initialAuthorSet: Set<string> = liveCircles.size > 0
      ? new Set(liveCircles)
      : cacheEntry?.pubkeys
        ? new Set(cacheEntry.pubkeys)
        : new Set()

    if (initialAuthorSet.size > 0) {
      startCirclesSubscription(Array.from(initialAuthorSet), 'cached')
    } else {
      const fallbackAuthors = limitAuthors(followSet)
      if (fallbackAuthors.length > 0) {
        initialAuthorSet = new Set(fallbackAuthors)
        console.log('⌛ Circles cache empty — using following fallback while graph builds')
        startCirclesSubscription(fallbackAuthors, 'fallback')
      }
    }

    const initialSnapshot = new Set(initialAuthorSet)

    void ensureCircles(followSet, user.pubkey)
      .then(circleSet => {
        if (circleSet.size === 0) {
          if (initialSnapshot.size === 0) {
            feedLoading.set(false)
            feedError.set('No second-degree contacts yet')
          }
          return
        }

        if (setsEqual(circleSet, initialSnapshot)) {
          return
        }

        startCirclesSubscription(Array.from(circleSet), 'fresh')
      })
      .catch(err => {
        console.error('Failed to refresh circles graph:', err)
        if (initialSnapshot.size === 0) {
          feedLoading.set(false)
        }
        feedError.set(err instanceof Error ? err.message : String(err))
      })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to subscribe to circles feed:', err)
    feedError.set(message)
    feedLoading.set(false)
  }
}

/**
 * Subscribe to long-form content from following only (kind 30023)
 */
export async function subscribeToLongReadsFollowingFeed(): Promise<void> {
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

    const followAuthors = Array.from(followSet).filter(isHexPubkey).map(pk => pk.toLowerCase())

    if (followAuthors.length === 0) {
      feedLoading.set(false)
      feedError.set('No long-read authors discovered yet')
      return
    }

    console.log(`⚡ Loading long reads from ${followAuthors.length} following`)

    subscribeWithFilter(
      {
        authors: followAuthors,
        kinds: [30023],
        limit: 100,
        since: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days
      },
      'long-reads-following'
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to subscribe to long reads (following):', err)
    feedError.set(message)
    feedLoading.set(false)
  }
}

/**
 * Subscribe to long-form content from circles (kind 30023)
 */
export async function subscribeToLongReadsCirclesFeed(): Promise<void> {
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

    // Get circles (this will fetch if not cached)
    const circleSet = await ensureCircles(followSet, user.pubkey)

    const circleAuthors = Array.from(circleSet).filter(isHexPubkey).map(pk => pk.toLowerCase())

    if (circleAuthors.length === 0) {
      feedLoading.set(false)
      feedError.set('No circle authors discovered yet')
      return
    }

    console.log(`⚡ Loading long reads from ${circleAuthors.length} circles`)

    subscribeWithFilter(
      {
        authors: circleAuthors.slice(0, 500), // Limit to 500
        kinds: [30023],
        limit: 100,
        since: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days
      },
      'long-reads-circles'
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to subscribe to long reads (circles):', err)
    feedError.set(message)
    feedLoading.set(false)
  }
}

/**
 * Subscribe to long-form content (kind 30023) - legacy combined feed
 * @deprecated Use subscribeToLongReadsFollowingFeed or subscribeToLongReadsCirclesFeed instead
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

    // Check if we have cached circles to use immediately
    const cache = get(circlesCache)
    const cached = cache.get(user.pubkey)
    const circleSet = cached?.pubkeys ?? new Set<string>()

    // Combine following and circles for long-read authors
    // Limit to prevent overwhelming relays (prioritize follows over circles)
    const followAuthors = Array.from(followSet).filter(isHexPubkey).map(pk => pk.toLowerCase())
    const circleAuthors = Array.from(circleSet).filter(isHexPubkey).map(pk => pk.toLowerCase())

    // Take all follows + top circles up to 500 total authors max
    const maxAuthors = 500
    const authors = [
      ...followAuthors,
      ...circleAuthors.slice(0, Math.max(0, maxAuthors - followAuthors.length))
    ]

    if (authors.length === 0) {
      feedLoading.set(false)
      feedError.set('No long-read authors discovered yet')
      return
    }

    console.log(`⚡ Loading long reads from ${authors.length} authors (${followAuthors.length} follows + ${Math.min(circleAuthors.length, maxAuthors - followAuthors.length)} circles)`)

    // Refresh circles in background for next time (non-blocking)
    void ensureCircles(followSet, user.pubkey)

    // Use subscription instead of fetchEvents for better performance
    subscribeWithFilter(
      {
        authors,
        kinds: [30023],
        limit: 100,
        since: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days
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
 * Subscribe to global feed with timeout and retry
 */
export async function subscribeToGlobalFeed(retryCount = 0): Promise<void> {
  try {
    feedLoading.set(true)
    feedError.set(null)

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Global feed subscription timeout')),
        SUBSCRIPTION_TIMEOUT
      )
    )

    // Create subscription promise
    const subscriptionPromise = new Promise<void>((resolve) => {
      try {
        // Optimized for global feed: recent posts from all users
        subscribeWithFilter(
          {
            kinds: [1], // Text notes only
            limit: 150, // Increased from 100 for better coverage
            since: Math.floor(Date.now() / 1000) - 7200, // 2 hours for fresh content
          },
          'global'
        )
        // Resolve after subscription is set up (not waiting for events)
        resolve()
      } catch (err) {
        throw err
      }
    })

    // Race timeout vs subscription
    await Promise.race([subscriptionPromise, timeoutPromise])

  } catch (err) {
    const errorMsg = String(err)
    console.error(`✗ Global feed error (attempt ${retryCount + 1}):`, errorMsg)

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`↻ Retrying global feed in ${RETRY_DELAY}ms...`)
      feedError.set(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`)
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return subscribeToGlobalFeed(retryCount + 1)
    }

    // Final error
    feedError.set(`Failed to load global feed: ${errorMsg}`)
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

export async function fetchEventById(id: string): Promise<NostrEvent | null> {
  const cached = getEventById(id)
  if (cached) {
    queueEngagementHydration(collectEngagementTargets(cached))
    return cached
  }

  try {
    const ndk = getNDK()

    // Add timeout to prevent hanging
    const fetchPromise = ndk.fetchEvent(
      { ids: [id] },
      { closeOnEose: true } as NDKSubscriptionOptions
    )

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Fetch event timeout')), 8000)
    )

    const event = await Promise.race([fetchPromise, timeoutPromise])

    if (!event) {
      return null
    }

    const raw = (event as NDKEvent).rawEvent?.() ?? (event as unknown as NostrEvent)
    eventCache.set(raw.id, raw)
    void fetchUserMetadata(raw.pubkey)
    queueEngagementHydration(collectEngagementTargets(raw))

    return raw
  } catch (err) {
    console.error(`Failed to fetch event ${id.slice(0, 8)}:`, err)
    return null
  }
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

    const parsed = parseContent(current)
    const parentId = parsed.replyToId ?? null

    if (!parentId) break

    const parent = allEvents.find(e => e.id === parentId)
    if (!parent) break

    thread.unshift(parent)
    current = parent
  }

  // Get replies
  const replies = getReplies(event.id, allEvents).sort((a, b) => a.created_at - b.created_at)
  thread.push(...replies)

  return thread
}

/**
 * Validate post content before publishing
 */
function validatePostContent(content: string): void {
  if (!content) {
    throw new Error('Post cannot be empty')
  }

  const trimmed = content.trim()
  if (trimmed.length === 0) {
    throw new Error('Post cannot contain only whitespace')
  }

  if (trimmed.length > 5000) {
    throw new Error(`Post exceeds 5000 character limit (${trimmed.length} chars)`)
  }

  // Check for excessive URLs (spam detection)
  const urlCount = (trimmed.match(/https?:\/\//g) || []).length
  if (urlCount > 10) {
    throw new Error('Post contains too many URLs (max 10)')
  }
}

/**
 * Publish a note with validation
 */
export async function publishNote(content: string, replyTo?: NostrEvent): Promise<NostrEvent> {
  try {
    // Validate input
    validatePostContent(content)

    const ndk = getNDK()
    const user = getCurrentNDKUser()

    // Check authentication
    if (!user?.pubkey) {
      throw new Error('Not authenticated - please log in')
    }

    if (!ndk) {
      throw new Error('NDK not initialized')
    }

    if (!ndk.signer) {
      throw new Error('No signer available - please log in again')
    }

    // Validate reply target if provided
    if (replyTo) {
      if (!replyTo.id) {
        throw new Error('Invalid reply target')
      }
      if (typeof replyTo.id !== 'string' || replyTo.id.length !== 64) {
        throw new Error('Invalid event ID')
      }
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
    ndkEvent.content = content.trim()
    ndkEvent.tags = tags
    ndkEvent.created_at = Math.floor(Date.now() / 1000)

    await ndkEvent.sign()
    await ndkEvent.publish()

    console.log('✓ Post published:', ndkEvent.id)

    const raw = ndkEvent.rawEvent()
    recordUserEvent(raw)
    addEventToFeed(raw, 'local')
    if (replyTo?.id) {
      commentedThreads.update(set => {
        if (set.has(replyTo.id)) return set
        const next = new Set(set)
        next.add(replyTo.id)
        return next
      })
      persistInteractionsSnapshot()
    }

    return raw
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('✗ Publish failed:', errorMsg)
    throw new Error(`Failed to publish post: ${errorMsg}`)
  }
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

  incrementLikeCount(eventId, 1)
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

  incrementRepostCount(event.id, 1)
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

/**
 * Load user's own interactions (likes, reposts, zaps) to populate UI state
 */
export async function loadUserInteractions(): Promise<void> {
  const ndk = getNDK()
  const user = getCurrentNDKUser()

  if (!user?.pubkey) {
    console.log('No user authenticated, skipping interaction load')
    return
  }

  try {
    console.log('Loading user interactions...')

    // Load reactions (kind:7 - likes)
    const reactions = await ndk.fetchEvents(
      {
        kinds: [7],
        authors: [user.pubkey],
        limit: 500,
      },
      { closeOnEose: true }
    )

    const likedEventIds = new Set<string>()
    for (const reaction of reactions) {
      const eventTag = reaction.tags.find((t: string[]) => t[0] === 'e')
      if (eventTag && eventTag[1]) {
        likedEventIds.add(eventTag[1])
      }
    }
    likedEvents.set(likedEventIds)
    console.log(`Loaded ${likedEventIds.size} likes`)

    // Load reposts (kind:6)
    const reposts = await ndk.fetchEvents(
      {
        kinds: [6],
        authors: [user.pubkey],
        limit: 500,
      },
      { closeOnEose: true }
    )

    const repostedEventIds = new Set<string>()
    for (const repost of reposts) {
      const eventTag = repost.tags.find((t: string[]) => t[0] === 'e')
      if (eventTag && eventTag[1]) {
        repostedEventIds.add(eventTag[1])
      }
    }
    repostedEvents.set(repostedEventIds)
    console.log(`Loaded ${repostedEventIds.size} reposts`)

    // Load zaps (kind:9735 - zap receipts we sent)
    const zaps = await ndk.fetchEvents(
      {
        kinds: [9735],
        authors: [user.pubkey],
        limit: 500,
      },
      { closeOnEose: true }
    )

    const zappedEventMap = new Map<string, number>()
    for (const zap of zaps) {
      const eventTag = zap.tags.find((t: string[]) => t[0] === 'e')
      const amountTag = zap.tags.find((t: string[]) => t[0] === 'amount')
      if (eventTag && eventTag[1]) {
        const eventId = eventTag[1]
        const amount = amountTag ? parseInt(amountTag[1], 10) / 1000 : 0
        zappedEventMap.set(eventId, (zappedEventMap.get(eventId) || 0) + amount)
      }
    }
    zappedEvents.set(zappedEventMap)
    console.log(`Loaded ${zappedEventMap.size} zapped events`)

    // Load replies authored by user (kind 1) to know which threads were commented
    const replies = await ndk.fetchEvents(
      {
        kinds: [1],
        authors: [user.pubkey],
        limit: 500,
      },
      { closeOnEose: true }
    )

    const commentedSet = new Set<string>()
    for (const reply of replies) {
      const eventTag = reply.tags.find((t: string[]) => t[0] === 'e')
      if (eventTag && eventTag[1]) {
        commentedSet.add(eventTag[1])
      }
    }
    commentedThreads.set(commentedSet)
    console.log(`Loaded ${commentedSet.size} commented threads`)

    persistInteractionsSnapshot()
  } catch (err) {
    console.error('Failed to load user interactions:', err)
  }
}
