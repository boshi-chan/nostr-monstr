<script lang="ts">
  import {
    activeFeedTab,
    feedEvents,
    feedLoading,
    feedError,
    type FeedTab,
  } from '$stores/feed'

  import { feedSource } from '$stores/feedSource'

  import type { NostrEvent } from '$types/nostr'
  import ThreadDetail from '../ThreadDetail.svelte'
  import Post from '../Post.svelte'
  import Skeleton from '../Skeleton.svelte'
  import UsersIcon from '../icons/UsersIcon.svelte'
  import CircleIcon from '../icons/CircleIcon.svelte'
  import GlobeIcon from '../icons/GlobeIcon.svelte'
  import BookOpenIcon from '../icons/BookOpenIcon.svelte'

  const feedTabs: { id: FeedTab; label: string; icon: typeof UsersIcon }[] = [
    { id: 'following', label: 'Following', icon: UsersIcon },
    { id: 'circles', label: 'Circles', icon: CircleIcon },
    { id: 'global', label: 'Global', icon: GlobeIcon },
    { id: 'long-reads', label: 'Long Reads', icon: BookOpenIcon },
  ]

  let activeFeed: FeedTab = 'global'
  let selectedEvent: NostrEvent | null = null
  let selectedThread: NostrEvent[] = []
  let showThreadDetail = false
  $: activeFeed = $activeFeedTab

  function setActiveFeed(tab: FeedTab) {
    activeFeedTab.set(tab)

    if (tab === 'global') feedSource.set('global')
    if (tab === 'following') feedSource.set('following')
    if (tab === 'circles') feedSource.set('circles')
    if (tab === 'long-reads') feedSource.set('long-reads')

    selectedEvent = null
    selectedThread = []
    showThreadDetail = false
  }

  import { buildThread, getReplies } from '$lib/feed-ndk'

  function handleEventSelect(event: NostrEvent) {
    selectedEvent = event
    selectedThread = buildThread(event, $feedEvents)
    showThreadDetail = true
  }

  function handleCloseThread() {
    showThreadDetail = false
    selectedEvent = null
    selectedThread = []
  }

  function handleGetReplyCount(eventId: string): number {
    return getReplies(eventId, $feedEvents).length
  }
</script>

<div class="w-full pb-24 md:pb-0">
  <div class="sticky top-0 z-20 border-b border-dark-border bg-dark-light backdrop-blur-xl">
    <div class="flex h-16 md:h-20 w-full items-stretch gap-0 overflow-x-auto">
      {#each feedTabs as tab (tab.id)}
        {@const isActive = activeFeed === tab.id}
        <button
          type="button"
          style="flex: 1;"
          class="flex-1 h-full flex items-center justify-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 {isActive ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-text-muted hover:text-text-soft hover:bg-dark-lighter/50'}"
          on:click={() => setActiveFeed(tab.id)}
        >
          <svelte:component this={tab.icon} size={16} />
          <span class="hidden md:inline">{tab.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="mx-auto w-full max-w-3xl px-3 md:px-6">
    <div class="rounded-2xl border border-dark-border/60 bg-dark/60 overflow-hidden">
      {#if $feedLoading && $feedEvents.length === 0}
        <div class="divide-y divide-dark-border">
          {#each Array(5) as _}
            <Skeleton />
          {/each}
        </div>
      {:else if $feedError && $feedEvents.length === 0}
        <div class="flex items-center justify-center py-12 px-4 text-center">
          <div>
            <p class="text-lg font-semibold text-text-soft">Feed unavailable</p>
            <p class="mt-2 text-sm text-text-muted">{$feedError}</p>
          </div>
        </div>
      {:else if $feedEvents.length === 0}
        <div class="flex items-center justify-center py-12 px-4 text-center">
          <div>
            <p class="text-lg font-semibold text-text-soft">No posts yet</p>
            <p class="mt-2 text-sm text-text-muted">
              {activeFeed === 'following'
                ? 'Follow someone to see their posts'
                : 'Check back in a moment'}
            </p>
          </div>
        </div>
      {:else}
        <div class="divide-y divide-dark-border">
          {#each $feedEvents as event (event.id)}
            <Post
              {event}
              onSelect={handleEventSelect}
              replyCount={handleGetReplyCount(event.id)}
            />
          {/each}

          {#if $feedLoading}
            <div class="flex items-center justify-center py-4">
              <div class="text-sm text-text-muted">Loading more...</div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

{#if showThreadDetail && selectedEvent}
  <ThreadDetail event={selectedEvent} thread={selectedThread} on:close={handleCloseThread} />
{/if}

<style>
  :global(main) {
    padding-bottom: 0;
  }
</style>

