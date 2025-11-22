/**
 * Handle notification clicks from Android native layer
 * When a user taps a notification, Android sends us the event ID to open
 */

import { logger } from './logger'
import { openPostById } from '$stores/router'

interface NotificationClickEvent {
  url: string
}

/**
 * Initialize notification click handler
 * Listens for notification click events from Android and navigates to the post
 */
export function initNotificationClickHandler(): void {
  if (typeof window === 'undefined') return

  // Listen for notification clicks from Android
  window.addEventListener('notificationClick', ((event: CustomEvent<NotificationClickEvent>) => {
    try {
      const url = event.detail?.url
      if (!url) {
        logger.warn('[NotificationClick] No URL in notification click event')
        return
      }

      logger.info('[NotificationClick] Notification clicked:', url)

      // URL format: "nostr:event:<eventId>" or just the eventId
      let eventId = url

      if (url.startsWith('nostr:event:')) {
        eventId = url.replace('nostr:event:', '')
      } else if (url.startsWith('nostr://')) {
        eventId = url.replace('nostr://', '').replace('event/', '')
      }

      if (eventId && eventId.length === 64) {
        logger.info('[NotificationClick] Opening post:', eventId.substring(0, 8) + '...')
        // Open the post (will default to home tab as origin)
        openPostById(eventId, 'home')
      } else {
        logger.warn('[NotificationClick] Invalid event ID:', url)
      }
    } catch (err) {
      logger.error('[NotificationClick] Error handling notification click:', err)
    }
  }) as EventListener)

  logger.info('[NotificationClick] Handler initialized')
}
