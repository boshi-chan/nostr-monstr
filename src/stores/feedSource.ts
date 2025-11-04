import { writable } from 'svelte/store'

export type FeedSource = 'global' | 'following' | 'circles' | 'long-reads'

export const feedSource = writable<FeedSource>('global')
