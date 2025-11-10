<script lang="ts">
  import { onMount } from 'svelte'
  import { feedEvents, feedLoading, feedError } from '$stores/feed'
  import { feedSource } from '$stores/feedSource'
  import type { NostrEvent } from '$types/nostr'
  import Skeleton from '../Skeleton.svelte'
  import LongReadPreview from '../LongReadPreview.svelte'
  import { openPost, openProfile } from '$stores/router'

  // Filter for kind 30023 (long-form) events only
  let longReadEvents: NostrEvent[] = []
  $: longReadEvents = $feedEvents.filter(event => event.kind === 30023)

  onMount(() => {
    feedSource.set('long-reads')
  })

  function handleEventSelect(event: NostrEvent) {
    openPost(event, 'long-reads')
  }

  function handleProfileSelect(pubkey: string) {
    openProfile(pubkey, 'long-reads')
  }
</script>

<div class="w-full pb-24 md:pb-0">
  <div class="sticky top-0 z-20 border-b border-dark-border/60 bg-dark/50 backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-dark/30">
    <div class="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 md:h-20 md:px-6">
      <div>
        <h1 class="text-lg font-semibold text-white md:text-xl">Long Reads</h1>
        <p class="text-xs text-text-muted md:text-sm">Deep dives and longer-form posts from your network</p>
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
