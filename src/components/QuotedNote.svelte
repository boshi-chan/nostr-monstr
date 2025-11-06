<script lang="ts">
  import { feedEvents } from '$stores/feed'
  import { formatDate } from '$lib/utils'
  import { getNDK } from '$lib/ndk'
  import type { NostrEvent } from '$types/nostr'
  import UserProfile from './UserProfile.svelte'

  export let eventId: string | null = null
  export let eventData: NostrEvent | null = null
  export let onSelect: ((event: NostrEvent) => void) | undefined = undefined
  export let onOpen: ((eventId: string) => void) | undefined = undefined

  const ndk = getNDK()
  let remoteEvent: NostrEvent | null = null
  let loading = false

  $: storeEvent = eventId ? $feedEvents.find(e => e.id === eventId) ?? null : null
  $: quotedEvent = eventData ?? storeEvent ?? remoteEvent
  $: if (!quotedEvent && !loading && eventId) {
    loading = true
    void fetchQuotedEvent(eventId)
  }

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
      console.warn('Failed to fetch quoted note', err)
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

{#if quotedEvent}
  <div
    role="button"
    tabindex="0"
    class="mt-3 rounded-2xl border border-dark-border bg-dark-lighter/70 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-dark-lighter/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
    on:click={handleSelect}
    on:keydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleSelect(event)
      }
    }}
  >
    <p class="mb-3 text-[11px] font-medium uppercase tracking-[0.25em] text-text-tertiary/80">
      Quoted Note
    </p>
    <div class="flex items-start gap-3">
      <div class="flex-1 min-w-0 space-y-2">
        <UserProfile pubkey={quotedEvent.pubkey} size="sm" />
        <p class="line-clamp-2 break-words text-sm text-text-soft/90">
          {quotedEvent.content}
        </p>
        <p class="text-xs text-text-muted">
          {formatDate(quotedEvent.created_at)}
        </p>
      </div>
    </div>
  </div>
{:else if loading}
  <div class="mt-3 rounded-2xl border border-dark-border/60 bg-dark-lighter/60 p-4 text-sm text-text-muted/70">
    Loading quote...
  </div>
{:else}
  <div class="mt-3 rounded-2xl border border-dark-border/60 bg-dark-lighter/60 p-4 text-sm text-text-muted">
    Quote not found
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
</style>

