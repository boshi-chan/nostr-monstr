import { writable, derived } from 'svelte/store'
import type { NostrEvent } from '$types/nostr'
import type { UserMetadata } from '$types/user'

export type SearchFilter = 'all' | 'posts' | 'users' | 'packs'

export interface FollowPack {
  id: string
  pubkey: string
  title: string
  description?: string
  users: string[]
  created_at: number
}

export interface SearchResult {
  type: 'post' | 'user' | 'pack'
  id: string
  data: NostrEvent | (UserMetadata & { pubkey: string }) | FollowPack
}

export const showSearch = writable(false)
export const searchQuery = writable('')
export const searchFilter = writable<SearchFilter>('all')
export const searchResults = writable<SearchResult[]>([])
export const isSearching = writable(false)
export const searchError = writable<string | null>(null)

// Derived: has active search
export const hasSearchResults = derived(searchResults, $results => $results.length > 0)

// Derived: filtered results based on filter
export const filteredSearchResults = derived(
  [searchResults, searchFilter],
  ([$results, $filter]) => {
    if ($filter === 'all') return $results
    if ($filter === 'posts') return $results.filter(r => r.type === 'post')
    if ($filter === 'users') return $results.filter(r => r.type === 'user')
    if ($filter === 'packs') return $results.filter(r => r.type === 'pack')
    return $results
  }
)
