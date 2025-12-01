import { writable } from 'svelte/store'

// Path-based route store
export const currentRoute = writable<string>(
  typeof window !== 'undefined' ? window.location.pathname || '/' : '/'
)

// Track if the current navigation is a back/forward navigation
export const isHistoryNavigation = writable<boolean>(false)

// Store to hold scroll position for the home feed
export const savedScrollPosition = writable<number>(0)

export function seedHistory(): void {
  if (typeof window === 'undefined') return
  const path = window.location.pathname || '/'
  history.replaceState({ path }, '', path)
  history.pushState({ path }, '', path)
}

export function navigateTo(path: string, routeState?: any): void {
  if (typeof window === 'undefined') return
  // Store both path and route state so we can restore them on back navigation
  history.pushState({ path, route: routeState }, '', path)
  currentRoute.set(path)
  isHistoryNavigation.set(false)
  window.dispatchEvent(new CustomEvent('app:navigate', { detail: path }))
}
