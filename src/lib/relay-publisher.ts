import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK } from './ndk'
import { awaitRelaysReady, getPublishRelayUrls } from './relay-manager'
import { logger } from './logger'

/**
 * Publish an already-signed event to the configured relay set.
 * Ensures user relays had a chance to connect before fanning out.
 * @returns the list of relay URLs that acknowledged the publish
 */
export async function publishToConfiguredRelays(event: NDKEvent): Promise<string[]> {
  await awaitRelaysReady()

  const ndk = getNDK()
  const configured = getPublishRelayUrls()
  const fallback = Array.from(ndk.pool.relays.keys())
  const targets = Array.from(new Set(configured.length > 0 ? configured : fallback))

  if (targets.length === 0) {
    throw new Error('No relay connections available for publishing')
  }

  const results = await Promise.allSettled(
    targets.map(async url => {
      try {
        const relay = ndk.pool.getRelay(url, true, true)
        await relay.connect()
        await relay.publish(event)
        return url
      } catch (err) {
        logger.warn(`[Publish] Relay ${url} failed:`, err)
        throw err instanceof Error ? err : new Error(String(err))
      }
    })
  )

  const successes: string[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      successes.push(result.value)
    }
  }

  if (successes.length === 0) {
    throw new Error('Failed to publish event to any relay')
  }

  return successes
}
