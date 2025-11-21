import { writable } from 'svelte/store'
import type { FeedSource } from './feedSource'

export type MediaFilterSettings = {
  autoShow: boolean       // Auto-show all media
  blurUnknown: boolean    // Blur media from non-contacts
  respectCW: boolean      // Respect NIP-36 content-warnings
  blurAll: boolean        // Blur all media regardless
}

export type MediaFilters = {
  following: MediaFilterSettings
  circles: MediaFilterSettings
  global: MediaFilterSettings
  profile: MediaFilterSettings
}

const DEFAULT_FILTERS: MediaFilters = {
  following: {
    autoShow: true,
    blurUnknown: false,
    respectCW: true,
    blurAll: false,
  },
  circles: {
    autoShow: true,
    blurUnknown: false,
    respectCW: true,
    blurAll: false,
  },
  global: {
    autoShow: false,
    blurUnknown: true,  // Safe default for global
    respectCW: true,
    blurAll: false,
  },
  profile: {
    autoShow: false,
    blurUnknown: true,  // Safe default for unknown profiles
    respectCW: true,
    blurAll: false,
  },
}

// Load from localStorage if available
function loadMediaFilters(): MediaFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS

  try {
    const stored = localStorage.getItem('mediaFilters')
    if (stored) {
      const parsed = JSON.parse(stored)
      // Merge with defaults to ensure all properties exist
      return {
        following: { ...DEFAULT_FILTERS.following, ...parsed.following },
        circles: { ...DEFAULT_FILTERS.circles, ...parsed.circles },
        global: { ...DEFAULT_FILTERS.global, ...parsed.global },
        profile: { ...DEFAULT_FILTERS.profile, ...parsed.profile },
      }
    }
  } catch (e) {
    logger.warn('Failed to load media filters from localStorage:', e)
  }

  return DEFAULT_FILTERS
}

// Create the store
export const mediaFilters = writable<MediaFilters>(loadMediaFilters())

// Persist to localStorage on changes
mediaFilters.subscribe(value => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('mediaFilters', JSON.stringify(value))
    } catch (e) {
      logger.warn('Failed to save media filters to localStorage:', e)
    }
  }
})

// Helper function to update a specific context
export function updateMediaFilter(
  context: keyof MediaFilters,
  settings: Partial<MediaFilterSettings>
) {
  mediaFilters.update(filters => ({
    ...filters,
    [context]: { ...filters[context], ...settings },
  }))
}

// Helper to get settings for current feed
export function getMediaFilterForFeed(feedSource: FeedSource): MediaFilterSettings {
  let context: keyof MediaFilters

  switch (feedSource) {
    case 'following':
      context = 'following'
      break
    case 'circles':
      context = 'circles'
      break
    case 'global':
      context = 'global'
      break
    default:
      context = 'global'
  }

  // This function is meant to be called within a derived store or component
  // where the mediaFilters value is available
  return DEFAULT_FILTERS[context]
}

export function resetMediaFilters() {
  mediaFilters.set(DEFAULT_FILTERS)
}

