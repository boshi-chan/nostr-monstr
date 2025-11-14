import { writable } from 'svelte/store'
import { getNDK } from '$lib/ndk'
import type { NDKEvent, NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'
import { EMBER_EVENT_KIND, EMBER_TAG, atomicToXmr } from '$lib/ember'
import { normalizeEvent } from '$lib/event-validation'

export const emberTotals = writable<Map<string, number>>(new Map())

const loadCache = new Map<string, Promise<void>>()

export function incrementEmberTotal(postId: string | null | undefined, amount: number): void {
  if (!postId || !Number.isFinite(amount)) return
  emberTotals.update(existing => {
    const next = new Map(existing)
    const current = next.get(postId) ?? 0
    next.set(postId, Number((current + amount).toFixed(12)))
    return next
  })
}

export async function ensureEmberTotal(postId: string): Promise<void> {
  if (!postId) return
  if (loadCache.has(postId)) {
    await loadCache.get(postId)
    return
  }

  const promise = (async () => {
    try {
      const ndk = getNDK()
      const events = await ndk.fetchEvents(
        {
          kinds: [EMBER_EVENT_KIND],
          '#e': [postId],
        },
        { closeOnEose: true } as NDKSubscriptionOptions
      )

      let total = 0
      for (const event of events as Set<NDKEvent>) {
        const raw = normalizeEvent(event)
        if (!raw) continue
        const amountTag = raw.tags.find(tag => tag[0] === EMBER_TAG)
        if (amountTag?.[1]) {
          total += atomicToXmr(amountTag[1])
        }
      }

      emberTotals.update(existing => {
        const next = new Map(existing)
        next.set(postId, Number(total.toFixed(12)))
        return next
      })
    } catch (err) {
      logger.warn('Failed to load Ember totals for post', postId, err)
    } finally {
      loadCache.delete(postId)
    }
  })()

  loadCache.set(postId, promise)
  await promise
}

