/**
 * Thread building and navigation utilities
 * Handles complete thread loading, tree building, and navigation
 */

import type { NostrEvent } from '$types/nostr'
import { parseContent } from './content'
import { getNDK } from './ndk'
import { getEventById, fetchEventById } from './feed-ndk'
import type { NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'

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

const MAX_ANCESTORS = 100
const MAX_REPLIES = 500

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
        console.warn('Failed to fetch parent event:', err)
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
        console.warn('Failed to fetch ancestor:', err)
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
  try {
    const ndk = getNDK()
    const result = (await ndk.fetchEvents(
      { kinds: [1, 6], '#e': [eventId], limit: 100 },
      { closeOnEose: true } as NDKSubscriptionOptions
    )) as Set<any>

    return Array.from(result)
      .map(item => (item.rawEvent?.() ?? item) as NostrEvent)
      .filter(Boolean)
  } catch (err) {
    console.warn('Failed to fetch direct replies:', err)
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
  const queue: Array<{ event: NostrEvent; depth: number }> = [{ event: post, depth: 0 }]
  const processed = new Set<string>()

  while (queue.length > 0 && allReplies.length < MAX_REPLIES) {
    const { event: current, depth: currentDepth } = queue.shift()!

    if (processed.has(current.id)) continue
    processed.add(current.id)

    // Fetch direct replies
    const replies = await fetchDirectReplies(current.id)

    for (const reply of replies) {
      if (!processed.has(reply.id) && allReplies.length < MAX_REPLIES) {
        allReplies.push(reply)

        // Continue fetching replies if not too deep
        if (currentDepth < maxDepth) {
          queue.push({ event: reply, depth: currentDepth + 1 })
        }
      }
    }
  }

  return allReplies
}

/**
 * Build complete thread context for an event
 */
export async function buildCompleteThread(event: NostrEvent): Promise<ThreadContext> {
  try {
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
  } catch (err) {
    console.error('Failed to build complete thread:', err)
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
