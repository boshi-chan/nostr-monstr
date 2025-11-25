/**
 * Thread building and navigation utilities
 * Handles complete thread loading, tree building, and navigation
 */

import type { NostrEvent } from '$types/nostr'
import { parseContent } from './content'
import { getNDK } from './ndk'
import { getEventById, fetchEventById } from './feed-ndk'
import { normalizeEvent } from '$lib/event-validation'
import { logger } from './logger'
import { writable, get } from 'svelte/store'

export interface ThreadNode {
  event: NostrEvent
  depth: number
  isMainEvent: boolean
  isHighlighted: boolean
  parentId: string | null
  replyCount: number
  replies: ThreadNode[]
  isQuote: boolean
  quotedEventId: string | null
}

export interface ThreadContext {
  rootPost: NostrEvent | null
  mainEvent: NostrEvent
  allEvents: NostrEvent[]
  threadTree: ThreadNode | null
  pathToMain: NostrEvent[]
  totalPostsInThread: number
}

export interface StreamingThreadContext {
  mainEvent: NostrEvent
  ancestors: NostrEvent[]
  replies: NostrEvent[]
  rootPost: NostrEvent | null
  isComplete: boolean
}

const MAX_ANCESTORS = 100
const MAX_REPLIES = 500

// Cache for reply fetches to avoid redundant network requests
const repliesCache = new Map<string, { replies: NostrEvent[]; fetchedAt: number }>()
const REPLIES_CACHE_TTL = 30000 // 30 seconds

/**
 * Subscribe to thread updates with instant streaming (like feeds)
 * Returns immediately with initial event, then streams ancestors and replies
 */
export function subscribeToThread(
  event: NostrEvent,
  onUpdate: (context: StreamingThreadContext) => void
): () => void {
  const ndk = getNDK()
  const subscriptions: Array<{ stop: () => void }> = []

  const seenEvents = new Set<string>([event.id])
  const ancestors: NostrEvent[] = []
  const replies: NostrEvent[] = []
  let rootPost: NostrEvent | null = null
  let isComplete = false

  // Emit initial state immediately
  onUpdate({
    mainEvent: event,
    ancestors: [],
    replies: [],
    rootPost: null,
    isComplete: false
  })

  // Helper to emit updates
  const emitUpdate = () => {
    onUpdate({
      mainEvent: event,
      ancestors: [...ancestors],
      replies: [...replies],
      rootPost,
      isComplete
    })
  }

  // 1. Start fetching ancestors (going up the chain)
  void (async () => {
    try {
      let current: NostrEvent | null = event
      let count = 0

      while (current && count < MAX_ANCESTORS) {
        const parsed = parseContent(current)
        const parentId = parsed.replyToId ?? parsed.rootId ?? null

        if (!parentId || seenEvents.has(parentId)) {
          break
        }

        seenEvents.add(parentId)

        let parent: NostrEvent | null = getEventById(parentId) ?? null
        if (!parent) {
          try {
            parent = await fetchEventById(parentId)
          } catch (err) {
            logger.warn('Failed to fetch ancestor:', err)
            break
          }
        }

        if (!parent) break

        // Add ancestor and emit update immediately
        ancestors.unshift(parent)
        if (!rootPost) {
          rootPost = parent
        }
        emitUpdate()

        current = parent
        count++
      }

      // Final ancestor is the root
      if (ancestors.length > 0) {
        rootPost = ancestors[0]
        emitUpdate()
      } else {
        rootPost = event
      }
    } catch (err) {
      logger.error('Failed to fetch ancestors:', err)
    }
  })()

  // 2. Subscribe to replies (streaming, like feed subscriptions)
  // Start with just the main event, will update as ancestors come in
  const startReplySubscription = () => {
    const idsToWatch = [event.id]

    // Add ancestors as they arrive
    for (const ancestor of ancestors) {
      idsToWatch.push(ancestor.id)
    }

    if (rootPost) {
      idsToWatch.push(rootPost.id)
    }

    const replySub = ndk.subscribe(
      {
        kinds: [1], // Text notes only for now
        '#e': idsToWatch,
      },
      { closeOnEose: false } // Keep subscription open!
    )

    replySub.on('event', (ndkEvent: any) => {
      try {
        const replyEvent = normalizeEvent(ndkEvent.rawEvent())

        if (replyEvent && !seenEvents.has(replyEvent.id) && replyEvent.id !== event.id) {
          seenEvents.add(replyEvent.id)
          replies.push(replyEvent)
          emitUpdate()
        }
      } catch (err) {
        logger.warn('Failed to process reply event:', err)
      }
    })

    subscriptions.push({ stop: () => replySub.stop() })
  }

  // Start reply subscription immediately
  startReplySubscription()

  // Return cleanup function
  return () => {
    subscriptions.forEach(sub => sub.stop())
  }
}

