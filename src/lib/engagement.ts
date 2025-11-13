import { getNDK } from '$lib/ndk'
import type { NostrEvent } from '$types/nostr'
import {
  likeCounts,
  repostCounts,
  zapTotals,
  replyCounts,
} from '$stores/feed'

const MAX_BATCH = 40
const FETCH_TTL = 60_000 // 1 minute cache per event
const pendingEventIds = new Set<string>()
const lastFetchedAt = new Map<string, number>()
let debounceHandle: ReturnType<typeof setTimeout> | null = null
let inFlight = false

function now(): number {
  return Date.now()
}

function scheduleFlush(): void {
  if (debounceHandle) return
  debounceHandle = setTimeout(() => {
    debounceHandle = null
    void flushQueue()
  }, 120)
}

async function flushQueue(): Promise<void> {
  if (inFlight) return
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
    await hydrateEngagementCounts(ids)
    const stamp = now()
    for (const id of ids) {
      lastFetchedAt.set(id, stamp)
    }
  } catch (err) {
    console.error('Failed to hydrate engagement counts:', err)
    // Re-queue so we can retry later
    for (const id of ids) {
      pendingEventIds.add(id)
    }
    scheduleFlush()
  } finally {
    inFlight = false
    if (pendingEventIds.size > 0) {
      scheduleFlush()
    }
  }
}

export function queueEngagementHydration(ids: Iterable<string | null | undefined>): void {
  const stamp = now()
  for (const id of ids) {
    if (!id) continue
    const last = lastFetchedAt.get(id)
    if (last && stamp - last < FETCH_TTL) continue
    pendingEventIds.add(id)
  }

  if (pendingEventIds.size === 0) {
    return
  }

  scheduleFlush()
}

function getTargetEventId(event: NostrEvent | any): string | null {
  if (!event?.tags) return null
  const tag = event.tags.find((t: string[]) => t[0] === 'e' && typeof t[1] === 'string')
  return tag ? tag[1] : null
}

function parseZapAmount(event: NostrEvent | any): number {
  if (!event?.tags) return 0
  const tag = event.tags.find((t: string[]) => t[0] === 'amount' && typeof t[1] === 'string')
  if (!tag) return 0
  const raw = parseInt(tag[1], 10)
  if (Number.isNaN(raw)) return 0
  return Math.max(raw / 1000, 0) // convert msats -> sats
}

async function hydrateEngagementCounts(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const ndk = getNDK()
  const filter = { '#e': ids }

  const [likeEvents, repostEvents, zapEvents, replyEvents] = await Promise.all([
    ndk.fetchEvents({ kinds: [7], ...filter, limit: 2000 }, { closeOnEose: true }),
    ndk.fetchEvents({ kinds: [6], ...filter, limit: 2000 }, { closeOnEose: true }),
    ndk.fetchEvents({ kinds: [9735], ...filter, limit: 2000 }, { closeOnEose: true }),
    ndk.fetchEvents({ kinds: [1], ...filter, limit: 2000 }, { closeOnEose: true }),
  ])

  const likeMap = new Map<string, number>()
  const repostMap = new Map<string, number>()
  const zapMap = new Map<string, number>()
  const replyMap = new Map<string, number>()

  for (const event of likeEvents) {
    const target = getTargetEventId(event.rawEvent ? event.rawEvent() : event)
    if (!target) continue
    likeMap.set(target, (likeMap.get(target) ?? 0) + 1)
  }

  for (const event of replyEvents) {
    const target = getTargetEventId(event.rawEvent ? event.rawEvent() : event)
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

  likeCounts.update(store => {
    const next = new Map(store)
    for (const id of ids) {
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
