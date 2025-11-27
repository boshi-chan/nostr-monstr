<script lang="ts">
  import { onMount } from 'svelte'
  import { search, loadFollowPacks } from '$lib/search'
  import { openPost, openProfile } from '$stores/router'
  import { searchQuery, searchResults, isSearching, searchError, type FollowPack } from '$stores/search'
  import { followMultipleUsers } from '$lib/follows'
  import { logger } from '$lib/logger'
  import SearchIcon from '../icons/SearchIcon.svelte'
  import UsersIcon from '../icons/UsersIcon.svelte'
  import FollowButton from '../FollowButton.svelte'
  import PackageIcon from 'lucide-svelte/icons/package'

  let searchAbortController: AbortController | null = null
  let searchTimeout: ReturnType<typeof setTimeout>
  let activeSection: 'users' | 'posts' | 'packs' | 'hashtags' = 'users'

  let allFollowPacks: FollowPack[] = []
  let isLoadingPacks = true
  let followingPackId: string | null = null

  // Load all follow packs on mount
  onMount(async () => {
    console.log('[Discover] onMount started - loading follow packs...')
    logger.info('[Discover] onMount started - loading follow packs...')
    try {
      isLoadingPacks = true
      console.log('[Discover] Calling loadFollowPacks...')
      const packs = await loadFollowPacks(50)
      console.log('[Discover] Received packs:', packs.length)
      logger.info(`[Discover] Received ${packs.length} follow packs`)
      allFollowPacks = packs
    } catch (err) {
      console.error('[Discover] Failed to load follow packs:', err)
      logger.error('Failed to load follow packs:', err)
    } finally {
      isLoadingPacks = false
      console.log('[Discover] onMount completed')
    }
  })

  async function handleSearch(query: string) {
    if (!query.trim()) {
      searchResults.set([])
      return
    }

    if (searchAbortController) {
      searchAbortController.abort()
    }

    searchAbortController = new AbortController()
    const currentSearch = searchAbortController

    try {
      isSearching.set(true)
      searchError.set(null)

      // Search users and posts
      const generalResults = await search(query, currentSearch)

      if (!currentSearch.signal.aborted) {
        searchResults.set(generalResults)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      searchError.set(String(err))
      logger.error('Search failed:', err)
    } finally {
      if (currentSearch === searchAbortController) {
        isSearching.set(false)
      }
    }
  }

  function handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement
    const query = target.value
    searchQuery.set(query)

    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      handleSearch(query)
    }, 300)
  }

  function handleResultClick(result: any) {
    if (result.type === 'post') {
      openPost(result.data, 'discover')
    } else if (result.type === 'user') {
      openProfile(result.data.pubkey, 'discover')
    }
  }

  async function handleFollowPack(pack: FollowPack) {
    if (followingPackId === pack.id) return

    try {
      followingPackId = pack.id
      logger.info(`Following pack: ${pack.title} (${pack.users.length} users)`)
      await followMultipleUsers(pack.users)
      logger.info(`✓ Successfully followed all users in "${pack.title}"`)
    } catch (err) {
      logger.error(`Failed to follow pack "${pack.title}":`, err)
    } finally {
      followingPackId = null
    }
  }

  // Filter results by active section
  $: userResults = $searchResults.filter(r => r.type === 'user')
  $: postResults = $searchResults.filter(r => r.type === 'post')

  // Filter follow packs client-side based on search query
  $: filteredPacks = $searchQuery.trim()
    ? allFollowPacks.filter(pack => {
        const query = $searchQuery.toLowerCase()
        const title = pack.title.toLowerCase()
        const desc = (pack.description || '').toLowerCase()
        return title.includes(query) || desc.includes(query)
      })
    : allFollowPacks
</script>

