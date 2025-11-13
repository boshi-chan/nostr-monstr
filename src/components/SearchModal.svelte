<script lang="ts">
  import { showSearch, searchQuery, searchResults, isSearching, searchError, searchFilter, filteredSearchResults } from '$stores/search'
  import { search } from '$lib/search'
  import { openPost, openProfile } from '$stores/router'
  import { get } from 'svelte/store'

  let searchInput: HTMLInputElement

  async function handleSearch(query: string) {
    if (!query.trim()) {
      searchResults.set([])
      return
    }

    try {
      isSearching.set(true)
      searchError.set(null)

      const results = await search(query)
      searchResults.set(results)
    } catch (err) {
      searchError.set(String(err))
      console.error('Search failed:', err)
    } finally {
      isSearching.set(false)
    }
  }

  function handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement
    const query = target.value
    searchQuery.set(query)

    // Debounce search
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      handleSearch(query)
    }, 300)
  }

  function handleResultClick(result: any) {
    if (result.type === 'post') {
      openPost(result.data, 'home')
    } else if (result.type === 'user') {
      openProfile(result.data.pubkey, 'home')
    }
    closeSearch()
  }

  function closeSearch() {
    showSearch.set(false)
    searchQuery.set('')
    searchResults.set([])
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeSearch()
    }
  }

  function handleOverlayClick() {
    closeSearch()
  }

  let searchTimeout: ReturnType<typeof setTimeout>

  $: if (get(showSearch) && searchInput) {
    setTimeout(() => searchInput?.focus(), 0)
  }
</script>

<svelte:window on:keydown={handleEscape} />

{#if $showSearch}
  <!-- Overlay -->
  <button
    type="button"
    aria-label="Close search"
    class="fixed inset-0 z-40 bg-black/50"
    on:click={handleOverlayClick}
    on:keydown={(e) => {
      if (e.key === 'Escape') closeSearch()
    }}
  ></button>

  <!-- Search Modal -->
  <div class="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 md:pt-24">
    <div
      role="dialog"
      aria-modal="true"
      class="w-full max-w-2xl rounded-2xl border border-dark-border bg-dark-light shadow-2xl"
    >
      <!-- Search Input -->
      <div class="border-b border-dark-border/60 p-4">
        <div class="flex items-center gap-3 mb-3">
          <div class="flex-1">
            <input
              bind:this={searchInput}
              type="text"
              placeholder="Search posts, users, npubs, hashtags..."
              value={$searchQuery}
              on:input={handleInputChange}
              class="w-full bg-transparent text-lg text-text-soft placeholder-text-muted/50 outline-none"
            />
          </div>
          <button
            on:click={closeSearch}
            class="text-text-muted hover:text-text-soft transition-colors"
            aria-label="Close search"
          >
            ✕
          </button>
        </div>

        <!-- Filter buttons -->
        <div class="flex gap-2">
          <button
            on:click={() => searchFilter.set('all')}
            class={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              $searchFilter === 'all'
                ? 'bg-primary text-dark'
                : 'bg-dark-border/40 text-text-muted hover:text-text-soft'
            }`}
          >
            All
          </button>
          <button
            on:click={() => searchFilter.set('posts')}
            class={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              $searchFilter === 'posts'
                ? 'bg-primary text-dark'
                : 'bg-dark-border/40 text-text-muted hover:text-text-soft'
            }`}
          >
            Posts
          </button>
          <button
            on:click={() => searchFilter.set('users')}
            class={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              $searchFilter === 'users'
                ? 'bg-primary text-dark'
                : 'bg-dark-border/40 text-text-muted hover:text-text-soft'
            }`}
          >
            Users
          </button>
        </div>
      </div>

      <!-- Results -->
      <div class="max-h-96 overflow-y-auto">
        {#if $isSearching}
          <div class="p-6 text-center">
            <div class="animate-spin text-2xl mb-2">⏳</div>
            <p class="text-text-muted">Searching...</p>
          </div>
        {:else if $searchError}
          <div class="p-6 text-center">
            <p class="text-red-300">Error: {$searchError}</p>
          </div>
        {:else if $filteredSearchResults.length === 0}
          {#if $searchQuery.trim()}
            <div class="p-6 text-center">
              <p class="text-text-muted">No results found for "{$searchQuery}"</p>
            </div>
          {:else}
            <div class="p-6 text-center">
              <p class="text-text-muted">Start typing to search...</p>
            </div>
          {/if}
        {:else}
          <div class="divide-y divide-dark-border/60">
            {#each $filteredSearchResults as result (result.id)}
              {#if result.type === 'post'}
                <button
                  on:click={() => handleResultClick(result)}
                  class="w-full px-4 py-3 text-left hover:bg-dark/50 transition-colors duration-200"
                >
                  <div class="flex gap-3">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-text-soft line-clamp-2">
                        {result.data.content}
                      </p>
                      <p class="text-xs text-text-muted mt-1">
                        by {result.data.pubkey.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                </button>
              {:else if result.type === 'user'}
                <button
                  on:click={() => handleResultClick(result)}
                  class="w-full px-4 py-3 text-left hover:bg-dark/50 transition-colors duration-200"
                >
                  <div class="flex items-center gap-3">
                    {#if result.data && 'picture' in result.data && result.data.picture}
                      <img
                        src={result.data.picture}
                        alt={('name' in result.data && result.data.name) || 'User'}
                        class="h-10 w-10 rounded-full object-cover flex-shrink-0"
                      />
                    {:else}
                      <div class="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">
                        {(('name' in result.data && result.data.name) || result.data.pubkey).slice(0, 2).toUpperCase()}
                      </div>
                    {/if}
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-text-soft">
                        {('name' in result.data && result.data.name) || 'Anon'}
                      </p>
                      {#if result.data && 'nip05' in result.data && result.data.nip05}
                        <p class="text-xs text-primary/80 truncate flex items-center gap-1">
                          <span class="opacity-60">✓</span>
                          {result.data.nip05}
                        </p>
                      {:else}
                        <p class="text-xs text-text-muted truncate">
                          {result.data.pubkey.slice(0, 16)}...
                        </p>
                      {/if}
                      {#if result.data && 'about' in result.data && result.data.about}
                        <p class="text-xs text-text-muted/70 line-clamp-1 mt-1">
                          {result.data.about}
                        </p>
                      {/if}
                    </div>
                  </div>
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  input::placeholder {
    color: rgba(166, 166, 166, 0.5);
  }
</style>
