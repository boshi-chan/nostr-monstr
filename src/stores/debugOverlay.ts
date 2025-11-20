import { writable } from 'svelte/store'

function shouldEnableDefault(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('debug') === '1'
}

const { subscribe, set, update } = writable(shouldEnableDefault())

export const debugOverlayEnabled = {
  subscribe,
  toggle: () => update(value => !value),
  enable: () => set(true),
  disable: () => set(false),
}
