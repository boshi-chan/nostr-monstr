import { writable } from 'svelte/store'

// FeedSource includes legacy long-read labels used by subscription helpers
export type FeedSource =
  | 'following'
  | 'circles'
  | 'trending'
  | 'long-reads'
  | 'long-reads-following'
  | 'long-reads-circles'
  | 'livestreams-global'
  | 'livestreams-following'
  | 'livestreams-circles'
export type TimelineFeed = 'following' | 'circles' | 'trending'
export type LivestreamFeed = 'livestreams-global' | 'livestreams-following' | 'livestreams-circles'

export const feedSource = writable<FeedSource>('following')
export const lastTimelineFeed = writable<TimelineFeed>('following')
export const lastLivestreamFeed = writable<LivestreamFeed>('livestreams-following')

// Initialize livestream feed to following
if (typeof window !== 'undefined') {
  feedSource.subscribe(value => {
    if (value.startsWith('livestreams-') && !lastLivestreamFeed) {
      lastLivestreamFeed.set('livestreams-following')
    }
  })
}

feedSource.subscribe(value => {
  if (value === 'following' || value === 'circles' || value === 'trending') {
    lastTimelineFeed.set(value)
  }
  if (value === 'livestreams-global' || value === 'livestreams-following' || value === 'livestreams-circles') {
    lastLivestreamFeed.set(value)
  }
})
