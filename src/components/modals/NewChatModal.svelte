<script lang="ts">
  import {
    showNewChatModal,
    searchQuery,
    searchResults,
    isSearching,
    activeConversation,
  } from '$stores/messages'
  import { searchUsers } from '$lib/messaging'
  import Modal from '../Modal.svelte'
  import SearchIcon from '../icons/SearchIcon.svelte'
  import { onMount } from 'svelte'

  let inputElement: HTMLInputElement
  let debounceTimer: number

  onMount(() => {
    if ($showNewChatModal) {
      setTimeout(() => inputElement?.focus(), 100)
    }
  })

  async function handleSearch(query: string) {
    if (!query.trim()) {
      searchResults.set([])
      return
    }

    isSearching.set(true)
    try {
      const results = await searchUsers(query)
      searchResults.set(results)
    } catch (err) {
      console.error('Search failed:', err)
      searchResults.set([])
    } finally {
      isSearching.set(false)
    }
  }

  function handleInput(value: string) {
    searchQuery.set(value)

    // Debounce search
    clearTimeout(debounceTimer)
    if (value.trim()) {
      debounceTimer = window.setTimeout(() => {
        void handleSearch(value)
      }, 300)
    } else {
      searchResults.set([])
    }
  }

  function selectUser(pubkey: string) {
    activeConversation.set(pubkey)
    showNewChatModal.set(false)
    searchQuery.set('')
    searchResults.set([])
  }

  function handleClose() {
    showNewChatModal.set(false)
    searchQuery.set('')
    searchResults.set([])
  }
</script>

<Modal isOpen={$showNewChatModal} onClose={handleClose} title="Start New Chat">
  <div class="space-y-4">
    <!-- Search input -->
    <div class="relative">
      <div class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60">
        <SearchIcon size={18} color="currentColor" />
      </div>
      <input
        bind:this={inputElement}
        type="text"
        placeholder="Search by name or paste npub..."
        value={$searchQuery}
        on:input={e => handleInput(e.currentTarget.value)}
        class="w-full rounded-xl border border-dark-border/40 bg-dark/60 pl-10 pr-4 py-2.5 text-sm text-text-soft placeholder-text-muted/60 transition-colors duration-200 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
      />
    </div>

    <!-- Search results -->
    <div class="max-h-96 space-y-2 overflow-y-auto">
      {#if $isSearching}
        <div class="flex items-center justify-center py-8 text-text-muted">
          <div class="text-sm">Searching...</div>
        </div>
      {:else if $searchResults.length === 0 && $searchQuery.trim()}
        <div class="flex items-center justify-center py-8 text-text-muted">
          <div class="text-center text-sm">No users found</div>
        </div>
      {:else if $searchResults.length === 0}
        <div class="flex items-center justify-center py-8 text-text-muted">
          <div class="text-center text-sm">Enter a name or npub to search</div>
        </div>
      {:else}
        {#each $searchResults as result (result.pubkey)}
          <button
            type="button"
            class="w-full rounded-xl border border-dark-border/30 bg-dark/40 p-3 text-left transition-all duration-200 hover:border-primary/40 hover:bg-dark/60"
            on:click={() => selectUser(result.pubkey)}
          >
            <div class="flex items-center gap-3">
              {#if result.avatar}
                <img
                  src={result.avatar}
                  alt={result.name}
                  class="h-10 w-10 rounded-full object-cover"
                />
              {:else}
                <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                  {result.name.slice(0, 2).toUpperCase()}
                </div>
              {/if}
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-text-soft">{result.name}</p>
                <p class="truncate text-xs text-text-muted">{result.pubkey.slice(0, 16)}...</p>
              </div>
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</Modal>
