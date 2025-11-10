import { writable } from 'svelte/store'

export type FeedSource = 'global' | 'following' | 'circles' | 'long-reads'
export type TimelineFeed = Exclude<FeedSource, 'long-reads'>

export const feedSource = writable<FeedSource>('following')
export const lastTimelineFeed = writable<TimelineFeed>('following')

feedSource.subscribe(value => {
  if (value !== 'long-reads') {
    lastTimelineFeed.set(value as TimelineFeed)
  }
})
