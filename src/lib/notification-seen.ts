import { Capacitor } from '@capacitor/core'

type SeenMap = Record<string, number>

const STORAGE_KEY = 'monstr_notifications_seen'
const RETENTION_SEC = 7 * 24 * 60 * 60 // 7 days

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function loadFromStorage(): SeenMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {}
  } catch (err) {
    console.warn('[notification-seen] Failed to load seen map:', err)
    return {}
  }
}

function saveToStorage(map: SeenMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch (err) {
    console.warn('[notification-seen] Failed to persist seen map:', err)
  }
}

let seenMap: SeenMap = loadFromStorage()

export function purgeOldSeen(): void {
  const cutoff = nowSeconds() - RETENTION_SEC
  let changed = false
  for (const [id, ts] of Object.entries(seenMap)) {
    if (ts < cutoff) {
      delete seenMap[id]
      changed = true
    }
  }
  if (changed) {
    saveToStorage(seenMap)
  }
}

export function hasSeenNotification(id: string): boolean {
  return Boolean(seenMap[id])
}

export function markNotificationSeen(id: string): void {
  if (!id) return
  seenMap[id] = nowSeconds()
  saveToStorage(seenMap)
}
