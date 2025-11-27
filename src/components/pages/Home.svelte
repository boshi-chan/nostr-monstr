<script lang="ts">
  import { get } from 'svelte/store'
  import { onMount, onDestroy } from 'svelte'
  import {
    feedEvents,
    feedLoading,
    feedError,
    canLoadMore,
    isLoadingMore,
  } from '$stores/feed'
  import { feedSource, type FeedSource } from '$stores/feedSource'
  import { loadOlderPosts } from '$lib/feed-ndk'
  import { shouldHideEvent, mutedPubkeys, mutedWords, mutedHashtags, mutedEvents } from '$lib/mute'

  import type { NostrEvent } from '$types/nostr'
  import Post from '../Post.svelte'
  import LongReadPreview from '../LongReadPreview.svelte'
  import Skeleton from '../Skeleton.svelte'
  import FilterBar from '../FilterBar.svelte'
  import UsersIcon from '../icons/UsersIcon.svelte'
  import CircleIcon from '../icons/CircleIcon.svelte'
  import GlobeIcon from '../icons/GlobeIcon.svelte'
  import TrendingUpIcon from '../icons/TrendingUpIcon.svelte'
  import { openPost, openProfile } from '$stores/router'

  const feedTabs: { id: FeedSource; label: string; icon: typeof UsersIcon }[] = [
    { id: 'following', label: 'Following', icon: UsersIcon },
    { id: 'circles', label: 'Circles', icon: CircleIcon },
    { id: 'trending', label: 'Trending', icon: TrendingUpIcon },
    { id: 'global', label: 'Global', icon: GlobeIcon },
  ]

  let activeFeed: FeedSource = get(feedSource)
  let hasLoadedOnce = false
  let loadMoreTrigger: HTMLDivElement | null = null
  let observer: IntersectionObserver | null = null
  let feedContainer: HTMLDivElement | null = null
  let savedScrollPosition = 0
  let savedFirstVisiblePostId: string | null = null

  $: activeFeed = $feedSource

  // Filter out muted content (reactive to mute store changes)
  let visibleEvents: NostrEvent[] = []
  let mutedCount = 0
  $: {
    // React to changes in mute stores
    $mutedPubkeys
    $mutedWords
    $mutedHashtags
    $mutedEvents

    const filtered = $feedEvents.filter(event => !shouldHideEvent(event))
    visibleEvents = filtered
    mutedCount = $feedEvents.length - filtered.length
  }

  // Track if we've loaded at least once to avoid showing "no posts" during initial load
  $: if ($feedEvents.length > 0) {
    hasLoadedOnce = true
  }

  // Preserve scroll position when feed updates (but not when feed source changes)
  $: if ($feedEvents.length > 0 && feedContainer) {
    // Restore scroll position after a brief delay to allow DOM to update
    requestAnimationFrame(() => {
      if (savedScrollPosition > 0) {
        // Try to restore by scroll position first
        const container = feedContainer?.parentElement?.parentElement
        if (container) {
          container.scrollTop = savedScrollPosition
        } else if (window.scrollY === 0) {
          // Fallback to window scroll if container not found
          window.scrollTo(0, savedScrollPosition)
        }
        
        // Also try to restore by finding the saved post
        if (savedFirstVisiblePostId) {
          const postElement = document.querySelector(`[data-event-id="${savedFirstVisiblePostId}"]`)
          if (postElement) {
            postElement.scrollIntoView({ behavior: 'auto', block: 'start' })
          }
        }
        
        // Reset saved position after restoring
        savedScrollPosition = 0
        savedFirstVisiblePostId = null
      }
    })
  }

  // Save scroll position before feed changes
  function saveScrollPosition() {
    if (!feedContainer) return
    
    const container = feedContainer.parentElement?.parentElement
    if (container) {
      savedScrollPosition = container.scrollTop
    } else {
      savedScrollPosition = window.scrollY
    }
    
    // Also save the first visible post ID for more accurate restoration
    const visiblePosts = document.querySelectorAll('[data-event-id]')
    for (const post of visiblePosts) {
      const rect = post.getBoundingClientRect()
      if (rect.top >= 0 && rect.top < window.innerHeight) {
        savedFirstVisiblePostId = post.getAttribute('data-event-id')
        break
      }
    }
  }

  // Watch for feed source changes and save position
  $: if (activeFeed !== $feedSource && hasLoadedOnce) {
    saveScrollPosition()
  }

  // Set up IntersectionObserver for infinite scroll
  onMount(() => {
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0]
          if (entry.isIntersecting && $canLoadMore && !$isLoadingMore) {
            void loadOlderPosts()
          }
        },
        {
          rootMargin: '200px', // Trigger 200px before reaching the bottom
        }
      )

      if (loadMoreTrigger) {
        observer.observe(loadMoreTrigger)
      }
    }
  })

  onDestroy(() => {
    if (observer) {
      observer.disconnect()
    }
  })

  function setActiveFeed(tab: FeedSource) {
    feedSource.set(tab)
  }

  function handleEventSelect(event: NostrEvent) {
    openPost(event, 'home')
  }

  function handleProfileSelect(pubkey: string) {
    openProfile(pubkey, 'home')
  }
