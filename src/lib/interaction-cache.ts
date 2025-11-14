import { get } from 'svelte/store'
import { likedEvents, repostedEvents, zappedEvents, commentedThreads } from '$stores/feed'
import { currentUser } from '$stores/auth'

const STORAGE_PREFIX = 'monstr:interactions:'
const MAX_ENTRIES = 1000

let persistenceUnsubscribers: Array<() => void> | null = null
let persistTimeout: number | null = null
let suppressPersistence = false

interface InteractionSnapshot {
  likes: string[]
  reposts: string[]
  zaps: Array<[string, number]>
  comments: string[]
}

function getStorageKey(pubkey: string): string {
  return `${STORAGE_PREFIX}${pubkey}`
}

function clampList<T>(values: Iterable<T>): T[] {
  const result: T[] = []
  for (const value of values) {
    result.push(value)
    if (result.length >= MAX_ENTRIES) {
      break
    }
  }
  return result
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch (err) {
    console.warn('Interaction cache storage unavailable:', err)
    return null
  }
}

export function hydrateInteractionsFromCache(pubkey: string): void {
  const storage = getStorage()
  if (!storage) return

  let raw: string | null = null
  try {
    raw = storage.getItem(getStorageKey(pubkey))
  } catch (err) {
    console.warn('Failed to access interaction cache:', err)
    return
  }

  if (!raw) return

  try {
    const parsed = JSON.parse(raw) as InteractionSnapshot
    suppressPersistence = true

    if (Array.isArray(parsed.likes)) {
      likedEvents.set(new Set(parsed.likes))
    }

    if (Array.isArray(parsed.reposts)) {
      repostedEvents.set(new Set(parsed.reposts))
    }

    if (Array.isArray(parsed.zaps)) {
      zappedEvents.set(new Map(parsed.zaps))
    }

    if (Array.isArray(parsed.comments)) {
      commentedThreads.set(new Set(parsed.comments))
    }
  } catch (err) {
    console.warn('Failed to hydrate interaction cache:', err)
  } finally {
    suppressPersistence = false
  }
}

export function persistInteractionsSnapshot(): void {
  const storage = getStorage()
  if (!storage) return

  const user = get(currentUser)
  if (!user?.pubkey) return

  const snapshot: InteractionSnapshot = {
    likes: clampList(get(likedEvents)),
    reposts: clampList(get(repostedEvents)),
    zaps: clampList(get(zappedEvents).entries()),
    comments: clampList(get(commentedThreads)),
  }

  try {
    storage.setItem(getStorageKey(user.pubkey), JSON.stringify(snapshot))
  } catch (err) {
    console.warn('Failed to persist interaction cache:', err)
  }
}

function schedulePersistence(): void {
  if (suppressPersistence) return
  const storage = getStorage()
  if (!storage) return
  if (persistTimeout) {
    window.clearTimeout(persistTimeout)
  }
  persistTimeout = window.setTimeout(() => {
    persistInteractionsSnapshot()
  }, 400)
}

export function startInteractionPersistence(): void {
  if (typeof window === 'undefined') return
  if (persistenceUnsubscribers) return

  const subscribers = [
    likedEvents.subscribe(schedulePersistence),
    repostedEvents.subscribe(schedulePersistence),
    zappedEvents.subscribe(schedulePersistence),
    commentedThreads.subscribe(schedulePersistence),
  ]

  persistenceUnsubscribers = subscribers
}

export function stopInteractionPersistence(): void {
  if (!persistenceUnsubscribers) return
  for (const unsubscribe of persistenceUnsubscribers) {
    unsubscribe()
  }
  persistenceUnsubscribers = null
  if (persistTimeout) {
    window.clearTimeout(persistTimeout)
    persistTimeout = null
  }
}
