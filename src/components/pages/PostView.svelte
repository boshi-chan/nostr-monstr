<script lang="ts">
import { goBack, openPost, openProfile, openPostById } from '$stores/router'
import type { NavTab } from '$stores/nav'
import Post from '../Post.svelte'
  import Skeleton from '../Skeleton.svelte'
  import type { NostrEvent } from '$types/nostr'
  import { getEventById, fetchEventById } from '$lib/feed-ndk'
  import { subscribeToThread, type StreamingThreadContext } from '$lib/thread'
import { queueEngagementHydration } from '$lib/engagement'
  import { onDestroy } from 'svelte'

  export let eventId: string
  export let originTab: NavTab
  export let initialEvent: NostrEvent | undefined = undefined

  const REPLIES_BATCH_SIZE = 5

let clickedEvent: NostrEvent | null = initialEvent ?? null
let loadingMain = !initialEvent
let loadingReplies = false
let error: string | null = null

let ancestorChain: NostrEvent[] = []
let directReplies: NostrEvent[] = []
let visibleReplies = REPLIES_BATCH_SIZE
let lastLoadedEventId: string | null = null
let rootPost: NostrEvent | null = null
let unsubscribe: (() => void) | null = null

async function bootstrap(targetId: string): Promise<void> {
  // Clean up previous subscription
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }

  loadingMain = !clickedEvent
  loadingReplies = false // No longer block on replies

  try {
    let event: NostrEvent | null | undefined = clickedEvent
    if (!event) {
      event = getEventById(targetId) ?? null
      if (!event) {
        event = await fetchEventById(targetId)
      }
    }

    if (!event) {
      error = 'Post is no longer available.'
      return
    }

    clickedEvent = event
    loadingMain = false

    // Start streaming thread updates
    unsubscribe = subscribeToThread(event, (context: StreamingThreadContext) => {
      // Update immediately as data arrives
      ancestorChain = context.ancestors
      directReplies = context.replies.sort((a, b) => a.created_at - b.created_at)
      rootPost = context.rootPost
      visibleReplies = Math.min(REPLIES_BATCH_SIZE, directReplies.length)

      // Queue engagement hydration for new events
      const allIds = [
        event.id,
        ...context.ancestors.map(e => e.id),
        ...context.replies.map(e => e.id)
      ]
      if (context.rootPost) {
        allIds.push(context.rootPost.id)
      }
      queueEngagementHydration(allIds, true)
    })
  } catch (err) {
    console.error('Failed to load thread view', err)
    error = 'Unable to load this thread right now.'
  }
}

// Cleanup on component destroy
onDestroy(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})

$: if (eventId && eventId !== lastLoadedEventId) {
  const hadLoadedBefore = lastLoadedEventId !== null
  lastLoadedEventId = eventId

  if (hadLoadedBefore) {
    clickedEvent = null
    ancestorChain = []
    directReplies = []
    visibleReplies = REPLIES_BATCH_SIZE
    rootPost = null
  }

  error = null
  void bootstrap(eventId)
}

  function handleProfileSelect(pubkey: string) {
    openProfile(pubkey, originTab)
  }

  function handleThreadSelect(event: NostrEvent) {
    openPost(event, originTab)
  }

  function handleNavigateById(eventId: string) {
    openPostById(eventId, originTab)
  }
  
  function handleViewRootPost(): void {
    if (rootPost) {
      openPost(rootPost, originTab)
    }
  }

  function showMoreReplies(): void {
    visibleReplies = Math.min(visibleReplies + REPLIES_BATCH_SIZE, directReplies.length)
  }
</script>

