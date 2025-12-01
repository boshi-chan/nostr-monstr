<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { metadataCache, likedEvents } from '$stores/feed'
  import { feedFilters } from '$stores/feedFilters'
import { getDisplayName, getAvatarUrl, getNip05Display, fetchUserMetadata } from '$lib/metadata'
import { getNDK } from '$lib/ndk'
import { isReply, isRepostEvent, hasMedia } from '$lib/content'
import Post from '../Post.svelte'
import FollowButton from '../FollowButton.svelte'
import Skeleton from '../Skeleton.svelte'
import ProfileFilterBar from '../ProfileFilterBar.svelte'
import { logger } from '$lib/logger'
import { NDKRelaySet } from '@nostr-dev-kit/ndk'
import type { NostrEvent } from '$types/nostr'
import type { User } from '$types/user'
import type { UserMetadata } from '$types/user'
import { activeRoute, openPost, openProfile, goBack, navigateToPage } from '$stores/router'
import type { NavTab } from '$stores/nav'
import { activeConversation } from '$stores/messages'
import { loadConversation } from '$lib/messaging-simple'
import ChevronLeftIcon from 'lucide-svelte/icons/chevron-left'
import MailIcon from 'lucide-svelte/icons/mail'
import { queueEngagementHydration } from '$lib/engagement'

  export let pubkey: string | null = null
  export let originTab: NavTab | null = null

  const ndk = getNDK()
  const metadataRequested = new Set<string>()
  const linkRegex = /(https?:\/\/[^\s]+)/gi

  let authUser: User | null = null
  let targetPubkey: string | null = null
  let resolvedPubkey = ''
  let metadata: UserMetadata | undefined
  let displayName = 'Anon'
  let avatarUrl: string | null = null
  let bannerUrl: string | null = null
  let nip05: string | null = null
  let bioLines: string[] = []
  let isOwnProfile = false

  let loadingPosts = false
  let posts: NostrEvent[] = []
  let error: string | null = null
  let lastLoadedPubkey: string | null = null
// Filter posts based on profile mode
// Following AI_Guidelines: Avoid using $ syntax inside reactive statements
let profileMode: string = 'all'
  $: profileMode = $feedFilters.profileMode

  let likedEventsSet: Set<string> = new Set()
  $: likedEventsSet = $likedEvents

