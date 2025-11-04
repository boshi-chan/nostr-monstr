<script lang="ts">
  import { likedEvents, repostedEvents, zappedEvents, metadataCache, showCompose, composeReplyTo } from '$stores/feed'
  import { publishReaction, publishRepost, publishZapRequest } from '$lib/feed-ndk'
  import { getDisplayName, getAvatarUrl, getNip05Display } from '$lib/metadata'
  import { parseContent } from '$lib/content'
  import type { NostrEvent } from '$types/nostr'
  import MediaRenderer from './MediaRenderer.svelte'
  import LikeIcon from './icons/LikeIcon.svelte'
  import CommentIcon from './icons/CommentIcon.svelte'
  import RepostIcon from './icons/RepostIcon.svelte'
  import ZapIcon from './icons/ZapIcon.svelte'
  import EmberIcon from './icons/EmberIcon.svelte'
  import QuotedNote from './QuotedNote.svelte'

  export let event: NostrEvent
  export let onSelect: ((event: NostrEvent) => void) | undefined = undefined
  export let replyCount: number = 0
  export let showActions: boolean = true

  let isLiked = false
  let isReposted = false
  let likeLoading = false
  let repostLoading = false
  let zapLoading = false
  let zapAmount = 0
  let isZapped = false

  $: isLiked = $likedEvents.has(event.id)
  $: isReposted = $repostedEvents.has(event.id)
  $: zapAmount = $zappedEvents.get(event.id) ?? 0
  $: isZapped = zapAmount > 0

  let metadata
  $: metadata = $metadataCache.get(event.pubkey)
  $: displayName = getDisplayName(event.pubkey, metadata)
  $: avatarUrl = getAvatarUrl(metadata)
  $: nip05 = getNip05Display(metadata?.nip05)

  const parsed = parseContent(event)
  const formattedTime = new Date(event.created_at * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  async function handleLike() {
    if (likeLoading) return
    try {
      likeLoading = true
      await publishReaction(event.id, '+')
      likedEvents.update(set => new Set(set).add(event.id))
    } catch (err) {
      console.error('Like failed:', err)
    } finally {
      likeLoading = false
    }
  }

  async function handleRepost() {
    if (repostLoading) return
    try {
      repostLoading = true
      await publishRepost(event)
      repostedEvents.update(set => new Set(set).add(event.id))
    } catch (err) {
      console.error('Repost failed:', err)
    } finally {
      repostLoading = false
    }
  }

  async function handleReply() {
    composeReplyTo.set(event)
    showCompose.set(true)
  }

  async function handleZap() {
    if (zapLoading) return
    try {
      zapLoading = true
      // For now, just track it - full zap requires LNURL
      const amount = 21 // sats
      zappedEvents.update(map => new Map(map).set(event.id, amount))
      await publishZapRequest(event.id, amount, 'wss://relay.damus.io')
    } catch (err) {
      console.error('Zap failed:', err)
    } finally {
      zapLoading = false
    }
  }

  function handleEmber() {
    // Placeholder for ember interaction
    console.log('Ember reaction:', event.id)
  }

  const baseActionClass =
    'group flex items-center gap-2 rounded-md px-2 py-1 text-text-muted transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none'
</script>

<div
  role="button"
  class="border-b border-dark-border bg-dark-light/30 px-4 py-3 transition-colors duration-200 hover:bg-dark-light/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
  tabindex="0"
  on:click={() => onSelect?.(event)}
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(event)
    }
  }}