<div class="w-full min-h-screen pb-24 md:pb-0">
  <!-- Header -->
  <div class="sticky top-0 z-20 bg-dark/80 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-dark/60">
    <div class="flex h-14 md:h-16 w-full items-center justify-between px-3 md:px-6 border-b border-dark-border/60">
      <h1 class="text-lg md:text-xl font-bold text-text-soft">Discover</h1>
    </div>
  </div>

  <div class="max-w-3xl mx-auto px-3 md:px-6 py-6 space-y-6">
    <!-- Search Input -->
    <div class="relative">
      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">
        <SearchIcon size={20} />
      </div>
      <input
        type="text"
        value={$searchQuery}
        on:input={handleInputChange}
        placeholder="Search users, posts, hashtags..."
        class="w-full bg-dark-light border border-dark-border rounded-xl pl-12 pr-4 py-3 text-text-soft placeholder:text-text-muted focus:outline-none focus:border-primary transition-colors"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <!-- Section Tabs -->
    <div class="flex gap-2 border-b border-dark-border">
      <button
        class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeSection === 'users'
            ? 'border-primary text-text-soft'
            : 'border-transparent text-text-muted hover:text-text-soft'
        }`}
        on:click={() => activeSection = 'users'}
      >
        Users
      </button>
      <button
        class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeSection === 'posts'
            ? 'border-primary text-text-soft'
            : 'border-transparent text-text-muted hover:text-text-soft'
        }`}
        on:click={() => activeSection = 'posts'}
      >
        Posts
      </button>
      <button
        class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeSection === 'packs'
            ? 'border-primary text-text-soft'
            : 'border-transparent text-text-muted hover:text-text-soft'
        }`}
        on:click={() => activeSection = 'packs'}
      >
        Follow Packs
      </button>
      <button
        class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeSection === 'hashtags'
            ? 'border-primary text-text-soft'
            : 'border-transparent text-text-muted hover:text-text-soft'
        }`}
        on:click={() => activeSection = 'hashtags'}
      >
        Hashtags
      </button>
    </div>

    <!-- Results -->
    <div class="space-y-4">
      {#if $isSearching}
        <div class="flex items-center justify-center py-12">
          <div class="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
        </div>
      {:else if $searchError}
        <div class="text-center py-12">
          <p class="text-red-400">{$searchError}</p>
        </div>
      {:else if $searchQuery.trim() || activeSection === 'packs'}
        {#if activeSection === 'users'}
          {#if userResults.length > 0}
            <div class="space-y-2">
              {#each userResults as result (result.data.pubkey)}
                <div class="w-full flex items-center gap-3 p-4 bg-dark-light rounded-xl">
                  <button
                    class="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
                    on:click={() => handleResultClick(result)}
                  >
                    {#if result.data.picture}
                      <img src={result.data.picture} alt={result.data.name || 'User'} class="w-12 h-12 rounded-full object-cover" />
                    {:else}
                      <div class="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <UsersIcon size={24} color="var(--color-primary)" />
                      </div>
                    {/if}
                    <div class="flex-1 min-w-0">
                      <p class="font-semibold text-text-soft truncate">{result.data.display_name || result.data.name || 'Anonymous'}</p>
                      {#if result.data.about}
                        <p class="text-sm text-text-muted truncate">{result.data.about}</p>
                      {/if}
                    </div>
                  </button>
                  <div class="flex-shrink-0">
                    <FollowButton pubkey={result.data.pubkey} size="sm" layout="inline" />
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-12">
              <p class="text-text-muted">No users found</p>
            </div>
          {/if}
        {:else if activeSection === 'posts'}
          {#if postResults.length > 0}
            <div class="space-y-2">
              {#each postResults as result (result.data.id)}
                <button
                  class="w-full p-4 bg-dark-light hover:bg-dark rounded-xl transition-colors text-left"
                  on:click={() => handleResultClick(result)}
                >
                  <p class="text-text-soft line-clamp-3">{result.data.content}</p>
                  <p class="text-xs text-text-muted mt-2">
                    {new Date(result.data.created_at * 1000).toLocaleDateString()}
                  </p>
                </button>
              {/each}
            </div>
          {:else}
            <div class="text-center py-12">
              <p class="text-text-muted">No posts found</p>
            </div>
          {/if}
        {:else if activeSection === 'packs'}
          {#if isLoadingPacks}
            <div class="flex items-center justify-center py-12">
              <div class="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>
          {:else if filteredPacks.length > 0}
            <div class="space-y-3">
              {#each filteredPacks as pack (pack.id)}
                <div class="w-full p-4 bg-dark-light rounded-xl">
                  <div class="flex items-start gap-3 mb-3">
                    <div class="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <PackageIcon size={24} color="var(--color-primary)" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <h3 class="font-semibold text-text-soft">{pack.title}</h3>
                      {#if pack.description}
                        <p class="text-sm text-text-muted mt-1">{pack.description}</p>
                      {/if}
                      <p class="text-xs text-text-muted mt-2">
                        {pack.users.length} users • {new Date(pack.created_at * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    class="w-full px-4 py-2 bg-primary text-dark rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    on:click={() => handleFollowPack(pack)}
                    disabled={followingPackId === pack.id}
                  >
                    {#if followingPackId === pack.id}
                      Following...
                    {:else}
                      Follow All ({pack.users.length})
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-center py-12">
              <p class="text-text-muted">No follow packs found</p>
              <p class="text-sm text-text-muted/60 mt-2">{$searchQuery.trim() ? 'Try a different search term' : 'Follow packs will appear here'}</p>
            </div>
          {/if}
        {:else if activeSection === 'hashtags'}
          <div class="text-center py-12">
            <p class="text-text-muted">Hashtag search coming soon...</p>
            <p class="text-sm text-text-muted/60 mt-2">Find posts by topic</p>
          </div>
        {/if}
      {:else}
        <div class="text-center py-12">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <SearchIcon size={32} color="var(--color-primary)" />
          </div>
          <p class="text-text-muted mb-2">Start typing to search</p>
          <p class="text-sm text-text-muted/60">Search for users, posts, follow packs, and hashtags</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
