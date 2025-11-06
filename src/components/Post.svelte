<script lang="ts">
  import {
    likedEvents,
    repostedEvents,
    zappedEvents,
    metadataCache,
    showCompose,
    composeReplyTo,
    feedEvents,
  } from '$stores/feed'
  import {
    publishReaction,
    publishRepost,
    publishZapRequest,
    getEventById,
    fetchEventById,
  } from '$lib/feed-ndk'
  import { getDisplayName, getAvatarUrl, getNip05Display } from '$lib/metadata'
  import { formatDate } from '$lib/utils'
  import { parseContent } from '$lib/content'
  import type { NostrEvent } from '$types/nostr'
  import type { UserMetadata } from '$types/user'
  import MediaRenderer from './MediaRenderer.svelte'
  import LikeIcon from './icons/LikeIcon.svelte'
  import CommentIcon from './icons/CommentIcon.svelte'
  import RepostIcon from './icons/RepostIcon.svelte'
  import ZapIcon from './icons/ZapIcon.svelte'
  import EmberIcon from './icons/EmberIcon.svelte'
  import QuotedNote from './QuotedNote.svelte'
  import FollowButton from './FollowButton.svelte'
  import { get as getStore } from 'svelte/store'
  import MoreVerticalIcon from './icons/MoreVerticalIcon.svelte'
  import { nip19 } from 'nostr-tools'

  export let event: NostrEvent
  export let onSelect: ((event: NostrEvent) => void) | undefined = undefined
  export let onProfileSelect: ((pubkey: string) => void) | undefined = undefined
  export let onNavigateToEventId: ((eventId: string) => void) | undefined = undefined
  export let replyCount: number = 0
  export let showActions: boolean = true

  let isLiked = false
  let isReposted = false
  let likeLoading = false
  let repostActionLoading = false
  let zapLoading = false
  let zapAmount = 0
  let isZapped = false

  let wrapperParsed = parseContent(event)
  $: wrapperParsed = parseContent(event)

  let displayEvent: NostrEvent = event
  let actionableEvent: NostrEvent = event
  let parsed = wrapperParsed
  let repostTargetEvent: NostrEvent | null = null
  let repostTargetLoading = false
  let repostFetchAttempted = false

  let isRepostWrapper = false
  $: isRepostWrapper = event.kind === 6
  let repostTargetId: string | null = null
  $: repostTargetId = isRepostWrapper ? wrapperParsed.nestedEvent?.id ?? wrapperParsed.repostId ?? null : null

  $: {
    if (!isRepostWrapper) {
      displayEvent = event
    } else if (wrapperParsed.nestedEvent) {
      displayEvent = wrapperParsed.nestedEvent
    } else if (repostTargetEvent) {
      displayEvent = repostTargetEvent
    } else {
      displayEvent = event
      if (repostTargetId && !repostFetchAttempted) {
        repostFetchAttempted = true
        void resolveRepostTarget(repostTargetId)
      }
    }
  }

  $: parsed = displayEvent === event ? wrapperParsed : parseContent(displayEvent)
  $: actionableEvent = displayEvent

  $: isLiked = $likedEvents.has(actionableEvent.id)
  $: isReposted = $repostedEvents.has(actionableEvent.id)
  $: zapAmount = $zappedEvents.get(actionableEvent.id) ?? 0
  $: isZapped = zapAmount > 0

  let metadata
  $: metadata = $metadataCache.get(actionableEvent.pubkey)
  $: displayName = getDisplayName(actionableEvent.pubkey, metadata)
  $: avatarUrl = getAvatarUrl(metadata)
  $: nip05 = getNip05Display(metadata?.nip05)
  $: displayLabel = displayName || actionableEvent.pubkey.slice(0, 8)
  $: initials = displayLabel.slice(0, 2).toUpperCase()

  let postType: 'post' | 'repost' | 'reply' | 'quote' = 'post'
  $: {
    if (isRepostWrapper) {
      postType = 'repost'
    } else if (parsed.quotes.length > 0 || parsed.nestedEvent) {
      postType = 'quote'
    } else if (parsed.replyToId !== null) {
      postType = 'reply'
    } else {
      postType = 'post'
    }
  }

  let isReply = false
  $: isReply = parsed.replyToId !== null
  let formattedTime = ''
  $: formattedTime = formatDate(actionableEvent.created_at)

  let parentEvent: NostrEvent | null = null
  let parentLoading = false
  let parentFetchAttempted = false
  let lastEventId: string | null = null
  let parentMetadata: UserMetadata | undefined = undefined
  let parentDisplayName: string | null = null
  let menuOpen = false
  let reposterMetadata: UserMetadata | undefined = undefined
  let reposterDisplay: string | null = null

  $: if (lastEventId !== event.id) {
    lastEventId = event.id
    parentEvent = null
    parentLoading = false
    parentFetchAttempted = false
    repostTargetEvent = null
    repostFetchAttempted = false
    repostTargetLoading = false
  }

  $: reposterMetadata = isRepostWrapper ? $metadataCache.get(event.pubkey) : undefined
  $: reposterDisplay = isRepostWrapper
    ? getDisplayName(event.pubkey, reposterMetadata) || event.pubkey.slice(0, 8)
    : null

  async function handleLike() {
    if (likeLoading) return
    try {
      likeLoading = true
      await publishReaction(actionableEvent.id, '+')
      likedEvents.update(set => new Set(set).add(actionableEvent.id))
    } catch (err) {
      console.error('Like failed:', err)
    } finally {
      likeLoading = false
    }
  }

  async function handleRepost() {
    if (repostActionLoading) return
    try {
      repostActionLoading = true
      await publishRepost(actionableEvent)
      repostedEvents.update(set => new Set(set).add(actionableEvent.id))
    } catch (err) {
      console.error('Repost failed:', err)
    } finally {
      repostActionLoading = false
    }
  }

  async function handleReply() {
    composeReplyTo.set(actionableEvent)
    showCompose.set(true)
  }

  async function handleZap() {
    if (zapLoading) return
    try {
      zapLoading = true
      // For now, just track it - full zap requires LNURL
      const amount = 21 // sats
      zappedEvents.update(map => new Map(map).set(actionableEvent.id, amount))
      await publishZapRequest(actionableEvent.id, amount, 'wss://relay.damus.io')
    } catch (err) {
      console.error('Zap failed:', err)
    } finally {
      zapLoading = false
    }
  }

  function handleEmber() {
    // Placeholder for ember interaction
    console.log('Ember reaction:', actionableEvent.id)
  }

  async function navigateToEventId(eventId: string | null): Promise<void> {
    if (!eventId) return

    if (onSelect) {
      let target = getEventById(eventId)
      if (!target) {
        const available = getStore(feedEvents).find(item => item.id === eventId)
        target = available
      }
      if (target) {
        onSelect(target)
        return
      }

      onNavigateToEventId?.(eventId)

      try {
        const fetched = await fetchEventById(eventId)
        if (fetched) {
          onSelect(fetched)
        }
      } catch (err) {
        console.warn('Failed to resolve event', err)
      }
      return
    }

    onNavigateToEventId?.(eventId)
  }

  function handleQuotedOpen(targetEventId: string): void {
    void navigateToEventId(targetEventId)
  }

  function handleQuotedSelect(targetEvent: NostrEvent): void {
    if (onSelect) {
      onSelect(targetEvent)
      return
    }
    onNavigateToEventId?.(targetEvent.id)
  }

  async function handleReplyContextClick(): Promise<void> {
    await navigateToEventId(parsed.replyToId)
  }

  async function resolveParentEvent(parentId: string): Promise<void> {
    parentLoading = true
    try {
      let target: NostrEvent | null = getEventById(parentId) ?? null
      if (!target) {
        const available = getStore(feedEvents).find(item => item.id === parentId)
        target = available ?? null
      }
      if (!target) {
        const fetched = await fetchEventById(parentId)
        target = fetched ?? null
      }
      parentEvent = target
    } catch (err) {
      console.warn('Failed to load parent event', err)
    } finally {
      parentLoading = false
    }
  }

  async function resolveRepostTarget(targetId: string): Promise<void> {
    repostTargetLoading = true
    try {
      let target: NostrEvent | null = getEventById(targetId) ?? null
      if (!target) {
        const available = getStore(feedEvents).find(item => item.id === targetId)
        target = available ?? null
      }
      if (!target) {
        const fetched = await fetchEventById(targetId)
        target = fetched ?? null
      }
      repostTargetEvent = target
    } catch (err) {
      console.warn('Failed to load repost target', err)
    } finally {
      repostTargetLoading = false
    }
  }

  $: if (isReply && parsed.replyToId && !parentFetchAttempted) {
    parentFetchAttempted = true
    void resolveParentEvent(parsed.replyToId)
  }

  $: parentMetadata = parentEvent ? $metadataCache.get(parentEvent.pubkey) : undefined
  $: parentDisplayName =
    parentEvent ? getDisplayName(parentEvent.pubkey, parentMetadata) || parentEvent.pubkey.slice(0, 8) : null
  $: quotedEventId = parsed.repostId ?? parsed.quotes[0] ?? parsed.nestedEvent?.id ?? null
  $: quotedEventData = parsed.nestedEvent ?? null

  function toggleMenu(event: MouseEvent): void {
    event.stopPropagation()
    menuOpen = !menuOpen
  }

  function closeMenu(): void {
    menuOpen = false
  }

  async function copyToClipboard(value: string, label: string): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      console.warn(`Clipboard API unavailable. Unable to copy ${label}.`)
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      console.info(`${label} copied to clipboard.`)
    } catch (err) {
      console.warn(`Failed to copy ${label}`, err)
    }
  }

  async function handleCopyNoteId(mouseEvent: MouseEvent): Promise<void> {
    mouseEvent.stopPropagation()
    try {
      const noteId = nip19.noteEncode(actionableEvent.id)
      await copyToClipboard(noteId, 'Note ID')
    } catch (err) {
      console.warn('Failed to encode note id', err)
      await copyToClipboard(actionableEvent.id, 'Note ID (raw)')
    }
    closeMenu()
  }

  async function handleCopyNpub(mouseEvent: MouseEvent): Promise<void> {
    mouseEvent.stopPropagation()
    try {
      const npub = nip19.npubEncode(actionableEvent.pubkey)
      await copyToClipboard(npub, 'npub')
    } catch (err) {
      console.warn('Failed to encode npub', err)
    } finally {
      closeMenu()
    }
  }

  function handleBlockUser(mouseEvent: MouseEvent): void {
    mouseEvent.stopPropagation()
    closeMenu()
    console.warn('Blocking users is not implemented yet.', actionableEvent.pubkey)
  }

  function handleWindowClick(): void {
    if (menuOpen) {
      closeMenu()
    }
  }

  function handleWindowKeydown(keyboardEvent: KeyboardEvent): void {
    if (keyboardEvent.key === 'Escape') {
      closeMenu()
    }
  }

  const baseActionClass =
    'group flex items-center gap-2 rounded-md px-2 py-1 text-text-muted transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none'
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleWindowKeydown} />