>
  <!-- Header with avatar and user info -->
  <div class="flex gap-3">
    <!-- Avatar -->
    <div class="flex-shrink-0">
      {#if avatarUrl}
        <img src={avatarUrl} alt={displayName} class="h-12 w-12 rounded-full object-cover" />
      {:else}
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
      {/if}
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <!-- User info row -->
      <div class="flex items-center gap-2">
        <span class="font-semibold text-text-soft hover:underline">{displayName}</span>
        {#if nip05}
          <span class="text-xs text-text-muted">{nip05}</span>
        {/if}
        <span class="text-text-muted">&bull;</span>
        <span class="text-sm text-text-muted">{formattedTime}</span>
      </div>

      <!-- Content text -->
      <div class="mt-2 text-text-soft whitespace-pre-wrap break-words">
        {parsed.text}
      </div>

      <!-- Media -->
      {#if parsed.images.length > 0 || parsed.videos.length > 0 || parsed.embeds.length > 0}
        <div class="mt-3">
          <MediaRenderer images={parsed.images} videos={parsed.videos} embeds={parsed.embeds} />
        </div>
      {/if}

      <!-- Repost banner -->
      {#if parsed.repostId}
        <div class="mt-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          <span class="font-semibold text-emerald-300">{displayName}</span> reposted
        </div>
      {/if}

      <!-- Quoted/referenced note -->
      {#if parsed.repostId || parsed.quotes.length > 0}
        <div class="mt-3">
          <QuotedNote eventId={parsed.repostId ?? parsed.quotes[0]} />
        </div>
      {/if}

      <!-- Action buttons -->
      {#if showActions}
        <div class="mt-3 flex justify-between text-text-muted -mx-2">
          <!-- Reply -->
          <button
            on:click|stopPropagation={handleReply}
            class={`${baseActionClass} hover:bg-orange-500/10 hover:text-orange-400 focus-visible:ring-2 focus-visible:ring-orange-500/40`}
            title="Reply"
          >
            <CommentIcon size={18} color="currentColor" strokeWidth={1.75} />
            {#if replyCount > 0}
              <span class="text-xs text-orange-300 group-hover:text-orange-200">{replyCount}</span>
            {/if}
          </button>

          <!-- Repost -->
          <button
            on:click|stopPropagation={handleRepost}
            disabled={repostLoading}
            class={`${baseActionClass} hover:bg-emerald-500/10 hover:text-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
              isReposted ? 'bg-emerald-500/10 text-emerald-400' : ''
            }`}
            title="Repost"
          >
            <RepostIcon size={18} color="currentColor" strokeWidth={1.75} />
            {#if isReposted}
              <span class="text-xs text-emerald-300 group-hover:text-emerald-200">1</span>
            {/if}
          </button>

          <!-- Like -->
          <button
            on:click|stopPropagation={handleLike}
            disabled={likeLoading}
            class={`${baseActionClass} hover:bg-rose-500/10 hover:text-rose-400 focus-visible:ring-2 focus-visible:ring-rose-500/40 ${
              isLiked ? 'bg-rose-500/10 text-rose-400' : ''
            }`}
            title="Like"
          >
            <LikeIcon size={18} color="currentColor" strokeWidth={1.75} filled={isLiked} />
            {#if isLiked}
              <span class="text-xs text-rose-300 group-hover:text-rose-200">1</span>
            {/if}
          </button>

          <!-- Zap -->
          <button
            on:click|stopPropagation={handleZap}
            disabled={zapLoading}
            class={`${baseActionClass} hover:bg-yellow-500/10 hover:text-yellow-400 focus-visible:ring-2 focus-visible:ring-yellow-500/40 ${
              isZapped ? 'bg-yellow-500/10 text-yellow-400' : ''
            }`}
            title="Zap"
          >
            <ZapIcon size={18} color="currentColor" strokeWidth={1.75} />
            {#if isZapped}
              <span class="text-xs text-yellow-300 group-hover:text-yellow-200">{zapAmount}</span>
            {/if}
          </button>

          <!-- Ember -->
          <button
            on:click|stopPropagation={handleEmber}
            class={`${baseActionClass} hover:bg-orange-500/10 hover:text-orange-400 focus-visible:ring-2 focus-visible:ring-orange-500/40`}
            title="Ember"
          >
            <EmberIcon size={18} color="currentColor" strokeWidth={1.75} />
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

