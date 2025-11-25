<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { metadataCache } from '$stores/feed'
  import { fetchUserMetadata } from '$lib/metadata'
  import { getFollowingList } from '$lib/follows'
  import { getNDK } from '$lib/ndk'
  import { logger } from '$lib/logger'
  import type { UserMetadata } from '$types/user'

  export let searchTerm: string = ''
  export let visible: boolean = false
  export let position: { top: number; left: number } = { top: 0, left: 0 }
  export let onSelect: (pubkey: string, displayName: string) => void

  interface MentionSuggestion {
    pubkey: string
    displayName: string
    metadata: UserMetadata | null
  }

  let suggestions: MentionSuggestion[] = []
  let selectedIndex = 0
  let followingList: Set<string> = new Set()
  let isSearching = false
  let searchAbortController: AbortController | null = null
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

  // Load following list
  onMount(async () => {
    try {
      followingList = await getFollowingList()
    } catch (err) {
      logger.warn('Failed to load following list:', err)
    }
  })

  // Cleanup on component destroy
  onDestroy(() => {
    if (searchAbortController) {
      searchAbortController.abort()
    }
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }
  })

  // Update suggestions when search term changes
  $: if (visible && searchTerm !== undefined) {
    updateSuggestions(searchTerm)
  }

  async function updateSuggestions(term: string) {
    selectedIndex = 0

    // Cancel previous search
    if (searchAbortController) {
      searchAbortController.abort()
    }
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }

    if (!term || term.length === 0) {
      // Show recent/following when no search term
      isSearching = false
      suggestions = Array.from(followingList)
        .slice(0, 10)
        .map(pubkey => ({
          pubkey,
          displayName: getDisplayName(pubkey),
          metadata: $metadataCache.get(pubkey) || null
        }))

      // Fetch metadata for suggestions (async, non-blocking)
      for (const pubkey of followingList.values()) {
        if (!$metadataCache.has(pubkey)) {
          fetchUserMetadata(pubkey)
        }
      }

      return
    }

    const lowerTerm = term.toLowerCase()

    // First: instant filter from following list (no network call)
    const fromFollowing = Array.from(followingList)
      .filter(pubkey => {
        const metadata = $metadataCache.get(pubkey)
        const name = (metadata?.name || metadata?.display_name || '').toLowerCase()
        return name.includes(lowerTerm) || pubkey.toLowerCase().includes(lowerTerm)
      })
      .slice(0, 5)
      .map(pubkey => ({
        pubkey,
        displayName: getDisplayName(pubkey),
        metadata: $metadataCache.get(pubkey) || null
      }))

    suggestions = fromFollowing

    // Second: debounced network search (only if 3+ chars)
    if (term.length >= 3) {
      isSearching = true
      searchDebounceTimer = setTimeout(() => {
        searchNetwork(term)
      }, 300) // 300ms debounce
    }
  }

  async function searchNetwork(term: string) {
    const ndk = getNDK()
    const lowerTerm = term.toLowerCase()

    // Create new abort controller for this search
    searchAbortController = new AbortController()
    const currentSearch = searchAbortController

    try {
      // Search for profiles matching the search term
      // Note: NDK doesn't support NIP-50 search yet, so we fetch recent profiles
      // and filter client-side. Future: use search parameter when supported.
      const events = await ndk.fetchEvents({
        kinds: [0], // Profile metadata
        limit: 50, // Increased to get better matches after filtering
      })

      // Check if this search was cancelled
      if (currentSearch.signal.aborted) {
        return
      }

      // Batch metadata updates to reduce store updates
      const newMetadata: Array<[string, UserMetadata]> = []
      const matches: MentionSuggestion[] = []

      for (const event of events) {
        try {
          const metadata = JSON.parse(event.content) as UserMetadata
          const name = (metadata.name || metadata.display_name || '').toLowerCase()

          if (name.includes(lowerTerm) || event.pubkey.toLowerCase().includes(lowerTerm)) {
            newMetadata.push([event.pubkey, metadata])
            matches.push({
              pubkey: event.pubkey,
              displayName: metadata.display_name || metadata.name || event.pubkey.slice(0, 8),
              metadata
            })
          }
        } catch (err) {
          // Skip invalid metadata
        }
      }

      // Check again before updating (in case search was cancelled during processing)
      if (currentSearch.signal.aborted) {
        return
      }

      // Single batch update to metadata cache
      if (newMetadata.length > 0) {
        metadataCache.update((cache: Map<string, UserMetadata>) => {
          for (const [pubkey, metadata] of newMetadata) {
            cache.set(pubkey, metadata)
          }
          return cache
        })
      }

      // Merge with existing suggestions (following list first)
      const existingPubkeys = new Set(suggestions.map(s => s.pubkey))
      const newSuggestions = matches.filter(m => !existingPubkeys.has(m.pubkey))

      suggestions = [...suggestions, ...newSuggestions].slice(0, 10)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Search was cancelled, this is expected
        return
      }
      logger.warn('Network search failed:', err)
    } finally {
      // Only clear loading if this is still the current search
      if (currentSearch === searchAbortController) {
        isSearching = false
      }
    }
  }

  function getDisplayName(pubkey: string): string {
    const metadata = $metadataCache.get(pubkey)
    return metadata?.display_name || metadata?.name || pubkey.slice(0, 8)
  }

  export function handleKeyDown(event: KeyboardEvent): boolean {
    if (!visible || suggestions.length === 0) return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedIndex = (selectedIndex + 1) % suggestions.length
      return true
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedIndex = selectedIndex === 0 ? suggestions.length - 1 : selectedIndex - 1
      return true
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      if (suggestions[selectedIndex]) {
        selectSuggestion(suggestions[selectedIndex])
      }
      return true
    } else if (event.key === 'Escape') {
      event.preventDefault()
      visible = false
      return true
    }

    return false
  }

  function selectSuggestion(suggestion: MentionSuggestion) {
    onSelect(suggestion.pubkey, suggestion.displayName)
    visible = false
  }

  function handleClick(suggestion: MentionSuggestion) {
    selectSuggestion(suggestion)
  }
</script>

{#if visible && suggestions.length > 0}
  <div
    class="mention-autocomplete fixed z-50 w-64 rounded-xl border border-dark-border/80 bg-dark shadow-2xl"
    style="top: {position.top}px; left: {position.left}px;"
  >
    <div class="max-h-64 overflow-y-auto p-2">
      {#each suggestions as suggestion, index}
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors {index === selectedIndex
            ? 'bg-primary/20 text-text-soft'
            : 'text-text-muted hover:bg-dark-lighter'}"
          on:click={() => handleClick(suggestion)}
        >
          {#if suggestion.metadata?.picture}
            <img
              src={suggestion.metadata.picture}
              alt={suggestion.displayName}
              class="h-8 w-8 rounded-full object-cover"
            />
          {:else}
            <div class="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium">
              {suggestion.displayName.slice(0, 2).toUpperCase()}
            </div>
          {/if}
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{suggestion.displayName}</div>
            {#if suggestion.metadata?.nip05}
              <div class="text-xs text-text-muted/60 truncate">{suggestion.metadata.nip05}</div>
            {/if}
          </div>
          {#if followingList.has(suggestion.pubkey)}
            <div class="text-xs text-primary/60">Following</div>
          {/if}
        </button>
      {/each}
    </div>
    {#if isSearching}
      <div class="border-t border-dark-border/40 px-3 py-2 text-xs text-text-muted/60">
        Searching network...
      </div>
    {/if}
  </div>
{/if}

<style>
  .mention-autocomplete {
    animation: slideUp 0.15s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
