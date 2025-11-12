import { writable, derived } from 'svelte/store'

/**
 * Notification types
 */
export type NotificationType =
  | 'like'
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
    console.warn('Failed to load notifications from localStorage:', err)
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
    console.warn('Failed to save notifications to localStorage:', err)
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
    if (notifs.some(n => n.id === notification.id)) {
      return notifs
    }
    const next = [notification, ...notifs]
    next.sort((a, b) => b.createdAt - a.createdAt)
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
