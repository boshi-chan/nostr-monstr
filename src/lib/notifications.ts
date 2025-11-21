/**
 * Notification system
 * Listens for user interactions and creates notifications
 */

import { get } from 'svelte/store'
import { feedEvents, userEventIds } from '$stores/feed'
import {
  addNotification,
  type Notification,
} from '$stores/notifications'
import { getUserMetadata, fetchUserMetadata } from '$lib/metadata'
import type { NostrEvent } from '$types/nostr'
import { getNDK } from '$lib/ndk'
import type { NDKEvent, NDKFilter, NDKSubscription, NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'
import { EMBER_EVENT_KIND, EMBER_TAG, atomicToXmr, decodeEmberPayload } from '$lib/ember'
import { normalizeEvent } from '$lib/event-validation'
import { logger } from '$lib/logger'
import { startNativeNotificationListener, stopNativeNotificationListener } from '$lib/native-notifications'
import { hasSeenNotification, markNotificationSeen, purgeOldSeen } from '$lib/notification-seen'
import { normalizeEvent } from '$lib/event-validation'
import { logDebug } from '$stores/debug'

let notificationSubscription: NDKSubscription | null = null
const processedNotifications = new Set<string>()
const notificationEventCache = new Map<string, NostrEvent>()
purgeOldSeen()

async function getNotificationMetadata(pubkey: string) {
  let metadata = getUserMetadata(pubkey)
  if (!metadata) {
    void fetchUserMetadata(pubkey)
    metadata = getUserMetadata(pubkey)
  }
  return metadata ?? null
}

function ensureUserEventId(eventId: string): void {
  userEventIds.update(ids => {
    if (ids.has(eventId)) return ids
    const next = new Set(ids)
    next.add(eventId)
    return next
  })
}

async function ensureUserEvents(pubkey: string): Promise<void> {
  const existing = get(userEventIds)
  if (existing.size > 0) return

  const ndk = getNDK()
  const results = await ndk.fetchEvents(
    { authors: [pubkey], kinds: [1, 6], limit: 200 },
    { closeOnEose: true } as NDKSubscriptionOptions
  )

  const next = new Set(existing)
  for (const ndkEvent of results as Set<NDKEvent>) {
    const raw = normalizeEvent(ndkEvent)
    if (!raw) continue
    next.add(raw.id)
    notificationEventCache.set(raw.id, raw)
  }
  userEventIds.set(next)
}

async function getTargetEvent(eventId: string): Promise<NostrEvent | null> {
  if (notificationEventCache.has(eventId)) {
    return notificationEventCache.get(eventId) ?? null
  }

  const fromFeed = get(feedEvents).find(e => e.id === eventId)
  if (fromFeed) {
    notificationEventCache.set(eventId, fromFeed)
    return fromFeed
  }

  const ndk = getNDK()
  const results = await ndk.fetchEvents(
    { ids: [eventId], limit: 1 },
    { closeOnEose: true } as NDKSubscriptionOptions
  )

  for (const ndkEvent of results as Set<NDKEvent>) {
    const raw = normalizeEvent(ndkEvent)
    if (!raw) continue
    notificationEventCache.set(eventId, raw)
    return raw
  }

  return null
}

function getTagMarker(tag: string[]): string | null {
  if (tag.length >= 4 && tag[3]) return tag[3]
  if (tag.length >= 3 && tag[2] && !tag[2].includes('://')) {
    return tag[2]
  }
  return null
}

function findEventTagByMarker(event: NostrEvent, marker: string): string | null {
  for (const tag of event.tags) {
    if (tag[0] === 'e' && tag[1]) {
      const tagMarker = getTagMarker(tag)
      if (tagMarker === marker) {
        return tag[1]
      }
    }
  }
  return null
}

function findQuoteReferenceId(event: NostrEvent): string | null {
  for (const tag of event.tags) {
    if (tag[0] === 'q' && tag[1]) {
      return tag[1]
    }
    if (tag[0] === 'e' && tag[1]) {
      const marker = getTagMarker(tag)
      if (marker === 'mention' || marker === 'quote') {
        return tag[1]
      }
    }
  }
  return null
}

function findFirstEventReference(event: NostrEvent): string | null {
  const replyId = findEventTagByMarker(event, 'reply')
  if (replyId) return replyId

  const quoteId = findQuoteReferenceId(event)
  if (quoteId) return quoteId

  const rootId = findEventTagByMarker(event, 'root')
  if (rootId) return rootId

  const anyE = findFirstTagValue(event, 'e')
  if (anyE) return anyE

  const anyQ = findFirstTagValue(event, 'q')
  if (anyQ) return anyQ

  return null
}

function addNotificationSorted(notification: Notification): void {
  addNotification(notification)
  markNotificationSeen(`${notification.id}:${notification.fromPubkey}`)
}

/**
 * Start listening for notifications
 */
export async function startNotificationListener(pubkey: string): Promise<void> {
  if (notificationSubscription) {
    logger.info('[NOTIF] Already have active subscription, stopping it first')
    stopNotificationListener()
  }

  logger.info('[NOTIF] Starting notification listener for pubkey:', pubkey.substring(0, 8))

  await ensureUserEvents(pubkey)

  const ndk = getNDK()
  const userEventList = Array.from(get(userEventIds))

  const filter: NDKFilter = {
    kinds: [1, 6, 7, 9734, 9735, EMBER_EVENT_KIND],
    '#p': [pubkey],
    since: Math.floor(Date.now() / 1000) - 86400 * 7,
  }

  if (userEventList.length > 0) {
    filter['#e'] = userEventList.slice(0, 500)
  }

  logger.info('[NOTIF] Subscribing with filter:', {
    kinds: filter.kinds,
    pTag: pubkey.substring(0, 8),
    sinceDate: new Date((filter.since || 0) * 1000).toISOString(),
    eTagCount: userEventList.length
  })

  notificationSubscription = ndk.subscribe(
    filter,
    { closeOnEose: false } as NDKSubscriptionOptions,
    undefined,
    false
  )

  notificationSubscription.on('event', (event: NostrEvent | NDKEvent) => {
    const raw = normalizeEvent(event)
    if (!raw) return
    void processNotificationEvent(raw, pubkey)
  })

  ;(notificationSubscription as any).on?.('error', (err: unknown) => {
    logger.warn('Notification listener error:', err)
  })

  // Secondary subscription to catch reactions that lack a 'p' tag (some clients only tag the event)
  if (userEventList.length > 0) {
    const reactionFilter: NDKFilter = {
      kinds: [7],
      '#e': userEventList.slice(0, 500),
      since: filter.since,
    }
    const reactionSub = ndk.subscribe(
      reactionFilter,
      { closeOnEose: false } as NDKSubscriptionOptions,
      undefined,
      false
    )
    reactionSub.on('event', (event: NostrEvent | NDKEvent) => {
      const raw = normalizeEvent(event)
      if (!raw) return
      void processNotificationEvent(raw, pubkey)
    })
    ;(reactionSub as any).on?.('error', (err: unknown) => {
      logger.warn('Notification reaction listener error:', err)
    })
  }

  logger.info('[NOTIF] Notification listener started successfully')

  void startNativeNotificationListener(pubkey).catch(err => {
    logger.warn('[NOTIF] Failed to start native notification listener:', err)
  })
}

const NOTIF_DEBUG = true

/**
 * Process an event that might be a notification
 */
async function processNotificationEvent(event: NostrEvent, userPubkey: string): Promise<void> {
  if (event.pubkey === userPubkey) return

  const notificationId = `${event.id}:${event.pubkey}`
  if (processedNotifications.has(notificationId)) return
  if (hasSeenNotification(notificationId)) return
  processedNotifications.add(notificationId)

  if (NOTIF_DEBUG) {
    const payload = {
      kind: event.kind,
      id: event.id.substring(0, 8),
      pubkey: event.pubkey.slice(0, 8),
      tags: event.tags,
    }
    logger.info('[NOTIF][dbg] Processing notification event:', payload)
    logDebug('[NOTIF] event', [payload])
  }

  try {
    switch (event.kind) {
      case 7:
        if (await handleReactionNotification(event, userPubkey)) return
        break
      case 6:
        if (await handleRepostNotification(event, userPubkey)) return
        break
      case 1:
        if (await handleReplyNotification(event, userPubkey)) return
        if (await handleMentionNotification(event, userPubkey)) return
        break
      case 9734:
      case 9735:
        logger.info('[NOTIF] Received zap event (kind 9734/9735)')
        if (await handleZapNotification(event, userPubkey)) return
        break
      case EMBER_EVENT_KIND:
        if (await handleEmberNotification(event, userPubkey)) return
        break
    }
  } catch (err) {
    logger.warn('Error processing notification:', err)
  }
}

async function handleReactionNotification(event: NostrEvent, userPubkey: string): Promise<boolean> {
  const targetEventId = findFirstEventReference(event)
  const userTagged = event.tags.some(tag => tag[0] === 'p' && tag[1] === userPubkey)
  if (!targetEventId && !userTagged) {
    if (NOTIF_DEBUG) logDebug('[NOTIF] drop reaction - no target/tag', [{ id: event.id }])
    return false
  }

  if (targetEventId) {
    const userEvents = get(userEventIds)
    if (!userEvents.has(targetEventId)) {
      const target = await getTargetEvent(targetEventId)
      if (!target) {
        // If the reactor tagged us directly, accept even without the target event
        if (!userTagged) return false
      } else {
        if (target.pubkey !== userPubkey) {
          if (!userTagged) return false
        } else {
          ensureUserEventId(targetEventId)
        }
      }
    }
  }

  const targetEvent = targetEventId ? await getTargetEvent(targetEventId) : null
  const metadata = await getNotificationMetadata(event.pubkey)

  addNotificationSorted({
    id: event.id,
    type: 'reaction',
    fromPubkey: event.pubkey,
    fromName: metadata?.name || metadata?.display_name || 'User',
    fromAvatar: metadata?.picture,
    eventId: targetEventId ?? event.id,
    eventContent: targetEvent?.content.substring(0, 180) ?? '',
    reactionEmoji: event.content?.trim() || '+',
    createdAt: event.created_at,
    read: false,
  })
  markNotificationSeen(`${event.id}:${event.pubkey}`)

  return true
}

async function handleRepostNotification(event: NostrEvent, userPubkey: string): Promise<boolean> {
  const targetEventId = findFirstEventReference(event)
  const userTagged = event.tags.some(tag => tag[0] === 'p' && tag[1] === userPubkey)
  if (!targetEventId && !userTagged) return false

  if (targetEventId) {
    const userEvents = get(userEventIds)
    if (!userEvents.has(targetEventId)) {
      const target = await getTargetEvent(targetEventId)
      if (!target) {
        if (!userTagged) return false
      } else {
        if (target.pubkey !== userPubkey) {
          if (!userTagged) return false
        } else {
          ensureUserEventId(targetEventId)
        }
      }
    }
  }

  const targetEvent = targetEventId ? await getTargetEvent(targetEventId) : null

  const metadata = await getNotificationMetadata(event.pubkey)

  addNotificationSorted({
    id: event.id,
    type: 'repost',
    fromPubkey: event.pubkey,
    fromName: metadata?.name || metadata?.display_name || 'User',
    fromAvatar: metadata?.picture,
    eventId: targetEventId ?? event.id,
    eventContent: targetEvent?.content.substring(0, 180) ?? '',
    createdAt: event.created_at,
    read: false,
  })

  return true
}

async function handleReplyNotification(event: NostrEvent, userPubkey: string): Promise<boolean> {
  const userTagged = event.tags.some(tag => tag[0] === 'p' && tag[1] === userPubkey)
  const userEvents = get(userEventIds)

  const replyId = findEventTagByMarker(event, 'reply')
  const quoteId = findQuoteReferenceId(event)
  const rootId = findEventTagByMarker(event, 'root')
  let referencesReply = replyId ? userEvents.has(replyId) : false
  let referencesQuote = quoteId ? userEvents.has(quoteId) : false
  let referencesRoot = rootId ? userEvents.has(rootId) : false

  if (!userTagged && !referencesReply && !referencesQuote && !referencesRoot) {
    if (replyId && !referencesReply) {
      const target = await getTargetEvent(replyId)
      if (target?.pubkey === userPubkey) {
        referencesReply = true
        ensureUserEventId(replyId)
      }
    }

    if (quoteId && !referencesQuote) {
      const target = await getTargetEvent(quoteId)
      if (target?.pubkey === userPubkey) {
        referencesQuote = true
        ensureUserEventId(quoteId)
      }
    }

    if (rootId && !referencesRoot) {
      const target = await getTargetEvent(rootId)
      if (target?.pubkey === userPubkey) {
        referencesRoot = true
        ensureUserEventId(rootId)
      }
    }
  } else {
    if (referencesReply && replyId) ensureUserEventId(replyId)
    if (referencesQuote && quoteId) ensureUserEventId(quoteId)
    if (referencesRoot && rootId) ensureUserEventId(rootId)
  }

  if (!userTagged && !referencesReply && !referencesQuote && !referencesRoot) {
    return false
  }

  const metadata = await getNotificationMetadata(event.pubkey)
  const firstReference = findFirstEventReference(event)

  let type: Notification['type'] = 'reply'
  let eventIdForNotification = firstReference ?? event.id

  if (referencesQuote && quoteId) {
    type = 'quote'
    eventIdForNotification = quoteId
  } else if (referencesReply && replyId) {
    type = 'reply'
    eventIdForNotification = replyId
  } else if (referencesRoot && rootId) {
    type = 'thread-reply'
    eventIdForNotification = rootId
  } else {
    type = 'thread-reply'
    eventIdForNotification = firstReference ?? event.id
  }

  addNotificationSorted({
    id: event.id,
    type,
    fromPubkey: event.pubkey,
    fromName: metadata?.name || metadata?.display_name || 'User',
    fromAvatar: metadata?.picture,
    eventId: eventIdForNotification,
    replyEventId: event.id, // Store the actual reply event ID
    eventContent: event.content.substring(0, 280),
    createdAt: event.created_at,
    read: false,
  })

  return true
}

async function handleMentionNotification(event: NostrEvent, userPubkey: string): Promise<boolean> {
  const userTagged = event.tags.some(tag => tag[0] === 'p' && tag[1] === userPubkey)
  if (!userTagged) return false

  const targetEventId = findFirstTagValue(event, 'e')
  if (targetEventId) {
    const userEvents = get(userEventIds)
    if (userEvents.has(targetEventId)) {
      // Already handled as a reply
      return false
    }
  }

  const metadata = await getNotificationMetadata(event.pubkey)

  addNotificationSorted({
    id: event.id,
    type: 'mention',
    fromPubkey: event.pubkey,
    fromName: metadata?.name || metadata?.display_name || 'User',
    fromAvatar: metadata?.picture,
    eventId: targetEventId ?? event.id,
    eventContent: event.content.substring(0, 280),
    createdAt: event.created_at,
    read: false,
  })

  return true
}

async function handleZapNotification(event: NostrEvent, userPubkey: string): Promise<boolean> {
  logger.info('[ZAP] Processing zap event:', { kind: event.kind, id: event.id, pubkey: event.pubkey })

  const targetEventId = findFirstEventReference(event)

  // For kind 9735 (zap receipt), amount is in the description tag (which contains the zap request)
  let amount = 0
  if (event.kind === 9735) {
    const descriptionTag = event.tags.find(tag => tag[0] === 'description')?.[1]
    if (descriptionTag) {
      try {
        const zapRequest = JSON.parse(descriptionTag)
        const amountTag = zapRequest.tags?.find((tag: string[]) => tag[0] === 'amount')?.[1]
        amount = amountTag ? Math.floor(parseInt(amountTag, 10) / 1000) : 0
        logger.info('[ZAP] Parsed amount from description:', { amount, amountTag })
      } catch (err) {
        logger.warn('[ZAP] Failed to parse description tag:', err)
      }
    }
  } else {
    // For kind 9734 (zap request), amount is directly in tags
    const amountTag = event.tags.find(tag => tag[0] === 'amount')?.[1]
    amount = amountTag ? Math.floor(parseInt(amountTag, 10) / 1000) : 0
  }

  logger.info('[ZAP] Found amount:', { amount, targetEventId, kind: event.kind })

  if (!amount) {
    logger.warn('[ZAP] No amount found, skipping')
    return false
  }

  let targetEvent: NostrEvent | null = null
  let finalEventId: string = event.id

  if (targetEventId) {
    const userEvents = get(userEventIds)
    if (!userEvents.has(targetEventId)) {
      const target = await getTargetEvent(targetEventId)
      if (!target || target.pubkey !== userPubkey) return false
      ensureUserEventId(targetEventId)
    }

    targetEvent = await getTargetEvent(targetEventId)
    if (!targetEvent || targetEvent.pubkey !== userPubkey) return false
    finalEventId = targetEventId
  } else {
    const profileTarget = findFirstTagValue(event, 'p')
    if (profileTarget !== userPubkey) return false
  }

  const metadata = await getNotificationMetadata(event.pubkey)

  logger.info('[ZAP] Creating zap notification:', {
    eventId: finalEventId,
    amount,
    fromPubkey: event.pubkey,
    fromName: metadata?.name || metadata?.display_name || 'User'
  })

  addNotificationSorted({
    id: event.id,
    type: 'zap',
    fromPubkey: event.pubkey,
    fromName: metadata?.name || metadata?.display_name || 'User',
    fromAvatar: metadata?.picture,
    eventId: finalEventId,
    eventContent: targetEvent?.content.substring(0, 180) || event.content.substring(0, 180),
    amount,
    createdAt: event.created_at,
    read: false,
  })

  logger.info('[ZAP] Zap notification created successfully')

  return true
}

async function handleEmberNotification(event: NostrEvent, userPubkey: string): Promise<boolean> {
  const isRecipient = event.tags.some(tag => tag[0] === 'p' && tag[1] === userPubkey)
  if (!isRecipient) return false

  const targetEventId = findFirstTagValue(event, 'e')
  const amountTag = event.tags.find(tag => tag[0] === EMBER_TAG)?.[1]
  if (!amountTag) return false

  const payloadTag = event.tags.find(tag => tag[0] === 'payload')?.[1]
  const payload = decodeEmberPayload(payloadTag)

  const amount = payload ? atomicToXmr(payload.amountAtomic) : atomicToXmr(amountTag)
  if (!amount) return false

  const targetEvent = targetEventId ? await getTargetEvent(targetEventId) : null
  const senderNote = event.content?.trim() || undefined

  const metadata = await getNotificationMetadata(event.pubkey)

  addNotificationSorted({
    id: event.id,
    type: 'ember',
    fromPubkey: event.pubkey,
    fromName: metadata?.name || metadata?.display_name || 'User',
    fromAvatar: metadata?.picture,
    eventId: targetEventId ?? event.id,
    eventContent: senderNote || targetEvent?.content?.substring(0, 180),
    amount,
    txHash: payload?.txHash,
    createdAt: event.created_at,
    read: false,
  })

  return true
}

function findFirstTagValue(event: NostrEvent, tagName: string): string | null {
  for (const tag of event.tags) {
    if (tag[0] === tagName && tag[1]) {
      return tag[1]
    }
  }
  return null
}

/**
 * Stop listening for notifications
 */
export function stopNotificationListener(): void {
  if (notificationSubscription) {
    notificationSubscription.stop()
    notificationSubscription = null
  }
  processedNotifications.clear()
  notificationEventCache.clear()
  // Note: Don't clear notifications - they persist in localStorage
  void stopNativeNotificationListener()
}

/**
 * Entry point for native-layer notifications: pass raw nostr event JSON and the user's pubkey.
 * Native code (e.g., Capacitor plugin) can call window.__monstrHandleNativeNotification(raw, pubkey).
 */
export async function handleNativeNotificationEvent(raw: any, userPubkey: string): Promise<void> {
  if (!raw || !userPubkey) return
  const event = normalizeEvent(raw as any)
  if (!event) return
  await processNotificationEvent(event, userPubkey)
}

// Expose global hook for native bridges to invoke
if (typeof window !== 'undefined') {
  ;(window as any).__monstrHandleNativeNotification = handleNativeNotificationEvent
}

