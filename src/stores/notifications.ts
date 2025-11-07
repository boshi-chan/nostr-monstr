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
  eventId: string
  eventContent?: string
  amount?: number // zaps/embers
  txHash?: string
  createdAt: number
  read: boolean
}

/**
 * Notifications store
 */
export const notifications = writable<Notification[]>([])

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
