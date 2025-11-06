<script lang="ts">
  import { onMount } from 'svelte'
  import { feedEvents } from '$stores/feed'
  import { goBack, openPost, openProfile, openPostById } from '$stores/router'
  import type { NavTab } from '$stores/nav'
  import Post from '../Post.svelte'
  import Skeleton from '../Skeleton.svelte'
  import type { NostrEvent } from '$types/nostr'
  import { buildThread, getEventById, fetchEventById } from '$lib/feed-ndk'
  import { parseContent } from '$lib/content'
  import { getNDK } from '$lib/ndk'
  import { get as getStore } from 'svelte/store'

  export let eventId: string
  export let originTab: NavTab
  export let initialEvent: NostrEvent | undefined = undefined

  let mainEvent: NostrEvent | null = initialEvent ?? null
  let loading = !mainEvent
  let error: string | null = null
  let repliesLoading = false

  let parents: NostrEvent[] = []
  let replies: NostrEvent[] = []
  let relatedEvents: NostrEvent[] = []
  let combinedEvents: NostrEvent[] = []

  $: if (mainEvent) {
    combinedEvents = dedupeEvents([$feedEvents, [mainEvent], relatedEvents])
  } else {
    combinedEvents = []
  }

  $: if (mainEvent) {
    const thread = buildThread(mainEvent, combinedEvents)
    const index = thread.findIndex(event => event.id === mainEvent?.id)
    if (index === -1) {
      parents = []
      replies = []
    } else {
      parents = thread.slice(0, index)
      replies = thread.slice(index + 1).sort((a, b) => a.created_at - b.created_at)
    }
  } else {
    parents = []
    replies = []
  }

  onMount(async () => {
    if (mainEvent) {
      loading = false
      await hydrateAncestors(mainEvent)
      await hydrateReplies(mainEvent)
      return
    }

    const cached = getEventById(eventId)
    if (cached) {
      mainEvent = cached
      loading = false
      await hydrateAncestors(cached)
      await hydrateReplies(cached)
      return
    }

    try {
      const fetched = await fetchEventById(eventId)
      if (fetched) {
        mainEvent = fetched
        await hydrateAncestors(fetched)
        await hydrateReplies(fetched)
      } else {
        error = 'Post is no longer available.'
      }
    } catch (err) {
      console.error('Failed to load post view', err)
      error = 'Unable to load this post right now.'
    } finally {
      loading = false
    }
  })

  function dedupeEvents(sourceGroups: NostrEvent[][]): NostrEvent[] {
    const map = new Map<string, NostrEvent>()
    for (const group of sourceGroups) {
      for (const event of group) {
        map.set(event.id, event)
      }
    }
    return Array.from(map.values())
  }

  async function hydrateReplies(event: NostrEvent): Promise<void> {
    try {
      repliesLoading = true
      const ndk = getNDK()
      const result = (await ndk.fetchEvents(
        { kinds: [1], '#e': [event.id], limit: 60 },
        { closeOnEose: true }
      )) as Set<any>

      const fetched = Array.from(result)
        .map(item => item.rawEvent?.() ?? item)
        .filter(Boolean) as NostrEvent[]

      if (fetched.length > 0) {
        relatedEvents = dedupeEvents([relatedEvents, fetched])
      }
    } catch (err) {
      console.warn('Unable to hydrate replies for post view', err)
    } finally {
      repliesLoading = false
    }
  }

  async function hydrateAncestors(event: NostrEvent): Promise<void> {
    const collected: NostrEvent[] = []
    const visited = new Set<string>()
    let current: NostrEvent | null = event

    while (current) {
      const parsed = parseContent(current)
      const parentId = parsed.replyToId ?? null
      if (!parentId || visited.has(parentId)) {
        break
      }

      visited.add(parentId)

      let parent = getEventById(parentId)
      if (!parent) {
        const available = getStore(feedEvents).find(item => item.id === parentId)
        parent = available
      }
      if (!parent) {
        try {
          parent = await fetchEventById(parentId) ?? undefined
        } catch (err) {
          console.warn('Unable to fetch ancestor event', err)
        }
      }

      if (!parent) {
        break
      }

      collected.push(parent)
      current = parent
    }

    if (collected.length > 0) {
      relatedEvents = dedupeEvents([relatedEvents, collected])
    }
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
    <h1 class="text-base font-semibold text-white md:text-lg">Post</h1>
    <div class="w-16" aria-hidden="true"></div>
  </header>

  <section class="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-3 pb-4 pt-3 md:px-6 md:pt-6">
    {#if loading}
      <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
        <Skeleton count={5} height="h-4" />
      </div>
      <div class="mt-3 rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
        <Skeleton count={4} height="h-3" />
      </div>
    {:else if error}
      <div class="rounded-2xl border border-rose-500/50 bg-rose-500/10 p-6 text-center text-sm text-rose-200/90">
        {error}
      </div>
    {:else if mainEvent}
      <div class="space-y-4">
        {#if parents.length > 0}
          <div class="space-y-3">
            <p class="px-2 text-xs uppercase tracking-[0.2em] text-text-tertiary">In reply to</p>
            {#each parents as parent (parent.id)}
              <Post
                event={parent}
                onSelect={handleThreadSelect}
                onProfileSelect={handleProfileSelect}
                onNavigateToEventId={handleNavigateById}
                showActions={false}
              />
            {/each}
            <div class="px-2 text-xs text-text-muted">Latest reply</div>
          </div>
        {/if}

        <Post
          event={mainEvent}
          showActions
          onSelect={handleThreadSelect}
          onProfileSelect={handleProfileSelect}
          onNavigateToEventId={handleNavigateById}
        />

        <div class="space-y-3 rounded-2xl border border-dark-border/70 bg-dark/60 p-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-white md:text-base">Replies</h2>
            {#if repliesLoading}
              <span class="text-xs text-text-muted">Refreshing...</span>
            {:else if replies.length > 0}
              <span class="text-xs text-text-muted">{replies.length} reply{replies.length === 1 ? '' : 'ies'}</span>
            {/if}
          </div>

          {#if replies.length === 0}
            <div class="rounded-xl border border-dashed border-dark-border/60 bg-dark/40 p-5 text-center text-sm text-text-tertiary">
              No replies yet. Start the conversation!
            </div>
          {:else}
            <div class="space-y-3">
              {#each replies as reply (reply.id)}
                <Post
                  event={reply}
                  onSelect={handleThreadSelect}
                  onProfileSelect={handleProfileSelect}
                  onNavigateToEventId={handleNavigateById}
                />
              {/each}
            </div>
          {/if}
        </div>
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

