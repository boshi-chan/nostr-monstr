import { writable, derived } from 'svelte/store'
import type { NostrEvent } from '$types/nostr'
import type { UserMetadata } from '$types/user'
import { feedFilters } from './feedFilters'
import { isReply, isRepostEvent, hasMedia, isBot } from '$lib/content'

export type FeedTab = 'following' | 'circles' | 'global'

// Unfiltered feed events (single timeline for the currently active feed)
export const unfilteredFeedEvents = writable<NostrEvent[]>([])

// Feed events (filtered view based on feedFilters) - derived store
// Following AI_Guidelines: Use derived stores for computed values
export const feedEvents = derived(
  [unfilteredFeedEvents, feedFilters],
  ([unfilteredEvents, filters]) => {
    // Cache event classifications to avoid repeated expensive checks
    return unfilteredEvents.filter(event => {
      if (!filters.showLongReads && event.kind === 30023) return false

      // Early exit for bot filter (applies to all types)
      if (!filters.showBots && isBot(event)) {
        return false
      }

      // Early exit for media filter (applies to all types)
      if (!filters.showMedia && hasMedia(event)) {
        return false
      }

      // Classify event type (mutually exclusive checks)
      // Order matters: check repost first as it's most specific
      const isRepost = isRepostEvent(event)
      if (isRepost) {
        return filters.showReposts
      }

      const isReplyPost = isReply(event)
      if (isReplyPost) {
        return filters.showReplies
      }

      // It's a regular post - always show
      return true
    })
  }
)

// Loading / error state for the active feed
export const feedLoading = writable(false)
export const feedError = writable<string | null>(null)

// Infinite scroll state
export const canLoadMore = writable(true) // Whether more posts can be loaded
export const isLoadingMore = writable(false) // Whether currently loading older posts
export const oldestTimestamp = writable<number | null>(null) // Timestamp of oldest post for pagination

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
export const longReadAuthors = derived([following, circles], ([followingSet, circlesSet]) => {
  const authors = new Set(followingSet)
  for (const pk of circlesSet) {
    authors.add(pk)
  }
  return authors
})

// Subscriptions state
export const activeSubscriptions = writable<Set<string>>(new Set())

// Liked events (for optimistic UI)
export const likedEvents = writable<Set<string>>(new Set())
// Reaction events authored by the user, keyed by target event id (for unliking)
export const likedReactionEvents = writable<Map<string, string>>(new Map())

// Reposted events
export const repostedEvents = writable<Set<string>>(new Set())

// Zapped events (track which we've zapped)
export const zappedEvents = writable<Map<string, number>>(new Map()) // eventId -> amount

// Aggregate engagement counts
export const likeCounts = writable<Map<string, number>>(new Map())
export const repostCounts = writable<Map<string, number>>(new Map())
export const zapTotals = writable<Map<string, number>>(new Map()) // total sats per event
export const replyCounts = writable<Map<string, number>>(new Map())
export const commentedThreads = writable<Set<string>>(new Set())
export const reactionBreakdowns = writable<Map<string, Map<string, number>>>(new Map())

// Compose modal state
export const showCompose = writable(false)
export const composeReplyTo = writable<NostrEvent | null>(null)
export const composeQuoteOf = writable<NostrEvent | null>(null)

// Derived: total feed count
export const feedCount = derived(feedEvents, events => events.length)

// Derived: has active subscriptions
export const hasActiveSubscriptions = derived(activeSubscriptions, subs => subs.size > 0)