/**
 * Find the root post in a thread by traversing up the reply chain
 */
export async function findRootPost(event: NostrEvent): Promise<NostrEvent> {
  const visited = new Set<string>()
  let current: NostrEvent | null = event

  while (current && !visited.has(current.id)) {
    visited.add(current.id)

    const parsed = parseContent(current)
    const parentId = parsed.replyToId ?? parsed.rootId ?? null

    if (!parentId) {
      // No parent, this is the root
      return current
    }

    let parent: NostrEvent | null = getEventById(parentId) ?? null
    if (!parent) {
      try {
        parent = await fetchEventById(parentId)
      } catch (err) {
        logger.warn('Failed to fetch parent event:', err)
        // Return current as root if we can't fetch parent
        return current
      }
    }

    if (!parent) {
      // Can't fetch parent, return current as root
      return current
    }

    current = parent
  }

  return current || event
}

/**
 * Fetch all ancestors of an event
 */
async function fetchAllAncestors(event: NostrEvent): Promise<NostrEvent[]> {
  const ancestors: NostrEvent[] = []
  const visited = new Set<string>([event.id])
  let current: NostrEvent | null = event
  let count = 0

  while (current && count < MAX_ANCESTORS) {
    const parsed = parseContent(current)
    const parentId = parsed.replyToId ?? parsed.rootId ?? null

    if (!parentId || visited.has(parentId)) {
      break
    }

    visited.add(parentId)

    let parent: NostrEvent | null = getEventById(parentId) ?? null
    if (!parent) {
      try {
        parent = await fetchEventById(parentId)
      } catch (err) {
        logger.warn('Failed to fetch ancestor:', err)
        break
      }
    }

    if (!parent) {
      break
    }

    ancestors.unshift(parent) // Add to beginning to maintain order
    current = parent
    count++
  }

  return ancestors
}

/**
 * Fetch all direct replies to an event
 */
async function fetchDirectReplies(eventId: string): Promise<NostrEvent[]> {
  // Check cache first
  const cached = repliesCache.get(eventId)
  if (cached && Date.now() - cached.fetchedAt < REPLIES_CACHE_TTL) {
    return cached.replies
  }

  try {
    const ndk = getNDK()

    // Use subscription instead of fetchEvents - returns as soon as first relay responds
    const result = await new Promise<Set<any>>((resolve) => {
      const events = new Set()
      let eoseCount = 0

      const sub = ndk.subscribe(
        { kinds: [1, 6, 7, 9735], '#e': [eventId] }, // Include reactions and zaps
        { closeOnEose: true }
      )

      sub.on('event', (event: any) => {
        events.add(event)
      })

      sub.on('eose', () => {
        eoseCount++
        // Resolve after first relay completes
        if (eoseCount >= 1) {
          sub.stop()
          resolve(events)
        }
      })

      // Timeout after 3 seconds
      setTimeout(() => {
        sub.stop()
        resolve(events)
      }, 3000)
    })

    const replies = Array.from(result)
      .map(item => normalizeEvent(item as NostrEvent))
      .filter((event): event is NostrEvent => Boolean(event))
      .filter(event => event.kind === 1 || event.kind === 6) // Only kind 1 (notes) and 6 (reposts), not reactions or zaps

    // Cache the result
    repliesCache.set(eventId, { replies, fetchedAt: Date.now() })

    // Keep cache size under control
    if (repliesCache.size > 100) {
      const oldestKey = repliesCache.keys().next().value
      if (oldestKey) {
        repliesCache.delete(oldestKey)
      }
    }

    return replies
  } catch (err) {
    logger.warn('Failed to fetch direct replies:', err)
    return []
  }
}

