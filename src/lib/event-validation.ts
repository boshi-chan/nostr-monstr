import type { NostrEvent } from '$types/nostr'
import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { validateEvent } from 'nostr-tools'

const DEFAULT_MAX_FUTURE_SECONDS = 60 * 10 // 10 minutes

export interface ValidationOptions {
  maxFutureSeconds?: number
}

export function validateRelayEvent(event: NostrEvent, options: ValidationOptions = {}): boolean {
  if (!event) {
    return false
  }

  try {
    if (!validateEvent(event as any)) {
      logger.warn('[Relay] Dropping event with invalid signature:', event.id)
      return false
    }
  } catch (err) {
    logger.warn('[Relay] Failed to validate event signature:', err)
    return false
  }

  const maxFuture = options.maxFutureSeconds ?? DEFAULT_MAX_FUTURE_SECONDS
  if (typeof event.created_at === 'number') {
    const now = Math.floor(Date.now() / 1000)
    if (event.created_at > now + maxFuture) {
      logger.warn(
        `[Relay] Dropping future-dated event ${event.id?.slice(0, 8)} (skew ${
          event.created_at - now
        }s)`
      )
      return false
    }
  }

  return true
}

export function normalizeEvent(
  input: NostrEvent | NDKEvent,
  options?: ValidationOptions
): NostrEvent | null {
  const raw =
    (input as NDKEvent)?.rawEvent?.() ??
    (input as NostrEvent)

  return validateRelayEvent(raw, options) ? raw : null
}

