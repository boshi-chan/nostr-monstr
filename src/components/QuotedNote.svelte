<script lang="ts">
  import { feedEvents, metadataCache } from '$stores/feed'
  import { formatDate } from '$lib/utils'
  import { getNDK } from '$lib/ndk'
  import { getDisplayName, getAvatarUrl, getNip05Display } from '$lib/metadata'
  import type { NostrEvent } from '$types/nostr'
  import type { UserMetadata } from '$types/user'
  import CommentIcon from './icons/CommentIcon.svelte'
  import RepostIcon from './icons/RepostIcon.svelte'
  import LikeIcon from './icons/LikeIcon.svelte'
  import { isUserMuted } from '$lib/mute'
  import { logger } from '$lib/logger'

  export let eventId: string | null = null
  export let eventData: NostrEvent | null = null
  export let onSelect: ((event: NostrEvent) => void) | undefined = undefined
  export let onOpen: ((eventId: string) => void) | undefined = undefined

  const ndk = getNDK()
  let remoteEvent: NostrEvent | null = null
  let loading = false
  let showMutedContent = false

  $: storeEvent = eventId ? $feedEvents.find(e => e.id === eventId) ?? null : null
  $: quotedEvent = eventData ?? storeEvent ?? remoteEvent
  $: if (!quotedEvent && !loading && eventId) {
    loading = true
    void fetchQuotedEvent(eventId)
  }

  let metadata: UserMetadata | undefined
  $: metadata = quotedEvent ? $metadataCache.get(quotedEvent.pubkey) : undefined
  $: displayName = quotedEvent ? getDisplayName(quotedEvent.pubkey, metadata) : ''
  $: avatarUrl = getAvatarUrl(metadata)
  $: nip05 = getNip05Display(metadata?.nip05)
  $: displayLabel = displayName || quotedEvent?.pubkey.slice(0, 8) || ''
  $: initials = displayLabel.slice(0, 2).toUpperCase()
  $: formattedTime = quotedEvent ? formatDate(quotedEvent.created_at) : ''
  $: isMuted = quotedEvent ? isUserMuted(quotedEvent.pubkey) : false

  async function fetchQuotedEvent(id: string): Promise<void> {
    try {
      const results = (await ndk.fetchEvents(
        { ids: [id], limit: 1 },
        { closeOnEose: true }
      )) as Set<any>

      for (const ndkEvent of results) {
        remoteEvent = ndkEvent.rawEvent() as NostrEvent
        break
      }
    } catch (err) {
      logger.warn('Failed to fetch quoted note', err)
    } finally {
      loading = false
    }
  }

  function handleSelect(domEvent: MouseEvent | KeyboardEvent) {
    domEvent.stopPropagation()
    if (quotedEvent) {
      onSelect?.(quotedEvent)
      onOpen?.(quotedEvent.id)
      return
    }

    if (eventId) {
      onOpen?.(eventId)
    }
  }
</script>

{#if quotedEvent && isMuted && !showMutedContent}
  <div class="mt-3 rounded-xl border border-dark-border/60 bg-dark-light/40 p-4">
    <p class="text-sm text-text-muted mb-2">Quoted content from muted user</p>
    <button
      type="button"
      class="text-xs text-primary hover:underline focus:outline-none"
      on:click|stopPropagation={() => showMutedContent = true}
    >
      Click to view
    </button>
  </div>
{:else if quotedEvent}
  <div
    role="button"
    tabindex="0"
    class="mt-3 rounded-xl border border-dark-border/70 bg-dark-lighter/50 p-4 text-left transition-all duration-200 hover:border-primary/50 hover:bg-dark-lighter/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
    on:click={handleSelect}
    on:keydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleSelect(event)
      }
    }}
  >
    <!-- Header Row -->
    <div class="flex items-start gap-3">
      <!-- Avatar -->
      <div class="flex-shrink-0">
        {#if avatarUrl}
          <img src={avatarUrl} alt={displayLabel} class="h-10 w-10 rounded-full object-cover" />
        {:else}
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
            {initials}
          </div>
        {/if}
      </div>

      <!-- User info -->
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-text-soft text-sm truncate">{displayLabel}</span>
          {#if nip05}
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-text-muted truncate">@{nip05}</span>
              <svg class="h-3.5 w-3.5 text-primary/80 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-label="Verified">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
              </svg>
            </div>
          {/if}
          <span class="text-xs text-text-muted">· {formattedTime}</span>
        </div>

        <!-- Content -->
        <p class="mt-2 line-clamp-3 break-words text-sm text-text-soft/90">
          {quotedEvent.content}
        </p>

        <!-- Muted engagement bar -->
        <div class="mt-3 flex items-center gap-4 text-xs text-text-muted/60">
          <span class="flex items-center gap-1.5">
            <CommentIcon size={14} color="currentColor" strokeWidth={1.5} />
          </span>
          <span class="flex items-center gap-1.5">
            <RepostIcon size={14} color="currentColor" strokeWidth={1.5} />
          </span>
          <span class="flex items-center gap-1.5">
            <LikeIcon size={14} color="currentColor" strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </div>
  </div>
{:else if loading}
  <div class="mt-3 rounded-xl border border-dark-border/60 bg-dark-lighter/50 p-4 text-sm text-text-muted/70">
    Loading quoted note...
  </div>
{:else}
  <div class="mt-3 rounded-xl border border-dark-border/60 bg-dark-lighter/50 p-4 text-sm text-text-muted">
    Quoted note not found
  </div>
{/if}

<style>
  :global(.line-clamp-2) {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    overflow: hidden;
  }

  :global(.line-clamp-3) {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    line-clamp: 3;
    overflow: hidden;
  }
</style>


