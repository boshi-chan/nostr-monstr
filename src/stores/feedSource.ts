import { writable } from 'svelte/store'

// FeedSource includes legacy long-read labels used by subscription helpers
export type FeedSource = 'global' | 'following' | 'circles' | 'long-reads' | 'long-reads-following' | 'long-reads-circles'
export type TimelineFeed = 'global' | 'following' | 'circles'

export const feedSource = writable<FeedSource>('following')
export const lastTimelineFeed = writable<TimelineFeed>('following')

feedSource.subscribe(value => {
  if (value === 'global' || value === 'following' || value === 'circles') {
    lastTimelineFeed.set(value)
  }
})
