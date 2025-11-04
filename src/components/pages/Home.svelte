<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { currentUser } from '$stores/auth'
  import {
    feedEvents,
    isLoadingFeed,
    userContacts,
    contactsOfContacts,
    subscribeToGlobalFeed,
    subscribeToFollowingFeed,
    subscribeToCirclesFeed,
    subscribeToLongReads,
    stopAllSubscriptions,
    buildThread,
    getReplies,
    clearFeed,
  } from '$lib/feed-ndk'
  import { parseContent } from '$lib/content'
  import { formatDate } from '$lib/utils'
  import Skeleton from '../Skeleton.svelte'
  import ThreadDetail from '../ThreadDetail.svelte'
  import UserProfile from '../UserProfile.svelte'
  import MediaRenderer from '../MediaRenderer.svelte'
  import QuotedNote from '../QuotedNote.svelte'
  import HeartIcon from '../icons/HeartIcon.svelte'
  import MessageCircleIcon from '../icons/MessageCircleIcon.svelte'
  import Repeat2Icon from '../icons/Repeat2Icon.svelte'
  import ZapIcon from '../icons/ZapIcon.svelte'
  import FlameIcon from '../icons/FlameIcon.svelte'
  import UsersIcon from '../icons/UsersIcon.svelte'
  import CircleIcon from '../icons/CircleIcon.svelte'
  import GlobeIcon from '../icons/GlobeIcon.svelte'
  import BookOpenIcon from '../icons/BookOpenIcon.svelte'
  import type { NostrEvent } from '$types/nostr'

  type FeedTab = 'following' | 'circles' | 'global' | 'long-reads'

  const feedTabs: { id: FeedTab; label: string; icon: any }[] = [
    { id: 'following', label: 'Following', icon: UsersIcon },
    { id: 'circles', label: 'Circles', icon: CircleIcon },
    { id: 'global', label: 'Global', icon: GlobeIcon },
    { id: 'long-reads', label: 'Long Reads', icon: BookOpenIcon },
  ]

  let selectedEvent: NostrEvent | null = null
  let selectedThread: NostrEvent[] = []
  let showThreadDetail = false
  let activeFeed: FeedTab = 'global'
  let userPubkey: string | null = null

  // Subscribe to currentUser to get pubkey
  $: if ($currentUser?.pubkey) {
    userPubkey = $currentUser.pubkey
    console.log('👤 User pubkey updated:', userPubkey.slice(0, 8))
  }

  // Client-side filtering function
  function filterAndSort(
    events: NostrEvent[],
    tab: FeedTab,
    contacts: Set<string>,
    circles: Set<string>
  ): NostrEvent[] {
    let filtered: NostrEvent[]

    switch (tab) {
      case 'following':
        filtered = events.filter(e => contacts.has(e.pubkey))
        console.log(`🔍 Following filter: ${filtered.length}/${events.length} events from contacts`)
        break
      case 'circles':
        filtered = events.filter(e => !contacts.has(e.pubkey) && circles.has(e.pubkey))
        console.log(`🔍 Circles filter: ${filtered.length}/${events.length} events from circles`)
        break
      case 'long-reads':
        filtered = events.filter(e => e.kind === 30023)
        console.log(`🔍 Long-reads filter: ${filtered.length}/${events.length} events (kind 30023)`)
        break
      case 'global':
      default:
        filtered = events
        console.log(`🔍 Global filter: ${filtered.length} total events`)
        break
    }

    // Deduplicate by event ID (in case of any race conditions)
    const seen = new Set<string>()
    const unique = filtered.filter(e => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })

    // Sort by timestamp (newest first)
    return unique.sort((a, b) => b.created_at - a.created_at)
  }

  // Reactive filtering - automatically updates when feedEvents, activeFeed, or contacts change
  $: filteredFeedEvents = filterAndSort($feedEvents, activeFeed, $userContacts, $contactsOfContacts)

  onMount(() => {
    console.log('═══════════════════════════════════════')
    console.log('📌 HOME.SVELTE MOUNTED')
    console.log('═══════════════════════════════════════')
    // Start with global feed
    subscribeToGlobalFeed()
  })

  onDestroy(() => {
    console.log('📌 Home.svelte unmounting - stopping subscriptions')
    // Cleanup subscriptions when component unmounts
    stopAllSubscriptions()
  })

  function handleTabClick(tab: FeedTab) {
    console.log('═══════════════════════════════════════')
    console.log('🔄 FEED TAB CLICKED:', tab)
    console.log('👤 Current user pubkey:', userPubkey?.slice(0, 8) || 'NONE')
    console.log('═══════════════════════════════════════')

    // Stop all previous subscriptions
    console.log('⏹️ Stopping all subscriptions')
    stopAllSubscriptions()

    // Clear previous feed events
    console.log('🧹 Clearing feed')
    clearFeed()

    // Update active tab
    activeFeed = tab
    console.log('✅ Active feed updated to:', activeFeed)

    // Subscribe to new feed
    switch (tab) {
      case 'following':
        if (userPubkey) {
          console.log('👉 Subscribing to FOLLOWING feed for:', userPubkey.slice(0, 8))
          subscribeToFollowingFeed(userPubkey)
        } else {
          console.warn('⚠️ No user logged in for following feed - showing global')
          subscribeToGlobalFeed()
        }
        break
      case 'circles':
        if (userPubkey) {
          console.log('👉 Subscribing to CIRCLES feed for:', userPubkey.slice(0, 8))
          subscribeToCirclesFeed(userPubkey)
        } else {
          console.warn('⚠️ No user logged in for circles feed - showing global')
          subscribeToGlobalFeed()
        }
        break
      case 'long-reads':
        if (userPubkey) {
          console.log('👉 Subscribing to LONG-READS feed for:', userPubkey.slice(0, 8))
          subscribeToLongReads(userPubkey)
        } else {
          console.warn('⚠️ No user logged in for long-reads feed - showing global')
          subscribeToLongReads()
        }
        break
      case 'global':
      default:
        console.log('👉 Subscribing to GLOBAL feed')
        subscribeToGlobalFeed()
        break
    }
    console.log('═══════════════════════════════════════')
  }

  function handleEventClick(event: NostrEvent) {
    selectedEvent = event
    selectedThread = buildThread(event, $feedEvents)
    showThreadDetail = true
  }

  function handleCloseThread() {
    showThreadDetail = false
    selectedEvent = null
    selectedThread = []
  }

  function getReplyCount(eventId: string): number {
    return getReplies(eventId, $feedEvents).length
  }
