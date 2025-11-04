<script lang="ts">
  import { feedEvents } from '$stores/feed'
  import { formatDate } from '$lib/utils'
  import { getNDK } from '$lib/ndk'
  import type { NostrEvent } from '$types/nostr'
  import UserProfile from './UserProfile.svelte'

  export let eventId: string

  const ndk = getNDK()
  let remoteEvent: NostrEvent | null = null
  let loading = false

  $: storeEvent = $feedEvents.find(e => e.id === eventId) ?? null
  $: quotedEvent = storeEvent ?? remoteEvent
  $: if (!quotedEvent && !loading) {
    loading = true
    void fetchQuotedEvent()
  }

  async function fetchQuotedEvent(): Promise<void> {
    try {
      const results = (await ndk.fetchEvents(
        { ids: [eventId], limit: 1 },
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
</script>

{#if quotedEvent}
  <div class="mt-3 cursor-pointer rounded-2xl border border-dark-border bg-dark-lighter/70 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60">
    <div class="flex items-start gap-3">
      <div class="flex-1 min-w-0">
        <!-- Author -->
        <div class="mb-2">
          <UserProfile pubkey={quotedEvent.pubkey} size="sm" />
        </div>

        <!-- Content -->
        <p class="line-clamp-2 break-words text-sm text-text-soft/90">
          {quotedEvent.content}
        </p>

        <!-- Time -->
        <p class="mt-2 text-xs text-text-muted">
          {formatDate(quotedEvent.created_at)}
        </p>
      </div>
    </div>
  </div>
{:else}
  <div class="mt-3 rounded-2xl border border-dark-border bg-dark-lighter/70 p-4 text-sm text-text-muted">
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