/**
 * Recursively fetch all replies to an event and its replies
 */
async function fetchAllReplies(
  post: NostrEvent,
  depth = 0,
  maxDepth = 3
): Promise<NostrEvent[]> {
  if (depth > maxDepth) {
    return []
  }

  const allReplies: NostrEvent[] = []
  const processed = new Set<string>()

  // Fetch replies level by level in parallel
  let currentLevel: NostrEvent[] = [post]
  let currentDepth = 0

  while (currentLevel.length > 0 && currentDepth <= maxDepth && allReplies.length < MAX_REPLIES) {
    // Mark all current level events as processed
    for (const event of currentLevel) {
      processed.add(event.id)
    }

    // Fetch replies for all events at this level in parallel
    const repliesPromises = currentLevel.map(event => fetchDirectReplies(event.id))
    const repliesArrays = await Promise.all(repliesPromises)

    // Flatten and deduplicate replies
    const nextLevel: NostrEvent[] = []
    for (const replies of repliesArrays) {
      for (const reply of replies) {
        if (!processed.has(reply.id) && allReplies.length < MAX_REPLIES) {
          allReplies.push(reply)
          nextLevel.push(reply)
          processed.add(reply.id)
        }
      }
    }

    currentLevel = nextLevel
    currentDepth++
  }

  return allReplies
}

/**
 * Build complete thread context for an event
 */
export async function buildCompleteThread(event: NostrEvent): Promise<ThreadContext> {
  const THREAD_LOAD_TIMEOUT = 10000 // 10 seconds

  try {
    // Wrap the entire operation in a timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Thread loading timeout')), THREAD_LOAD_TIMEOUT)
    )

    const threadPromise = (async () => {
      // Parallel fetch: ancestors and replies
      const [ancestors, rootPost] = await Promise.all([
        fetchAllAncestors(event),
        findRootPost(event),
      ])

      // Fetch all replies (including nested)
      const allReplies = await fetchAllReplies(rootPost)

      // Combine all events
      const allEvents = [rootPost, ...ancestors, event, ...allReplies]
      const uniqueEvents = Array.from(
        new Map(allEvents.map(e => [e.id, e])).values()
      )

      // Build thread tree
      const threadTree = buildThreadTree(rootPost, uniqueEvents, event.id)

      // Find path from root to main event
      const pathToMain = findPathInThread(threadTree, event.id)

      return {
        rootPost,
        mainEvent: event,
        allEvents: uniqueEvents,
        threadTree,
        pathToMain,
        totalPostsInThread: uniqueEvents.length,
      }
    })()

    return await Promise.race([threadPromise, timeoutPromise])
  } catch (err) {
    logger.error('Failed to build complete thread:', err)
    // Return minimal thread with just the event
    return {
      rootPost: null,
      mainEvent: event,
      allEvents: [event],
      threadTree: null,
      pathToMain: [event],
      totalPostsInThread: 1,
    }
  }
}

/**
 * Build thread tree from events
 */
