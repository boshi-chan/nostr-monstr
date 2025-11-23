import { getNDK, ensureRelayConnection } from '$lib/ndk'
import type { NostrEvent } from '$types/nostr'
import {
  likeCounts,
  repostCounts,
  zapTotals,
  replyCounts,
  reactionBreakdowns,
} from '$stores/feed'
import { isReply } from '$lib/content'
import { logger } from '$lib/logger'

const MAX_BATCH = 10 // Reduced from 40 to avoid overwhelming relays
const ENGAGEMENT_FETCH_CHUNK = 1 // Query 1 event at a time - best relay compatibility
const FETCH_TTL = 60_000 // 1 minute cache per event
const LOOKBACK_DAYS = 30 // Look back 30 days so profile/thread views show metrics on older posts
const pendingEventIds = new Set<string>()
const lastFetchedAt = new Map<string, number>()
let debounceHandle: ReturnType<typeof setTimeout> | null = null
let inFlight = false
let bulkLoadMode = false // Track if we're in a bulk load scenario

function now(): number {
  return Date.now()
}

function scheduleFlush(immediate = false): void {
  if (debounceHandle) {
    clearTimeout(debounceHandle)
    debounceHandle = null
  }
  
  // For bulk loads or immediate requests, flush right away
  // Otherwise use a short debounce for scroll-based loading
  if (immediate || bulkLoadMode) {
    void flushQueue()
  } else {
    debounceHandle = setTimeout(() => {
      debounceHandle = null
      void flushQueue()
    }, 120)
  }
}

async function flushQueue(): Promise<void> {
  if (inFlight) {
    return
  }
  const ids: string[] = []
  for (const id of pendingEventIds) {
    ids.push(id)
    pendingEventIds.delete(id)
    if (ids.length >= MAX_BATCH) break
  }

  if (ids.length === 0) {
    return
  }

  inFlight = true
  try {
    // Add 30-second timeout to prevent hanging forever (increased from 10s)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Engagement hydration timed out after 30s')), 30000)
    )
    await Promise.race([hydrateEngagementCounts(ids), timeoutPromise])
    const stamp = now()
    for (const id of ids) {
      lastFetchedAt.set(id, stamp)
    }
  } catch (err) {
    logger.warn('Engagement fetch timed out, will retry')
    // Don't re-queue on timeout, just let them expire
  } finally {
    inFlight = false
    if (pendingEventIds.size > 0) {
      scheduleFlush()
    }
  }
}

export function queueEngagementHydration(
  ids: Iterable<string | null | undefined>,
  immediate = false
): void {
  const stamp = now()
  const idArray = Array.from(ids).filter((id): id is string => !!id)
  
  // Detect bulk loads (10+ events) and enable bulk mode
  if (idArray.length >= 10) {
    bulkLoadMode = true
    // Reset bulk mode after processing
    setTimeout(() => {
      bulkLoadMode = false
    }, 5000)
  }
  
  for (const id of idArray) {
    const last = lastFetchedAt.get(id)
    if (last && stamp - last < FETCH_TTL) continue
    pendingEventIds.add(id)
  }

  if (pendingEventIds.size === 0) {
    return
  }

  scheduleFlush(immediate)
}

function getTargetEventId(event: NostrEvent | any): string | null {
  if (!event?.tags) return null
  const tag = event.tags.find((t: string[]) => t[0] === 'e' && typeof t[1] === 'string')
  return tag ? tag[1] : null
}

function parseZapAmount(event: NostrEvent | any): number {
  if (!event?.tags) return 0

  // For kind 9735 (zap receipt), amount is in the description tag
  if (event.kind === 9735) {
    const descriptionTag = event.tags.find((t: string[]) => t[0] === 'description')
    if (descriptionTag && descriptionTag[1]) {
      try {
        const zapRequest = JSON.parse(descriptionTag[1])
        const amountTag = zapRequest.tags?.find((t: string[]) => t[0] === 'amount' && typeof t[1] === 'string')
        if (amountTag) {
          const raw = parseInt(amountTag[1], 10)
          if (!Number.isNaN(raw)) {
            return Math.max(raw / 1000, 0) // convert msats -> sats
          }
        }
      } catch (err) {
        // Failed to parse description, fall through to direct amount check
      }
    }
  }

  // For kind 9734 (zap request) or fallback, check for direct amount tag
  const tag = event.tags.find((t: string[]) => t[0] === 'amount' && typeof t[1] === 'string')
  if (!tag) return 0
  const raw = parseInt(tag[1], 10)
  if (Number.isNaN(raw)) return 0
  return Math.max(raw / 1000, 0) // convert msats -> sats
}

