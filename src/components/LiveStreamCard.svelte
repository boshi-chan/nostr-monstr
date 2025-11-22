<script lang="ts">
  import type { NDKEvent } from '@nostr-dev-kit/ndk'
  import { metadataCache } from '$stores/feed'
  import { getDisplayName, getAvatarUrl, fetchUserMetadata } from '$lib/metadata'
  import { onMount } from 'svelte'

  export let event: NDKEvent
  export let onOpenPlayer: (event: NDKEvent) => void

  let title = ''
  let summary = ''
  let image = ''
  let streaming = ''
  let hasLaunchTarget = false
  let status = ''
  let userMetadata: any = null
  let streamerPubkey = ''
  let displayName = ''
  let avatar = ''
  let previewImage = ''

  function resolveStreamerPubkey(evt: NDKEvent): string {
    const pTag = Array.isArray(evt.tags)
      ? (evt.tags.find(tag => Array.isArray(tag) && tag[0] === 'p' && tag[1]) as string[] | undefined)
      : undefined
    return pTag?.[1] ?? evt.pubkey
  }

  $: {
    // Extract tags from the event
    title = event.tagValue('title') || 'Untitled Stream'
    summary = event.tagValue('summary') || ''
    const picture = event.tagValue('picture') || event.tagValue('thumbnail') || event.tagValue('thumb')
    image = event.tagValue('image') || picture || ''
    streaming = event.tagValue('streaming') || ''
    const dTag = event.tagValue('d')
    hasLaunchTarget = Boolean(streaming || dTag)
    status = event.tagValue('status') || ''

    streamerPubkey = resolveStreamerPubkey(event)
    userMetadata = $metadataCache.get(streamerPubkey)
    displayName = getDisplayName(streamerPubkey, userMetadata) || streamerPubkey.slice(0, 8)
    avatar = getAvatarUrl(streamerPubkey, userMetadata)
    previewImage = image || avatar || ''
  }

  onMount(() => {
    void fetchUserMetadata(streamerPubkey)
  })


  function formatViewerCount(count: number): string {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`
    }
    return count.toString()
  }

  // Extract viewer count if available (some implementations might include it)
  $: viewers = parseInt(event.tagValue('current_participants') || '0')

  function openStream() {
    if (!hasLaunchTarget) return
    onOpenPlayer(event)
  }
</script>

<!-- Compact Kick-style card -->
<button
  on:click={openStream}
  disabled={!hasLaunchTarget}
  class="group w-full text-left rounded-lg overflow-hidden hover:ring-2 hover:ring-primary/40 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
>
  <!-- Thumbnail with overlay info -->
  <div class="relative aspect-video w-full overflow-hidden bg-dark-lighter">
    {#if previewImage}
      <img
        src={previewImage}
        alt={title}
        class="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
      />
    {:else}
      <div class="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 via-dark to-dark-light text-white">
        <div class="flex items-center gap-3 px-4">
          <div class="h-10 w-10 rounded-full overflow-hidden bg-black/30 border border-white/20">
            {#if avatar}
              <img src={avatar} alt={displayName} class="h-full w-full object-cover" loading="lazy" />
            {:else}
              <div class="flex h-full w-full items-center justify-center text-sm font-semibold">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            {/if}
          </div>
          <div class="text-left">
            <p class="text-sm font-semibold line-clamp-2">{title}</p>
            <p class="text-xs text-white/70 line-clamp-1">{displayName}</p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Live badge (top left) -->
    {#if status === 'live'}
      <div class="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-lg">
        <span class="flex h-1.5 w-1.5">
          <span class="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-white opacity-75"></span>
          <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-white"></span>
        </span>
        LIVE
      </div>
    {/if}

    <!-- Viewer count (top right) -->
    {#if viewers > 0}
      <div class="absolute top-2 right-2 rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {formatViewerCount(viewers)} watching
      </div>
    {/if}

  </div>

  <!-- Compact info below thumbnail -->
  <div class="flex items-start gap-2 p-2 bg-dark/60">
    <!-- Small avatar -->
    <div class="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-dark-lighter">
      {#if avatar}
        <img src={avatar} alt={displayName} class="h-full w-full object-cover" loading="lazy" />
      {:else}
        <div class="flex h-full w-full items-center justify-center bg-primary/20 text-xs font-semibold text-primary">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
      {/if}
    </div>

    <!-- Title and author -->
    <div class="flex-1 min-w-0">
      <h3 class="text-sm font-semibold text-text-soft line-clamp-1 mb-0.5">
        {title}
      </h3>
      <p class="text-xs text-text-muted line-clamp-1">
        {displayName}
      </p>
      {#if summary}
        <p class="text-xs text-text-muted/80 line-clamp-1 mt-0.5">
          {summary}
        </p>
      {/if}
    </div>
  </div>
</button>

<style>
  .line-clamp-1 {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
