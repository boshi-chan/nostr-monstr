<script lang="ts">
  import {
    feedEvents,
    feedLoading,
    feedError,
  } from '$stores/feed'

  import { feedSource, type FeedSource } from '$stores/feedSource'
  import { showSearch } from '$stores/search'

  import type { NostrEvent } from '$types/nostr'
  import Post from '../Post.svelte'
  import Skeleton from '../Skeleton.svelte'
  import FilterBar from '../FilterBar.svelte'
  import UsersIcon from '../icons/UsersIcon.svelte'
  import CircleIcon from '../icons/CircleIcon.svelte'
  import GlobeIcon from '../icons/GlobeIcon.svelte'
  import SearchIcon from '../icons/SearchIcon.svelte'
  import { openPost, openProfile } from '$stores/router'

  const feedTabs: { id: FeedSource; label: string; icon: typeof UsersIcon }[] = [
    { id: 'following', label: 'Following', icon: UsersIcon },
    { id: 'circles', label: 'Circles', icon: CircleIcon },
    { id: 'global', label: 'Global', icon: GlobeIcon },
  ]

let activeFeed: FeedSource = 'following'
  $: activeFeed = $feedSource

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
            <span class="hidden md:inline">{tab.label}</span>
          </button>
        {/each}
      </div>

      <!-- Search button (desktop only, moved to mobile menu) -->
      <button
        type="button"
        on:click={() => showSearch.set(true)}
        class="hidden md:flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:text-text-soft hover:bg-dark/30 transition-colors duration-200 flex-shrink-0"
        title="Search"
        aria-label="Search"
      >
        <SearchIcon size={20} color="currentColor" strokeWidth={2} />
      </button>
    </div>

    <!-- Filter Bar -->
    <FilterBar />
  </div>

  <div class="mx-auto w-full max-w-3xl px-3 md:px-6">
    <div class="flex flex-col gap-3 pt-3">
      {#if $feedLoading && $feedEvents.length === 0}
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
        {#each $feedEvents as event (event.id)}
          <Post
            {event}
            onSelect={handleEventSelect}
            onProfileSelect={handleProfileSelect}
            replyCount={0}
          />
        {/each}

        {#if $feedLoading}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-4 text-center text-sm text-text-muted">
            Loading more...
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
