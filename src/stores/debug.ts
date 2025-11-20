import { writable } from 'svelte/store'

export type DebugLogEntry = {
  level: 'warn' | 'error'
  message: string
  details: unknown[]
  timestamp: number
}

const MAX_LOGS = 50

function createDebugLogStore() {
  const { subscribe, update } = writable<DebugLogEntry[]>([])

  function push(entry: DebugLogEntry) {
    update(list => {
      const next = [...list, entry]
      if (next.length > MAX_LOGS) {
        next.shift()
      }
      return next
    })
  }

  function clear() {
    update(() => [])
  }

  return {
    subscribe,
    push,
    clear,
  }
}

export const debugLogStore = createDebugLogStore()
