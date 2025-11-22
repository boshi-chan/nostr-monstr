<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { get } from 'svelte/store'
  import { feedSource, lastLivestreamFeed, type LivestreamFeed } from '$stores/feedSource'
  import { getNDK, getCurrentNDKUser } from '$lib/ndk'
  import { following } from '$stores/feed'
  import type { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk'
  import LiveStreamCard from '../LiveStreamCard.svelte'
  import LiveStreamPlayer from '../LiveStreamPlayer.svelte'

  let activeFeed: LivestreamFeed = 'livestreams-global'
  let livestreams: NDKEvent[] = []
  let loading = true
  let error: string | null = null
  let subscription: NDKSubscription | null = null
  let subscriptionExtra: NDKSubscription | null = null
  let playerEvent: NDKEvent | null = null
  let playerContainer: HTMLDivElement | null = null

  $: lastLivestreamFeed.set(activeFeed)

  const EXTRA_RELAYS = [
    'wss://relay.damus.io',
    'wss://eden.nostr.land',
    'wss://nostr.wine',
    'wss://nos.lol',
    'wss://relay.current.fyi',
    'wss://nostr.oxtr.dev',
  ]

  function handleLivestreamEvent(event: NDKEvent) {
    const status = event.tagValue('status')
    const key = event.tagValue('d') || event.id
    const existingIndex = livestreams.findIndex(e => (e.tagValue('d') || e.id) === key)

    if (status !== 'live') {
      if (existingIndex >= 0) {
        livestreams = [...livestreams.slice(0, existingIndex), ...livestreams.slice(existingIndex + 1)]
      }
      return
    }

    const hasLaunchTarget = Boolean(event.tagValue('streaming') || event.tagValue('d'))
    if (!hasLaunchTarget) return

    if (existingIndex >= 0) {
      livestreams[existingIndex] = event
      livestreams = [...livestreams].sort(sortByViewersThenStarts)
    } else {
      livestreams = [event, ...livestreams].sort(sortByViewersThenStarts)
    }
  }

  function sortByViewersThenStarts(a: NDKEvent, b: NDKEvent): number {
    const viewA = parseInt(a.tagValue('current_participants') || '0')
    const viewB = parseInt(b.tagValue('current_participants') || '0')
    if (viewA !== viewB) return viewB - viewA
    const aStarts = parseInt(a.tagValue('starts') || '0')
    const bStarts = parseInt(b.tagValue('starts') || '0')
    return bStarts - aStarts
  }

  async function loadLivestreams() {
    loading = true
    error = null
    livestreams = []

    // Clean up previous subscription
    if (subscription) {
      subscription.stop()
      subscription = null
    }
    if (subscriptionExtra) {
      subscriptionExtra.stop()
      subscriptionExtra = null
    }

    try {
      const ndk = getNDK()
      if (!ndk) {
        throw new Error('NDK not initialized')
      }

      const currentUser = getCurrentNDKUser()
      const followingSet = get(following)

      let filter: NDKFilter = {
        kinds: [30311 as any], // NIP-53 Live Event
        limit: 50,
        since: Math.floor(Date.now() / 1000) - 6 * 60 * 60, // last 6h to avoid stale events
      }

      subscription = ndk.subscribe(filter, { closeOnEose: false })
      subscription.on('event', handleLivestreamEvent)
      subscription.on('eose', () => {
        loading = false
      })

      // Extra relay fan-out to catch missing live events
      subscriptionExtra = ndk.subscribe(filter, { closeOnEose: false, relays: EXTRA_RELAYS })
      subscriptionExtra.on('event', handleLivestreamEvent)

      // Set a timeout in case EOSE never arrives
      setTimeout(() => {
        if (loading) {
          loading = false
        }
      }, 5000)

    } catch (err) {
      console.error('[LiveStreams] Error loading livestreams:', err)
      error = err instanceof Error ? err.message : 'Failed to load livestreams'
      loading = false
    }
  }

  onMount(() => {
    void loadLivestreams()
  })

  function handleOpenPlayer(event: NDKEvent) {
    playerEvent = event
  }

  function handleClosePlayer() {
    playerEvent = null
  }

  $: if (playerEvent && playerContainer) {
    playerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  onDestroy(() => {
    if (subscription) {
      subscription.stop()
      subscription = null
    }
    if (subscriptionExtra) {
      subscriptionExtra.stop()
      subscriptionExtra = null
    }
  })
</script>

<div class="w-full pb-24 md:pb-0">

  <div class="mx-auto w-full max-w-6xl px-3 md:px-6">
    {#if playerEvent}
      <div class="mt-4" bind:this={playerContainer}>
        {#key playerEvent.id}
          <LiveStreamPlayer event={playerEvent} onClose={handleClosePlayer} />
        {/key}
      </div>
    {/if}

    <div class="flex flex-col gap-3 pt-3">
      {#if loading}
        <!-- Show friendly loading state -->
        <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-8 text-center">
          <div class="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p class="text-lg font-semibold text-text-soft">Finding livestreams...</p>
          <p class="mt-2 text-sm text-text-muted">Loading livestreams from the global feed</p>
        </div>
      {:else if error}
        <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <p class="text-lg font-semibold text-rose-100">Unable to load livestreams</p>
          <p class="mt-2 text-sm text-rose-200/80">{error}</p>
        </div>
      {:else if livestreams.length === 0}
        <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-6 text-center">
          <p class="text-lg font-semibold text-text-soft">No live streams</p>
          <p class="mt-2 text-sm text-text-muted">No active livestreams found</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each livestreams as livestream (livestream.id)}
            <LiveStreamCard event={livestream} onOpenPlayer={handleOpenPlayer} />
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
<style>
  :global(main) {
    padding-bottom: 0;
  }
</style>