</script>

<div class="w-full pb-24 md:pb-0">
  <!-- DEBUG INFO (remove in production) -->
  <div class="bg-dark-lighter/50 border-b border-dark-border px-4 py-2 text-xs text-text-muted">
    <div>🔍 DEBUG: activeFeed={activeFeed} | userPubkey={userPubkey?.slice(0, 8) || 'NONE'} | events={$feedEvents.length} | loading={$isLoadingFeed}</div>
  </div>

  <!-- Feed tabs -->
  <div class="sticky top-0 z-20 border-b border-dark-border bg-dark-light backdrop-blur-xl">
    <div class="flex gap-0 overflow-x-auto w-full">
      {#each feedTabs as tab (tab.id)}
        {@const isActive = activeFeed === tab.id}
        <button
          type="button"
          style="flex: 1;"
          on:click={() => {
            console.log('🖱️ BUTTON CLICKED - tab:', tab.id)
            handleTabClick(tab.id)
          }}
          class="flex items-center justify-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 {isActive ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-text-muted hover:text-text-soft hover:bg-dark-lighter/50'}"
        >
          <svelte:component this={tab.icon} size={16} />
          <span class="hidden md:inline">{tab.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Feed content -->
  <div class="w-full">
    <div class="max-w-4xl mx-auto px-4 md:px-6 pt-4 pb-6">
    {#if $isLoadingFeed && filteredFeedEvents.length === 0}
      <div class="p-4 md:p-0">
        <Skeleton count={5} height="h-32" />
      </div>
    {:else if filteredFeedEvents.length === 0}
      <div class="flex h-full items-center justify-center text-text-muted">
        <div class="text-center space-y-2">
          <p class="text-lg font-semibold text-text-soft">No posts yet</p>
          <p class="text-sm">
            {activeFeed === 'following' ? 'Follow users to see their posts' : 'Check back soon'}
          </p>
        </div>
      </div>
    {:else}
      <div class="space-y-3 pb-6">
        {#each filteredFeedEvents as event (event.id)}
          {@const parsed = parseContent(event)}
          {@const isRepost = event.kind === 6 || event.kind === 16}
          <div
            role="button"
            tabindex="0"
            on:click={() => handleEventClick(event)}
            on:keydown={(e) => e.key === 'Enter' && handleEventClick(event)}
            class="surface-card"
          >
            <!-- Header -->
            <div class="p-6 pb-3">
              <!-- Repost indicator -->
              {#if isRepost}
                <div class="mb-3 flex items-center gap-2 text-sm text-text-muted">
                  <Repeat2Icon size={14} />
                  <span>Reposted</span>
                </div>
              {/if}

              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-3 flex-1 min-w-0">
                  <!-- Avatar -->
                  <div class="flex-shrink-0">
                    <UserProfile pubkey={event.pubkey} size="md" />
                  </div>

                  <!-- User info -->
                  <div class="flex-1 min-w-0">
                    <UserProfile pubkey={event.pubkey} size="sm" />
                  </div>
                </div>

                <!-- Timestamp -->
                <div class="text-xs text-text-muted whitespace-nowrap">
                  {formatDate(event.created_at)}
                </div>
              </div>
            </div>

            <!-- Content -->
            <div class="px-6 pb-3 space-y-2.5">
              <div class="text-xs text-text-muted mb-2">
                {event.pubkey.slice(0, 8)}...
              </div>
              <p class="break-words text-sm leading-normal text-text-soft whitespace-pre-wrap">{parsed.text}</p>

              <!-- Media -->
              {#if parsed.images.length > 0 || parsed.videos.length > 0 || parsed.embeds.length > 0}
                <MediaRenderer
                  images={parsed.images}
                  videos={parsed.videos}
                  embeds={parsed.embeds}
                />
              {/if}

              <!-- Quoted note -->
              {#each parsed.quotes as quoteId (quoteId)}
                <QuotedNote eventId={quoteId} />
              {/each}

              <!-- Interaction buttons -->
              <div class="flex items-center gap-1 pt-2 border-t border-dark-border/50">
                <button
                  class="inline-flex items-center gap-2 text-text-muted hover:text-red-500 hover:bg-transparent transition-colors px-3 py-2 rounded-md text-sm"
                  title="Like"
                >
                  <HeartIcon size={16} />
                  <span class="text-xs hidden sm:inline-block">0</span>
                </button>
                <button
                  class="inline-flex items-center gap-2 text-text-muted hover:text-primary hover:bg-transparent transition-colors px-3 py-2 rounded-md text-sm"
                  on:click|stopPropagation={() => handleEventClick(event)}
                  title="Reply"
                >
                  <MessageCircleIcon size={16} />
                  <span class="text-xs hidden sm:inline">{getReplyCount(event.id)}</span>
                </button>
                <button
                  class="inline-flex items-center gap-2 text-text-muted hover:text-green-500 hover:bg-transparent transition-colors px-3 py-2 rounded-md text-sm"
                  title="Repost"
                >
                  <Repeat2Icon size={16} />
                  <span class="text-xs hidden sm:inline">0</span>
                </button>
                <button
                  class="inline-flex items-center gap-2 text-text-muted hover:text-primary hover:bg-transparent transition-colors px-3 py-2 rounded-md text-sm"
                  title="Zap"
                >
                  <ZapIcon size={16} />
                </button>
                <button
                  class="inline-flex items-center gap-2 text-text-muted hover:text-primary hover:bg-transparent transition-colors px-3 py-2 rounded-md text-sm"
                  title="Ember"
                >
                  <FlameIcon size={16} />
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
    </div>
  </div>
</div>

<!-- Thread Detail Modal -->
{#if showThreadDetail && selectedEvent}
  <ThreadDetail event={selectedEvent} thread={selectedThread} on:close={handleCloseThread} />
{/if}

<style>
  :global(main) {
    padding-bottom: 0;
  }
</style>