<div class="flex h-full flex-col bg-transparent pb-6 md:pb-0">
  <header class="sticky top-0 z-10 flex items-center justify-between border-b border-dark-border/60 bg-dark/70 px-4 py-3 backdrop-blur-2xl md:px-6">
    <button
      type="button"
      class="rounded-xl border border-dark-border/60 px-3 py-1.5 text-sm font-medium text-text-soft transition-colors duration-200 hover:border-primary/60 hover:text-white focus:outline-none focus:ring-2 focus:ring-primary/40"
      on:click={goBack}
    >
      Back
    </button>
    <div class="flex flex-col items-center gap-1">
      <h1 class="text-base font-semibold text-white md:text-lg">Thread</h1>
      {#if ancestorChain.length > 0 || directReplies.length > 0}
        <p class="text-xs text-text-muted">
          {ancestorChain.length + 1 + directReplies.length} post{ancestorChain.length + directReplies.length === 0 ? '' : 's'}
        </p>
      {/if}
    </div>
    <div class="w-16" aria-hidden="true"></div>
  </header>

  <section class="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-3 pb-4 pt-3 md:px-6 md:pt-6">
    {#if error}
      <div class="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-6 text-center text-sm text-rose-200/90">
        {error}
      </div>
    {:else if loadingMain && !clickedEvent}
      <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
        <Skeleton count={5} height="h-4" />
      </div>
      <div class="mt-3 rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
        <Skeleton count={4} height="h-3" />
      </div>
    {:else if clickedEvent}
      <div class="space-y-6">
        {#if ancestorChain.length > 0}
          <div class="rounded-2xl border border-dark-border/50 bg-dark/40 p-3">
            <p class="text-[11px] uppercase tracking-[0.35em] text-text-muted/70">In reply to</p>
            <div class="mt-3 space-y-3">
              {#each ancestorChain as ancestor (ancestor.id)}
                <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-2">
                  <Post
                    event={ancestor}
                    showActions={true}
                    onSelect={handleThreadSelect}
                    onProfileSelect={handleProfileSelect}
                    onNavigateToEventId={handleNavigateById}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="rounded-2xl border border-primary/30 bg-dark/60 p-3">
          <Post
            event={clickedEvent}
            showActions={true}
            onSelect={handleThreadSelect}
            onProfileSelect={handleProfileSelect}
            onNavigateToEventId={handleNavigateById}
          />
        </div>

        {#if directReplies.length > 0}
          <div class="rounded-2xl border border-dark-border/60 bg-dark/50 p-3">
            <div class="flex items-center justify-between">
              <p class="text-[11px] uppercase tracking-[0.35em] text-text-muted/70">
                All Replies ({directReplies.length})
              </p>
              {#if rootPost && rootPost.id !== clickedEvent.id}
                <button
                  type="button"
                  class="text-xs text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded px-2 py-1"
                  on:click={handleViewRootPost}
                >
                  View root post
                </button>
              {/if}
            </div>
            <div class="mt-3 space-y-3">
              {#each directReplies.slice(0, visibleReplies) as reply (reply.id)}
                <Post
                  event={reply}
                  showActions={true}
                  onSelect={handleThreadSelect}
                  onProfileSelect={handleProfileSelect}
                  onNavigateToEventId={handleNavigateById}
                />
              {/each}
              {#if directReplies.length > visibleReplies}
                <button
                  type="button"
                  class="w-full rounded-xl border border-dark-border/60 px-4 py-2 text-sm font-semibold text-text-soft transition hover:border-primary/60 hover:text-white"
                  on:click={showMoreReplies}
                >
                  Show more replies
                </button>
              {/if}
            </div>
          </div>
        {:else if loadingReplies}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
            <Skeleton count={4} height="h-4" />
          </div>
        {:else if !loadingReplies && clickedEvent && directReplies.length === 0}
          <div class="rounded-2xl border border-dark-border/60 bg-dark/40 p-4 text-center text-xs text-text-muted/80">
            No replies yet.
          </div>
        {/if}
      </div>
    {:else}
      <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center text-sm text-rose-200/90">
        Post not found.
      </div>
    {/if}
  </section>
</div>

<style>
  section {
    scrollbar-width: thin;
  }
</style>