async function hydrateEngagementCounts(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  let ndk
  try {
    ndk = getNDK()
  } catch (err) {
    logger.error('Failed to get NDK instance:', err)
    return
  }

  // Ensure we have at least one relay connected before attempting to fetch
  const hasConnection = await ensureRelayConnection(2000)
  if (!hasConnection) {
    logger.warn('No relays connected - cannot fetch engagement. Re-queueing.')
    ids.forEach(id => pendingEventIds.add(id))
    scheduleFlush()
    return
  }

  // Check relay pool status (status 5 = connected in NDK)
  const poolRelays = Array.from(ndk.pool.relays.values())
  const connectedPoolRelays = poolRelays.filter(r => r.status === 5)

  if (connectedPoolRelays.length === 0) {
    logger.warn('No relays connected in pool! Re-queueing engagement hydration.')
    ids.forEach(id => pendingEventIds.add(id))
    scheduleFlush()
    return
  }

  const likeMap = new Map<string, number>()
  const repostMap = new Map<string, number>()
  const zapMap = new Map<string, number>()
  const replyMap = new Map<string, number>()
  const reactionMap = new Map<string, Map<string, number>>()

  // For bulk loads, process all events together; otherwise use chunks
  const chunkSize = bulkLoadMode ? Math.min(ids.length, 20) : ENGAGEMENT_FETCH_CHUNK
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize))
  }

  for (const chunk of chunks) {
    // Add time constraint to help relays process queries faster
    const since = Math.floor(Date.now() / 1000) - (LOOKBACK_DAYS * 24 * 60 * 60)
    const filter = { '#e': chunk, since }

    // Use subscriptions instead of fetchEvents to avoid waiting for EOSE from all relays
    const fetchViaSubscription = async (kind: number): Promise<Set<any>> => {
      return new Promise((resolve) => {
        const events = new Set()
        let resolved = false
        // Shorter timeout for bulk loads (they're more likely to have data)
        const timeout = bulkLoadMode ? 3000 : 2000

        const sub = ndk.subscribe(
          { kinds: [kind], ...filter },
          { closeOnEose: true }
        )

        sub.on('event', (event: any) => {
          events.add(event)
        })

        sub.on('eose', () => {
          // Resolve immediately after first EOSE
          if (!resolved) {
            resolved = true
            sub.stop()
            resolve(events)
          }
        })

        // Timeout after specified duration
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            sub.stop()
            resolve(events)
          }
        }, timeout)
      })
    }

    const [likeEvents, repostEvents, zapEvents, replyEvents] = await Promise.all([
      fetchViaSubscription(7),
      fetchViaSubscription(6),
      fetchViaSubscription(9735),
      fetchViaSubscription(1),
    ])

    for (const event of likeEvents) {
      const raw = event.rawEvent ? event.rawEvent() : event
      const target = getTargetEventId(raw)
      if (!target) continue
      const emoji = (raw.content || '+').trim() || '+'
      
      // Track all reactions in the breakdown
      const bucket = reactionMap.get(target) ?? new Map<string, number>()
      bucket.set(emoji, (bucket.get(emoji) ?? 0) + 1)
      reactionMap.set(target, bucket)
      
      // Only count "+" reactions (or empty/default) as likes
      // Other emoji reactions are tracked in reactionBreakdown but not in likeCount
      if (emoji === '+') {
        likeMap.set(target, (likeMap.get(target) ?? 0) + 1)
      }
    }

    for (const event of replyEvents) {
      const raw = event.rawEvent ? event.rawEvent() : event
      // Only count actual replies, not quotes or mentions
      if (!isReply(raw)) continue
      const target = getTargetEventId(raw)
      if (!target) continue
      replyMap.set(target, (replyMap.get(target) ?? 0) + 1)
    }

    for (const event of repostEvents) {
      const target = getTargetEventId(event.rawEvent ? event.rawEvent() : event)
      if (!target) continue
      repostMap.set(target, (repostMap.get(target) ?? 0) + 1)
    }

    for (const event of zapEvents) {
      const raw = event.rawEvent ? event.rawEvent() : event
      const target = getTargetEventId(raw)
      if (!target) continue
      const amount = parseZapAmount(raw)
      if (amount <= 0) continue
      zapMap.set(target, (zapMap.get(target) ?? 0) + amount)
    }
  }

  likeCounts.update(store => {
    const next = new Map(store)
    for (const id of ids) {
      // Set count even if 0, so the Post component knows we fetched it
      next.set(id, likeMap.get(id) ?? 0)
    }
    return next
  })

  repostCounts.update(store => {
    const next = new Map(store)
    for (const id of ids) {
      next.set(id, repostMap.get(id) ?? 0)
    }
    return next
  })

  zapTotals.update(store => {
    const next = new Map(store)
    for (const id of ids) {
      next.set(id, zapMap.get(id) ?? 0)
    }
    return next
  })

  replyCounts.update(store => {
    const next = new Map(store)
    for (const id of ids) {
      next.set(id, replyMap.get(id) ?? 0)
    }
    return next
  })

  reactionBreakdowns.update(store => {
    const next = new Map(store)
    for (const id of ids) {
      next.set(id, reactionMap.get(id) ?? new Map<string, number>())
    }
    return next
  })
}

function incrementMapCount(store: typeof likeCounts | typeof repostCounts, id: string, delta: number): void {
  store.update(map => {
    const next = new Map(map)
    next.set(id, (next.get(id) ?? 0) + delta)
    return next
  })
}

export function incrementLikeCount(id: string, delta = 1): void {
  if (!id) return
  incrementMapCount(likeCounts, id, delta)
}

export function incrementReactionCount(id: string, emoji: string): void {
  if (!id) return
  reactionBreakdowns.update(map => {
    const next = new Map(map)
    const bucket = new Map(next.get(id) ?? new Map<string, number>())
    bucket.set(emoji, (bucket.get(emoji) ?? 0) + 1)
    next.set(id, bucket)
    return next
  })
}

export function incrementRepostCount(id: string, delta = 1): void {
  if (!id) return
  incrementMapCount(repostCounts, id, delta)
}

export function incrementZapTotal(id: string, amount: number): void {
  if (!id || amount === 0) return
  zapTotals.update(map => {
    const next = new Map(map)
    next.set(id, (next.get(id) ?? 0) + amount)
    return next
  })
}

export function incrementReplyCount(id: string, delta = 1): void {
  if (!id) return
  incrementMapCount(replyCounts, id, delta)
}

