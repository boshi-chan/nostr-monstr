<script lang="ts">
  import { onMount } from 'svelte'
  import { feedEvents, feedLoading, feedError } from '$stores/feed'
  import { feedSource, lastLongReadsFeed, type LongReadsFeed } from '$stores/feedSource'
  import type { NostrEvent } from '$types/nostr'
  import Skeleton from '../Skeleton.svelte'
  import LongReadPreview from '../LongReadPreview.svelte'
  import { openPost, openProfile } from '$stores/router'
  import UsersIcon from '../icons/UsersIcon.svelte'
  import CircleIcon from '../icons/CircleIcon.svelte'

  const feedTabs: { id: LongReadsFeed; label: string; icon: typeof UsersIcon }[] = [
    { id: 'long-reads-following', label: 'Following', icon: UsersIcon },
    { id: 'long-reads-circles', label: 'Circles', icon: CircleIcon },
  ]

  // Filter for kind 30023 (long-form) events only
  let longReadEvents: NostrEvent[] = []
  $: longReadEvents = $feedEvents.filter(event => event.kind === 30023)

  let activeFeed: LongReadsFeed = 'long-reads-following'
  $: if ($feedSource === 'long-reads-following' || $feedSource === 'long-reads-circles') {
    activeFeed = $feedSource
  }

  onMount(() => {
    // Start with last used long reads feed, or default to following
    feedSource.set($lastLongReadsFeed)
  })

  function setActiveFeed(tab: LongReadsFeed) {
    feedSource.set(tab)
  }

  function handleEventSelect(event: NostrEvent) {
    openPost(event, 'long-reads')
  }

  function handleProfileSelect(pubkey: string) {
    openProfile(pubkey, 'long-reads')
  }
</script>

<div class="w-full pb-24 md:pb-0">
  <div class="sticky top-0 z-20 bg-dark/80 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-dark/60">
    <div class="flex h-14 md:h-16 w-full items-center justify-between px-3 md:px-6 gap-2 border-b border-dark-border/60">
      <!-- Feed tabs -->
      <div class="flex flex-1 w-full items-center gap-3 overflow-x-auto">
        {#each feedTabs as tab (tab.id)}
          {@const isActive = activeFeed === tab.id}
          <button
            type="button"
            class={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? 'bg-primary text-dark shadow-sm shadow-primary/30'
                : 'text-text-muted hover:text-text-soft'
            }`}
            on:click={() => setActiveFeed(tab.id)}
          >
            <svelte:component this={tab.icon} size={20} strokeWidth={2} />
            <span>{tab.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="mx-auto w-full max-w-3xl px-3 md:px-6">
    <div class="flex flex-col gap-3 pt-3">
      {#if $feedLoading && longReadEvents.length === 0}
        {#each Array(5) as _}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
            <Skeleton count={4} height="h-4" />
          </div>
        {/each}
      {:else if $feedError && longReadEvents.length === 0}
        <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <p class="text-lg font-semibold text-rose-100">Long reads unavailable</p>
          <p class="mt-2 text-sm text-rose-200/80">{$feedError}</p>
        </div>
      {:else if longReadEvents.length === 0}
        <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-6 text-center">
          <p class="text-lg font-semibold text-text-soft">No long reads yet</p>
          <p class="mt-2 text-sm text-text-muted">
            We'll surface longer posts here as they appear.
          </p>
        </div>
      {:else}
        {#each longReadEvents as event (event.id)}
          <LongReadPreview
            event={event}
            onSelect={handleEventSelect}
            onProfileSelect={handleProfileSelect}
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
