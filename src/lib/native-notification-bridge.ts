/**
 * Bridge for native notifications to reuse JS filtering/dedupe and deep links.
 * Native code should call window.__monstrHandleNativeNotification and include a deep link URL.
 */
import { handleNativeNotificationEvent } from '$lib/notifications'
import type { NostrEvent } from '$types/nostr'

// Expose a typed wrapper for native/Capacitor plugins to call
export async function processNativeNotification(rawEvent: any, userPubkey: string): Promise<void> {
  await handleNativeNotificationEvent(rawEvent as NostrEvent, userPubkey)
}

// Attach to window for plugin access
if (typeof window !== 'undefined') {
  ;(window as any).__monstrHandleNativeNotification = processNativeNotification
}
