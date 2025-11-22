import { writable, derived } from 'svelte/store'
import { logger } from '$lib/logger'
import { ensureNotificationChannel, presentNativeNotification } from '$lib/native-notifications'

// Simple hash function to convert string to number for notification ID
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

/**
 * Notification types
 */
export type NotificationType =
  | 'like'
  | 'reaction'
  | 'reply'
  | 'quote'
  | 'thread-reply'
  | 'repost'
  | 'zap'
  | 'mention'
  | 'ember'

export interface Notification {
  id: string
  type: NotificationType
  fromPubkey: string
  fromName?: string
  fromAvatar?: string
  eventId: string // The target event (your post that was interacted with)
  replyEventId?: string // For replies: the actual reply event ID
  eventContent?: string
  amount?: number // zaps/embers
  txHash?: string
  reactionEmoji?: string
  createdAt: number
  read: boolean
}

const NOTIFICATIONS_STORAGE_KEY = 'monstr_notifications'

/**
 * Load notifications from localStorage
 */
function loadNotifications(): Notification[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    // Only keep notifications from last 7 days
    const weekAgo = Date.now() / 1000 - 86400 * 7
    return parsed.filter((n: Notification) => n.createdAt > weekAgo)
  } catch (err) {
    logger.warn('Failed to load notifications from localStorage:', err)
    return []
  }
}

/**
 * Save notifications to localStorage
 */
function saveNotifications(notifs: Notification[]): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifs))
  } catch (err) {
    logger.warn('Failed to save notifications to localStorage:', err)
  }
}

/**
 * Notifications store (persisted to localStorage)
 */
export const notifications = writable<Notification[]>(loadNotifications())

// Persist to localStorage whenever notifications change
let isFirstLoad = true
notifications.subscribe(notifs => {
  // Skip saving on initial load to avoid writing back what we just read
  if (isFirstLoad) {
    isFirstLoad = false
    return
  }
  saveNotifications(notifs)
})

// Prepare native channel on Android (no-op elsewhere)
if (typeof window !== 'undefined') {
  void ensureNotificationChannel()
}

function describeNotification(notification: Notification): { title: string; body: string } {
  const name = notification.fromName || 'Someone'
  switch (notification.type) {
    case 'reaction': {
      const emoji = notification.reactionEmoji || '👍'
      return { title: 'New reaction', body: `${name} reacted ${emoji} to your post.` }
    }
    case 'like':
      return { title: 'New like', body: `${name} liked your post.` }
    case 'reply':
    case 'thread-reply':
      return { title: 'New reply', body: `${name} replied: ${notification.eventContent ?? ''}` }
    case 'quote':
      return { title: 'Quoted by ' + name, body: notification.eventContent ?? 'Quoted your post.' }
    case 'repost':
      return { title: 'Repost', body: `${name} reposted your post.` }
    case 'zap':
      return {
        title: 'Zap received',
        body: `${name} zapped you${notification.amount ? ` for ${notification.amount} sats` : ''}.`,
      }
    case 'mention':
      return { title: 'Mentioned by ' + name, body: notification.eventContent ?? '' }
    case 'ember':
      return { title: 'Ember received', body: `${name} sent Embers${notification.amount ? ` (${notification.amount})` : ''}.` }
    default:
      return { title: 'New notification', body: `${name} interacted with you.` }
  }
}

/**
 * Unread notification count
 */
export const unreadCount = derived(notifications, $notifications =>
  $notifications.filter(n => !n.read).length
)

/**
 * Mark all as read
 */
export function markAllAsRead(): void {
  notifications.update(notifs =>
    notifs.map(n => ({ ...n, read: true }))
  )
}

/**
 * Mark one as read
 */
export function markAsRead(notificationId: string): void {
  notifications.update(notifs =>
    notifs.map(n => n.id === notificationId ? { ...n, read: true } : n)
  )
}

/**
 * Add notification
 */
export function addNotification(notification: Notification): void {
  notifications.update(notifs => {
    // Prevent duplicates
    if (notifs.some(n => n.id === notification.id && n.fromPubkey === notification.fromPubkey)) {
      return notifs
    }
    const next = [notification, ...notifs]
    next.sort((a, b) => b.createdAt - a.createdAt)
    if (typeof window !== 'undefined') {
      const { title, body } = describeNotification(notification)
      // Pass the event ID as a URL so clicking the notification opens the post
      const eventUrl = notification.replyEventId || notification.eventId
      const url = eventUrl ? `nostr:event:${eventUrl}` : undefined
      void presentNativeNotification(title, body, hashCode(notification.id), url)
    }
    return next.slice(0, 100)
  })
}

/**
 * Clear all notifications
 */
export function clearNotifications(): void {
  notifications.set([])
}

/**
 * Remove notification
 */
export function removeNotification(notificationId: string): void {
  notifications.update(notifs =>
    notifs.filter(n => n.id !== notificationId)
  )
}

