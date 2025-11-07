<script lang="ts">
  import { onMount } from 'svelte'
  import { goBack, openPost, openProfile, openPostById } from '$stores/router'
  import type { NavTab } from '$stores/nav'
  import Post from '../Post.svelte'
  import Skeleton from '../Skeleton.svelte'
  import type { NostrEvent } from '$types/nostr'
  import { getEventById, fetchEventById } from '$lib/feed-ndk'
  import { buildCompleteThread, getThreadStats, findEventNode, type ThreadContext } from '$lib/thread'

  export let eventId: string
  export let originTab: NavTab
  export let initialEvent: NostrEvent | undefined = undefined

  const REPLIES_BATCH_SIZE = 5

  let clickedEvent: NostrEvent | null = initialEvent ?? null
  let loading = !initialEvent
  let error: string | null = null

  let threadContext: ThreadContext | null = null
  let threadStats: ReturnType<typeof getThreadStats> | null = null
  let ancestorChain: NostrEvent[] = []
  let directReplies: NostrEvent[] = []
  let visibleReplies = REPLIES_BATCH_SIZE

  async function bootstrap(): Promise<void> {
    loading = true
    try {
      let event: NostrEvent | null | undefined = clickedEvent
      if (!event) {
        event = getEventById(eventId) ?? null
        if (!event) {
          event = await fetchEventById(eventId)
        }
      }

      if (!event) {
        error = 'Post is no longer available.'
        return
      }

      clickedEvent = event
      console.log('Building complete thread for event:', event.id.slice(0, 8))
      threadContext = await buildCompleteThread(event)
      console.log(`Thread loaded: ${threadContext.totalPostsInThread} posts`)
      hydrateThreadSlices(threadContext)
    } catch (err) {
      console.error('Failed to load thread view', err)
      error = 'Unable to load this thread right now.'
      hydrateThreadSlices(threadContext)
    } finally {
      loading = false
    }
  }

  onMount(() => {
    void bootstrap()
  })

  function handleProfileSelect(pubkey: string) {
    openProfile(pubkey, originTab)
  }

  function handleThreadSelect(event: NostrEvent) {
    openPost(event, originTab)
  }

  function handleNavigateById(eventId: string) {
    openPostById(eventId, originTab)
  }

  function hydrateThreadSlices(context: ThreadContext | null): void {
    if (!context) {
      ancestorChain = []
      directReplies = []
      threadStats = null
      visibleReplies = REPLIES_BATCH_SIZE
      return
    }
    threadStats = context.threadTree ? getThreadStats(context.threadTree) : null
    ancestorChain = (context.pathToMain ?? []).slice(0, -1)
    const node = findEventNode(context.threadTree, context.mainEvent.id)
    directReplies =
      node?.replies
        .map(reply => reply.event)
        .sort((a, b) => a.created_at - b.created_at) ?? []
    visibleReplies = directReplies.length ? Math.min(REPLIES_BATCH_SIZE, directReplies.length) : 0
  }

  function showMoreReplies(): void {
    visibleReplies = Math.min(visibleReplies + REPLIES_BATCH_SIZE, directReplies.length)
  }
</script>

<div class="flex h-full flex-col bg-transparent pb-24 md:pb-0">
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
      {#if threadStats}
        <p class="text-xs text-text-muted">
          {threadStats.totalEvents} post{threadStats.totalEvents === 1 ? '' : 's'}
          {#if threadStats.branchCount > 0}
            - {threadStats.branchCount} branch{threadStats.branchCount === 1 ? '' : 'es'}
          {/if}
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
    {:else if loading && !clickedEvent}
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
                Replies ({directReplies.length})
              </p>
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
        {:else if !loading && threadContext}
          <div class="rounded-2xl border border-dark-border/60 bg-dark/40 p-4 text-center text-xs text-text-muted/80">
            No replies yet.
          </div>
        {/if}

        {#if loading && !threadContext}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
            <Skeleton count={4} height="h-4" />
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

