import { writable, derived } from 'svelte/store'
import type { NostrEvent } from '$types/nostr'
import type { UserMetadata } from '$types/user'

export type FeedTab = 'following' | 'circles' | 'global' | 'long-reads'

// Feed events (single timeline for the currently active feed)
export const feedEvents = writable<NostrEvent[]>([])

// Loading / error state for the active feed
export const feedLoading = writable(false)
export const feedError = writable<string | null>(null)

// Metadata cache for user profiles
export const metadataCache = writable<Map<string, UserMetadata>>(new Map())
export const userEventIds = writable<Set<string>>(new Set())

// Relationship graph with cache metadata
export interface CachedFollowingList {
  pubkeys: Set<string>
  fetchedAt: number
}

export const following = writable<Set<string>>(new Set())
export const followingCache = writable<Map<string, CachedFollowingList>>(new Map()) // pubkey -> cached follows
export const circles = writable<Set<string>>(new Set())
export const circlesCache = writable<Map<string, CachedFollowingList>>(new Map()) // pubkey -> cached circles
export const longReadAuthors = derived([following, circles], ([$following, $circles]) => {
  const authors = new Set($following)
  for (const pk of $circles) {
    authors.add(pk)
  }
  return authors
})

// Subscriptions state
export const activeSubscriptions = writable<Set<string>>(new Set())

// Liked events (for optimistic UI)
export const likedEvents = writable<Set<string>>(new Set())

// Reposted events
export const repostedEvents = writable<Set<string>>(new Set())

// Zapped events (track which we've zapped)
export const zappedEvents = writable<Map<string, number>>(new Map()) // eventId -> amount

// Compose modal state
export const showCompose = writable(false)
export const composeReplyTo = writable<NostrEvent | null>(null)

// Derived: total feed count
export const feedCount = derived(feedEvents, $events => $events.length)

// Derived: has active subscriptions
export const hasActiveSubscriptions = derived(activeSubscriptions, $subs => $subs.size > 0)