</script>

<div class="w-full pb-24 md:pb-0">
  <div class="sticky top-0 z-20 bg-dark/80 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-dark/60">
    <div class="flex h-14 md:h-16 w-full items-center justify-between px-3 md:px-6 gap-2 border-b border-dark-border/60">
      <!-- Feed tabs (centered, flex-1) -->
      <div class="flex flex-1 w-full items-center gap-3 overflow-x-auto">
        {#each feedTabs as tab (tab.id)}
          {@const isActive = activeFeed === tab.id}
          <button
            type="button"
            class={`flex flex-1 md:min-w-[120px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 md:px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
              isActive
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'text-text-muted hover:text-text-soft hover:bg-dark/30'
            }`}
            on:click={() => setActiveFeed(tab.id)}
            aria-label={tab.label}
          >
            <svelte:component this={tab.icon} size={20} strokeWidth={2} />
            <span class="hidden md:inline flex flex-col items-start">
              <span>{tab.label}</span>
              {#if tab.id === 'trending'}
                <span class="text-[10px] font-normal opacity-70">Last 24h</span>
              {/if}
            </span>
          </button>
        {/each}
      </div>

    </div>

    <!-- Filter Bar -->
    <FilterBar />
  </div>

  <div class="mx-auto w-full max-w-3xl px-3 md:px-6">
    <div class="flex flex-col gap-3 pt-3">
      {#if $feedLoading && !hasLoadedOnce}
        <!-- Show friendly loading state on first load -->
        <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-8 text-center">
          <div class="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p class="text-lg font-semibold text-text-soft">Finding posts...</p>
          <p class="mt-2 text-sm text-text-muted">
            {activeFeed === 'following'
              ? 'Loading posts from people you follow'
              : activeFeed === 'circles'
              ? 'Loading posts from your circles'
              : 'Loading posts from the global feed'}
          </p>
        </div>
      {:else if $feedLoading && $feedEvents.length === 0}
        <!-- After first load, show skeleton loaders -->
        {#each Array(5) as _}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
            <Skeleton count={4} height="h-4" />
          </div>
        {/each}
      {:else if $feedError && $feedEvents.length === 0}
        <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <p class="text-lg font-semibold text-rose-100">Feed unavailable</p>
          <p class="mt-2 text-sm text-rose-200/80">{$feedError}</p>
        </div>
      {:else if $feedEvents.length === 0}
        <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-6 text-center">
          <p class="text-lg font-semibold text-text-soft">No posts yet</p>
          <p class="mt-2 text-sm text-text-muted">
            {activeFeed === 'following'
              ? 'Follow someone to see their posts'
              : 'Check back in a moment'}
          </p>
        </div>
      {:else}
        <!-- Muted content indicator -->
        {#if mutedCount > 0}
          <div class="rounded-lg border border-dark-border/60 bg-dark-light/40 px-4 py-2 text-center text-sm text-text-muted">
            {mutedCount} {mutedCount === 1 ? 'post' : 'posts'} hidden from muted users
          </div>
        {/if}

        <div bind:this={feedContainer} class="flex flex-col gap-3">
          {#each visibleEvents as event (event.id)}
            {#if event.kind === 30023}
              <div data-event-id={event.id}>
                <LongReadPreview
                  {event}
                  onSelect={handleEventSelect}
                  onProfileSelect={handleProfileSelect}
                />
              </div>
            {:else}
              <div data-event-id={event.id}>
                <Post
                  {event}
                  onSelect={handleEventSelect}
                  onProfileSelect={handleProfileSelect}
                  replyCount={0}
                />
              </div>
            {/if}
          {/each}
        </div>

        <!-- Infinite scroll trigger -->
        <div bind:this={loadMoreTrigger} class="h-1"></div>

        <!-- Loading more indicator -->
        {#if $isLoadingMore}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-4 text-center text-sm text-text-muted">
            Loading older posts...
          </div>
        {:else if !$canLoadMore && $feedEvents.length > 0}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-4 text-center text-sm text-text-muted">
            You've reached the end
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  :global(main) {
    padding-bottom: 0;
  }
</style>
