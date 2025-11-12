import { writable } from 'svelte/store'

export type FeedSource = 'global' | 'following' | 'circles' | 'long-reads' | 'long-reads-following' | 'long-reads-circles'
export type TimelineFeed = 'global' | 'following' | 'circles'
export type LongReadsFeed = 'long-reads-following' | 'long-reads-circles'

export const feedSource = writable<FeedSource>('following')
export const lastTimelineFeed = writable<TimelineFeed>('following')
export const lastLongReadsFeed = writable<LongReadsFeed>('long-reads-following')

feedSource.subscribe(value => {
  if (value === 'global' || value === 'following' || value === 'circles') {
    lastTimelineFeed.set(value)
  } else if (value === 'long-reads-following' || value === 'long-reads-circles') {
    lastLongReadsFeed.set(value)
  }
})