function buildThreadTree(
  rootEvent: NostrEvent,
  allEvents: NostrEvent[],
  highlightEventId: string
): ThreadNode {
  function buildNode(event: NostrEvent, depth: number, parentId: string | null): ThreadNode {
    const parsed = parseContent(event)
    const isMainEvent = event.id === highlightEventId

    // Find direct replies
    const replies: ThreadNode[] = []
    const replyCount = allEvents.filter(e => {
      const eParsed = parseContent(e)
      return eParsed.replyToId === event.id || eParsed.rootId === event.id
    }).length

    // Get replies for this event
    const directReplies = allEvents.filter(e => {
      const eParsed = parseContent(e)
      return (eParsed.replyToId === event.id || (eParsed.rootId === event.id && !eParsed.replyToId))
    })

    for (const reply of directReplies) {
      replies.push(buildNode(reply, depth + 1, event.id))
    }

    // Sort replies by timestamp
    replies.sort((a, b) => a.event.created_at - b.event.created_at)

    return {
      event,
      depth,
      isMainEvent,
      isHighlighted: isMainEvent,
      parentId,
      replyCount,
      replies,
      isQuote: parsed.quotes.length > 0,
      quotedEventId: parsed.quotes[0] ?? null,
    }
  }

  return buildNode(rootEvent, 0, null)
}

/**
 * Find path from root to specific event in thread tree
 */
function findPathInThread(node: ThreadNode | null, targetId: string): NostrEvent[] {
  if (!node) return []

  const path: NostrEvent[] = []

  function traverse(current: ThreadNode): boolean {
    path.push(current.event)

    if (current.event.id === targetId) {
      return true
    }

    for (const reply of current.replies) {
      if (traverse(reply)) {
        return true
      }
    }

    path.pop()
    return false
  }

  traverse(node)
  return path
}

/**
 * Get all events at a specific depth in the thread
 */
export function getEventsAtDepth(node: ThreadNode | null, depth: number): NostrEvent[] {
  if (!node) return []

  const events: NostrEvent[] = []

  function traverse(current: ThreadNode) {
    if (current.depth === depth) {
      events.push(current.event)
    }

    for (const reply of current.replies) {
      traverse(reply)
    }
  }

  traverse(node)
  return events
}

/**
 * Get all sibling events (same parent)
 */
export function getSiblings(node: ThreadNode | null, eventId: string): NostrEvent[] {
  if (!node) return []

  function traverse(current: ThreadNode): NostrEvent[] | null {
    // Check if any reply is the target
    for (const reply of current.replies) {
      if (reply.event.id === eventId) {
        // Found the event, return siblings
        return current.replies.map(r => r.event)
      }

      const found = traverse(reply)
      if (found) return found
    }

    return null
  }

  const sibs = traverse(node)
  return sibs ?? []
}

/**
 * Find event node by ID in thread
 */
export function findEventNode(node: ThreadNode | null, eventId: string): ThreadNode | null {
  if (!node) return null

  if (node.event.id === eventId) {
    return node
  }

  for (const reply of node.replies) {
    const found = findEventNode(reply, eventId)
    if (found) return found
  }

  return null
}

/**
 * Get thread statistics
 */
export function getThreadStats(node: ThreadNode | null) {
  if (!node) {
    return {
      totalEvents: 0,
      maxDepth: 0,
      replyCount: 0,
      branchCount: 0,
    }
  }

  let totalEvents = 1
  let maxDepth = 0
  let replyCount = 0
  let branchCount = 0

  function traverse(current: ThreadNode) {
    maxDepth = Math.max(maxDepth, current.depth)
    replyCount += current.replies.length
    if (current.replies.length > 1) branchCount++

    for (const reply of current.replies) {
      totalEvents++
      traverse(reply)
    }
  }

  traverse(node)

  return {
    totalEvents,
    maxDepth,
    replyCount,
    branchCount,
  }
}

/**
 * Flatten thread tree to array for easier rendering
 */
export function flattenThread(node: ThreadNode | null): ThreadNode[] {
  if (!node) return []

  const flattened: ThreadNode[] = []

  function traverse(current: ThreadNode) {
    flattened.push(current)
    for (const reply of current.replies) {
      traverse(reply)
    }
  }

  traverse(node)
  return flattened
}