<div
  role="button"
  class="relative cursor-pointer rounded-2xl border border-dark-border/80 bg-dark/60 px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-dark/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
  tabindex="0"
  on:click={() => onSelect?.(actionableEvent)}
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(actionableEvent)
    }
  }}
>
  {#if isRepostWrapper}
    <div class="mb-3 flex items-center gap-2 text-sm text-text-muted">
      <RepostIcon size={16} color="currentColor" strokeWidth={1.6} />
      <div class="flex flex-wrap items-center gap-1 text-text-soft/80">
        <button
          type="button"
          class="font-semibold text-text-soft hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-md px-1 -mx-1"
          on:click|stopPropagation={() => onProfileSelect?.(event.pubkey)}
          on:keydown|stopPropagation={(keyboardEvent) => {
            if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
              keyboardEvent.preventDefault()
              onProfileSelect?.(event.pubkey)
            }
          }}
        >
          {reposterDisplay ?? 'Someone'}
        </button>
        <span>reposted</span>
        {#if repostTargetLoading}
          <span class="text-xs text-text-muted/70">(fetching note...)</span>
        {/if}
      </div>
    </div>
  {:else if postType === 'quote'}
    <div class="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.25em] text-amber-400/80">
      <span>💬</span>
      <span>Quote</span>
    </div>
  {/if}

  <!-- Header with avatar and user info -->
  <div class="flex gap-3">
    <!-- Avatar -->
    <div class="flex-shrink-0">
      <button
        type="button"
        class="flex h-12 w-12 items-center justify-center rounded-full transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        on:click|stopPropagation={() => onProfileSelect?.(actionableEvent.pubkey)}
        on:keydown|stopPropagation={(keyboardEvent) => {
          if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
            keyboardEvent.preventDefault()
            onProfileSelect?.(actionableEvent.pubkey)
          }
        }}
      >
        {#if avatarUrl}
          <img src={avatarUrl} alt={displayLabel} class="h-full w-full rounded-full object-cover" />
        {:else}
          <div class="flex h-full w-full items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
            {initials}
          </div>
        {/if}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <!-- User info row -->
      <div class="flex items-start gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="font-semibold text-text-soft hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-md px-1 -mx-1"
            on:click|stopPropagation={() => onProfileSelect?.(actionableEvent.pubkey)}
            on:keydown|stopPropagation={(keyboardEvent) => {
              if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                keyboardEvent.preventDefault()
                onProfileSelect?.(actionableEvent.pubkey)
              }
            }}
          >
            {displayLabel}
          </button>
          {#if nip05}
            <span class="text-xs text-text-muted">{nip05}</span>
          {/if}
        </div>

        <div class="ml-auto flex items-center gap-3 text-sm text-text-muted">
          <FollowButton pubkey={actionableEvent.pubkey} size="sm" layout="inline" />
          <span aria-hidden="true">•</span>
          <span>{formattedTime}</span>
          <div class="relative">
            <button
              type="button"
              class="rounded-full p-1.5 text-text-muted transition-colors duration-200 hover:bg-dark-border/40 hover:text-text-soft focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Post options"
              on:click|stopPropagation={toggleMenu}
            >
              <MoreVerticalIcon size={18} color="currentColor" strokeWidth={1.6} />
            </button>

            {#if menuOpen}
              <div
                role="menu"
                aria-label="Post options"
                tabindex="-1"
                class="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-dark-border/70 bg-dark-lighter/90 p-2 shadow-xl"
              >
                <button
                  type="button"
                  class="w-full rounded-lg px-3 py-2 text-left text-sm text-text-soft transition-colors duration-200 hover:bg-dark/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  on:click={handleCopyNoteId}
                >
                  Copy note ID
                </button>
                <button
                  type="button"
                  class="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-text-soft transition-colors duration-200 hover:bg-dark/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  on:click={handleCopyNpub}
                >
                  Copy npub
                </button>
                <button
                  type="button"
                  class="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition-colors duration-200 hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-400/40"
                  on:click={handleBlockUser}
                >
                  Block user
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>

      {#if isReply && parsed.replyToId}
        <button
          type="button"
          class="mt-2 text-sm font-semibold text-primary hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-md px-1 -mx-1"
          on:click|stopPropagation={() => {
            void handleReplyContextClick()
          }}
        >
          {#if parentLoading}
            Replying to original note...
          {:else}
            replying to <span class="text-text-soft">@{parentDisplayName ?? 'original note'}</span>
          {/if}
        </button>
      {/if}

      <div class="mt-2 text-text-soft whitespace-pre-wrap break-words">
        {parsed.text}
      </div>

      {#if parsed.images.length > 0 || parsed.videos.length > 0 || parsed.embeds.length > 0}
        <div class="mt-3">
          <MediaRenderer images={parsed.images} videos={parsed.videos} embeds={parsed.embeds} />
        </div>
      {/if}

      <!-- Quoted/referenced note -->
      {#if quotedEventId || quotedEventData}
        <div class="mt-3">
          <QuotedNote
            eventId={quotedEventId}
            eventData={quotedEventData}
            onSelect={handleQuotedSelect}
            onOpen={handleQuotedOpen}
          />
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
            disabled={repostActionLoading}
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





