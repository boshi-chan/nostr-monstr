import { get, writable } from 'svelte/store'
import { logger } from '$lib/logger'

const baseRelayStore = writable<Set<string>>(new Set())
const userRelayStore = writable<Set<string>>(new Set())

let relaysReady = false
const readyWaiters = new Set<() => void>()

function setStoreValues(store: typeof baseRelayStore, relays: string[]): void {
  store.set(new Set(relays.filter(url => typeof url === 'string' && url.startsWith('wss://'))))
}

function resolveWaiters(): void {
  if (!relaysReady) return
  for (const resolve of readyWaiters) {
    resolve()
  }
  readyWaiters.clear()
}

export function setBaseRelayUrls(relays: string[]): void {
  setStoreValues(baseRelayStore, relays)
}

export function setUserRelayUrls(relays: string[]): void {
  setStoreValues(userRelayStore, relays)
}

export function markRelaysReady(): void {
  if (relaysReady) return
  relaysReady = true
  logger.info('[Relays] Relay bootstrap marked ready')
  resolveWaiters()
}

export function resetRelayState(): void {
  baseRelayStore.set(new Set())
  userRelayStore.set(new Set())
  relaysReady = false
  readyWaiters.clear()
  logger.info('[Relays] Relay state reset')
}

export function awaitRelaysReady(timeoutMs = 5000): Promise<void> {
  if (relaysReady) return Promise.resolve()

  return new Promise(resolve => {
    let settled = false
    const onReady = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      readyWaiters.delete(onReady)
      resolve()
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      readyWaiters.delete(onReady)
      logger.warn('[Relays] awaitRelaysReady timed out - proceeding with current relay set')
      resolve()
    }, timeoutMs)

    readyWaiters.add(onReady)
  })
}

export function getPublishRelayUrls(): string[] {
  const merged = new Set<string>()
  for (const url of get(baseRelayStore)) {
    merged.add(url)
  }
  for (const url of get(userRelayStore)) {
    merged.add(url)
  }
  return Array.from(merged)
}

export function relaysAreReady(): boolean {
  return relaysReady
}
