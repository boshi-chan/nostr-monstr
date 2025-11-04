import { writable } from 'svelte/store'
import type { NostrEvent } from '$types/nostr'

export type FeedTab = 'following' | 'circles' | 'long-reads' | 'global'

// Simple stores - no derived complexity
export const activeFeedTab = writable<FeedTab>('global')
export const feedEvents = writable<NostrEvent[]>([])
export const isLoadingFeed = writable(false)
export const userContacts = writable<Set<string>>(new Set())
export const contactsOfContacts = writable<Set<string>>(new Set())
export const metadataCache = writable<Map<string, any>>(new Map())
