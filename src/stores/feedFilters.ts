import { writable } from 'svelte/store'

export type FilterMode = 'all' | 'replies' | 'media' | 'reposts' | 'likes'

export type FeedFilters = {
  // Main feed toggles
  showReplies: boolean
  showReposts: boolean
  showMedia: boolean
  showBots: boolean
  // Profile view mode
  profileMode: FilterMode
}

const DEFAULT_FILTERS: FeedFilters = {
  showReplies: true,
  showReposts: true,
  showMedia: true,
  showBots: false,
  profileMode: 'all',
}

// Load from localStorage if available
function loadFilters(): FeedFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS

  try {
    const stored = localStorage.getItem('feedFilters')
    if (stored) {
      return { ...DEFAULT_FILTERS, ...JSON.parse(stored) }
    }
  } catch (e) {
    console.warn('Failed to load feed filters from localStorage:', e)
  }

  return DEFAULT_FILTERS
}

// Create the store
export const feedFilters = writable<FeedFilters>(loadFilters())

// Persist to localStorage on changes
feedFilters.subscribe(value => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('feedFilters', JSON.stringify(value))
    } catch (e) {
      console.warn('Failed to save feed filters to localStorage:', e)
    }
  }
})

// Helper functions for main feed toggles
export function toggleReplies() {
  feedFilters.update(f => ({ ...f, showReplies: !f.showReplies }))
}

export function toggleReposts() {
  feedFilters.update(f => ({ ...f, showReposts: !f.showReposts }))
}

export function toggleMedia() {
  feedFilters.update(f => ({ ...f, showMedia: !f.showMedia }))
}

export function toggleBots() {
  feedFilters.update(f => ({ ...f, showBots: !f.showBots }))
}

// Helper function for profile view mode
export function setProfileMode(mode: FilterMode) {
  feedFilters.update(f => ({ ...f, profileMode: mode }))
}

export function resetFilters() {
  feedFilters.set(DEFAULT_FILTERS)
}