$: filteredPosts = posts.filter(event => {
    let passesMode = false
    switch (profileMode) {
      case 'all':
        passesMode = true
        break
      case 'replies':
        passesMode = isReply(event)
        break
      case 'media':
        passesMode = hasMedia(event)
        break
      case 'reposts':
        passesMode = isRepostEvent(event)
        break
      case 'likes':
        passesMode = likedEventsSet.has(event.id)
        break
      default:
        passesMode = true
    }

    return passesMode
  })

  $: authUser = $currentUser
  $: targetPubkey = pubkey ?? authUser?.pubkey ?? null
  $: isOwnProfile = !!authUser?.pubkey && targetPubkey === authUser.pubkey
  $: resolvedPubkey = targetPubkey ?? ''
  $: metadata = targetPubkey ? $metadataCache.get(targetPubkey) : undefined
  $: avatarUrl = getAvatarUrl(metadata) ?? (isOwnProfile ? authUser?.picture ?? null : null)
  $: bannerUrl = metadata?.banner || metadata?.cover || metadata?.picture_header || null
  $: nip05 = getNip05Display(metadata?.nip05) || (isOwnProfile ? authUser?.nip05 ?? null : null)
  $: displayName =
    targetPubkey
      ? getDisplayName(targetPubkey, metadata) ||
        (isOwnProfile ? authUser?.name ?? null : null) ||
        nip05 ||
        targetPubkey.slice(0, 8)
      : 'Anon'
  $: bioLines = (() => {
    const bio = metadata?.about || (isOwnProfile ? authUser?.about ?? '' : '')
    const lines = bio.split('\n')
    return lines.length === 1 && lines[0].trim().length === 0 ? [] : lines
  })()

  $: {
    const target = targetPubkey

    if (!target) {
      resetState(false)
      lastLoadedPubkey = null
    } else {
      if (!metadata && !metadataRequested.has(target)) {
        metadataRequested.add(target)
        void fetchUserMetadata(target)
      }

      if (lastLoadedPubkey !== target) {
        lastLoadedPubkey = target
        resetState(true)
        void loadStats(target)
        void loadPosts(target)
      }
    }
  }

  function resetState(setLoading: boolean): void {
    posts = []
    error = null
    if (setLoading) {
      loadingPosts = true
    } else {
      loadingPosts = false
    }
  }

  function linkify(line: string): string {
    return line.replace(linkRegex, url => {
      const escaped = url.replace(/"/g, '&quot;')
      return `<a href="${escaped}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${escaped}</a>`
    })
  }

  async function loadStats(pubkey: string): Promise<void> {
    // stats removed
  }

  async function loadPosts(pubkey: string): Promise<void> {
    try {
      // Fetch both regular posts (kind:1) and reposts (kind:6)
      const result = (await ndk.fetchEvents(
        { authors: [pubkey], kinds: [1, 6], limit: 50 },
        { closeOnEose: true }
      )) as Set<any>

      const seen = new Set<string>()
      posts = Array.from(result)
        .map(event => event.rawEvent() as NostrEvent)
        .filter(event => {
          if (seen.has(event.id)) return false
          seen.add(event.id)
          return true
        })
        .sort((a, b) => b.created_at - a.created_at)

      // Hydrate engagement counts (likes, replies, reposts, zaps) for profile posts
      // Use immediate mode for bulk loads to show metrics faster
      const ids = posts.map(p => p.id)
      if (ids.length > 0) {
        queueEngagementHydration(ids, true)
      }
    } catch (err) {
      logger.error('Failed to load profile posts', err)
      error = 'Unable to load posts right now.'
    } finally {
      loadingPosts = false
    }
  }

  function getOriginTab(): NavTab {
    if (originTab) {
      return originTab
    }
    const route = $activeRoute
    if (route.type === 'page') {
      return route.tab
    }
    if (route.type === 'post' || route.type === 'profile') {
      return route.originTab
    }
    return 'profile'
  }

  function handlePostSelect(post: NostrEvent): void {
    openPost(post, getOriginTab())
  }

  function handleProfileSelect(pubkey: string): void {
    if (!pubkey) return
    openProfile(pubkey, getOriginTab())
  }

  async function handleOpenDM(): Promise<void> {
    if (!resolvedPubkey) return
    // Set the active conversation to this user's pubkey
    activeConversation.set(resolvedPubkey)
    // Load the conversation messages
    await loadConversation(resolvedPubkey)
    // Navigate to messages tab
    navigateToPage('messages')
  }
</script>

{#if targetPubkey}
  <div class="flex h-full flex-col bg-transparent pb-24 md:pb-0">
    <section class="mx-auto w-full max-w-3xl px-4 pt-6 md:px-0 md:pt-8">
      <button
        type="button"
        class="mb-4 inline-flex items-center gap-2 rounded-full border border-dark-border/70 bg-dark/70 px-4 py-2 text-sm font-medium text-text-soft transition-colors duration-200 hover:border-primary/60 hover:text-white touch-manipulation relative z-10"
        on:click={(e) => {
          e.preventDefault()
          e.stopPropagation()
          goBack()
        }}
      >
        <ChevronLeftIcon class="h-4 w-4" />
        Back
      </button>
      <div class="relative overflow-hidden rounded-3xl border border-dark-border/60 bg-dark-light shadow-xl">
        <div class="h-20 w-full md:h-24">
          {#if bannerUrl}
            <img src={bannerUrl} alt="Profile banner" class="h-full w-full object-cover" />
          {:else}
            <div class="h-full w-full bg-gradient-to-r from-primary/40 via-purple-500/25 to-pink-500/25"></div>
          {/if}
        </div>

        <div class="relative px-5 pb-6 md:px-8 md:pb-8">
          <div class="-mt-12 flex flex-col gap-4 md:-mt-14 md:flex-row md:items-center md:justify-between">
            <div class="flex items-center gap-4">
              <div class="h-24 w-24 overflow-hidden rounded-full border-4 border-dark bg-dark shadow-lg md:h-28 md:w-28">
                {#if avatarUrl}
                  <img src={avatarUrl} alt={displayName} class="h-full w-full object-cover" />
                {:else}
                  <div class="flex h-full w-full items-center justify-center bg-primary/20 text-3xl font-bold text-primary">
                    {targetPubkey.slice(0, 2).toUpperCase()}
                  </div>
                {/if}
              </div>

              <div class="pb-2">
                <div class="flex flex-wrap items-center gap-3">
                  <h1
                    class="text-xl font-semibold text-white md:text-3xl break-words"
                    style="text-shadow: 0 2px 6px rgba(0,0,0,0.6)"
                  >
                    {displayName}
                  </h1>
                </div>
                <p class="mt-2 text-sm text-text-muted/80 break-words">{nip05 || targetPubkey.slice(0, 12)}</p>
              </div>
            </div>

              <div class="flex w-full flex-col gap-3 md:w-auto md:items-end md:text-right">
              {#if !isOwnProfile && resolvedPubkey}
                <div class="flex flex-wrap gap-2 justify-start md:justify-end">
                  <button
                    type="button"
                    on:click={handleOpenDM}
                    class="flex items-center justify-center gap-2 rounded-xl border border-dark-border/70 bg-dark px-4 py-2 text-sm font-medium text-text-soft transition-colors duration-200 hover:border-primary/60 hover:bg-dark-light hover:text-white touch-manipulation"
                    title="Send message"
                  >
                    <MailIcon class="h-4 w-4" />
                    <span class="hidden md:inline">Message</span>
                  </button>
                  <FollowButton pubkey={resolvedPubkey} size="md" />
                </div>
              {/if}
            </div>
          </div>

          {#if bioLines.length > 0}
            <div class="mt-6 space-y-2 rounded-2xl border border-dark-border/60 bg-dark/60 px-6 py-5 text-sm leading-relaxed text-text-soft shadow-inner">
              {#each bioLines as line}
                {#if line.trim().length === 0}
                  <div class="h-2"></div>
                {:else}
                  <p class="whitespace-pre-line break-words">
                    {@html linkify(line)}
                  </p>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="mx-auto mt-6 w-full max-w-3xl px-4 md:px-0 md:mt-8 flex-1">
      <!-- Filter Bar -->
      <div class="mb-4">
        <ProfileFilterBar />
      </div>

      <div class="flex items-center justify-between px-2 md:px-1">
        <h2 class="text-lg font-semibold text-white md:text-xl">
          {isOwnProfile ? 'Your Posts' : `${displayName}'s Posts`}
        </h2>
        <span class="text-xs uppercase tracking-[0.2em] text-text-muted">
          {loadingPosts ? 'Loading' : `${filteredPosts.length} of ${posts.length}`}
        </span>
      </div>

      <div class="mt-4 flex flex-col gap-3">
        {#if loadingPosts}
          {#each Array(4) as _}
            <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-5">
              <Skeleton count={4} height="h-4" />
            </div>
          {/each}
        {:else if error}
          <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center text-sm text-rose-200/80">
            {error}
          </div>
        {:else if posts.length === 0}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-6 text-center text-sm text-text-muted">
            {isOwnProfile ? "You haven't posted anything yet." : 'No posts yet.'}
          </div>
        {:else if filteredPosts.length === 0}
          <div class="rounded-2xl border border-dark-border/80 bg-dark/60 p-6 text-center text-sm text-text-muted">
            No posts match the selected filter.
          </div>
        {:else}
          {#each filteredPosts as post (post.id)}
            <Post
              event={post}
              showActions
              onSelect={handlePostSelect}
              onProfileSelect={handleProfileSelect}
            />
          {/each}
        {/if}
      </div>
    </section>
  </div>
{:else}
  <div class="flex h-full items-center justify-center text-text-muted">
    <div class="space-y-2 text-center">
      <p class="text-lg font-semibold text-text-soft">Profile unavailable</p>
      <p class="text-sm">Select or follow someone to view their posts.</p>
    </div>
  </div>
{/if}


