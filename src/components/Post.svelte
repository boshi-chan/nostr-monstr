<script lang="ts">
  import {
    likedEvents,
    repostedEvents,
    zappedEvents,
    metadataCache,
    showCompose,
    composeReplyTo,
    feedEvents,
    likeCounts,
    repostCounts,
    zapTotals,
    replyCounts,
    commentedThreads,
  } from '$stores/feed'
  import {
    publishReaction,
    publishRepost,
    getEventById,
    fetchEventById,
  } from '$lib/feed-ndk'
  import { getDisplayName, getAvatarUrl, getNip05Display, fetchUserMetadata } from '$lib/metadata'
  import { formatDate } from '$lib/utils'
  import { parseContent } from '$lib/content'
  import type { NostrEvent } from '$types/nostr'
  import type { UserMetadata } from '$types/user'
  import snarkdown from 'snarkdown'
  import MediaRenderer from './MediaRenderer.svelte'
  import NostrURIRenderer from './NostrURIRenderer.svelte'
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
  import { showEmberModal, emberTarget } from '$stores/wallet'
  import { emberTotals, ensureEmberTotal } from '$stores/ember'
  import { openZapModal } from '$stores/nwc'
  import { queueEngagementHydration } from '$lib/engagement'

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
  let emberAmount = 0

  let aggregateLikeCount = 0
  let aggregateRepostCount = 0
  let aggregateZapTotal = 0
  let aggregateReplyCount = 0
  let displayLikeCount = 0
  let displayRepostCount = 0
  let displayZapAmount = 0
  let displayReplyCount = 0
  let hasCommented = false

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

  // Check if this is long-form content (kind 30023)
  let isLongForm = false
  $: isLongForm = actionableEvent.kind === 30023

  // Render markdown for long-form posts
  let renderedHtml = ''
  $: if (isLongForm && parsed.text) {
    renderedHtml = snarkdown(parsed.text)
  }

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
  $: aggregateLikeCount = $likeCounts.get(actionableEvent.id) ?? 0
  $: aggregateRepostCount = $repostCounts.get(actionableEvent.id) ?? 0
  $: aggregateZapTotal = $zapTotals.get(actionableEvent.id) ?? 0
  $: aggregateReplyCount = $replyCounts.get(actionableEvent.id) ?? 0
  $: displayLikeCount = Math.max(aggregateLikeCount, isLiked ? 1 : 0)
  $: displayRepostCount = Math.max(aggregateRepostCount, isReposted ? 1 : 0)
  $: displayZapAmount = Math.max(aggregateZapTotal, zapAmount)
  $: displayReplyCount = Math.max(aggregateReplyCount, replyCount ?? 0)
  $: hasCommented = $commentedThreads.has(actionableEvent.id)
  $: {
    const totals = $emberTotals
    emberAmount = totals.get(actionableEvent.id) ?? 0
  }
  $: if (actionableEvent.id) {
    void ensureEmberTotal(actionableEvent.id)
  }

  let metadata: UserMetadata | undefined
  $: metadata = $metadataCache.get(actionableEvent.pubkey)
  $: displayName = getDisplayName(actionableEvent.pubkey, metadata)
  $: avatarUrl = getAvatarUrl(metadata)
  $: nip05 = getNip05Display(metadata?.nip05)
  $: displayLabel = displayName || actionableEvent.pubkey.slice(0, 8)
  $: initials = displayLabel.slice(0, 2).toUpperCase()

  let isReply = false
  $: isReply = parsed.replyToId !== null
  let formattedTime = ''
  $: formattedTime = formatDate(actionableEvent.created_at)

  // Fetch metadata for all mentioned users
  $: if (parsed.mentions.length > 0) {
    for (const mention of parsed.mentions) {
      if (mention.pubkey && !$metadataCache.has(mention.pubkey)) {
        void fetchUserMetadata(mention.pubkey)
      }
    }
  }

  let parentEvent: NostrEvent | null = null
  let parentLoading = false
  let parentFetchAttempted = false
  let lastEventId: string | null = null
  let parentMetadata: UserMetadata | undefined = undefined
  let parentDisplayName: string | null = null
  let menuOpen = false
  let reposterMetadata: UserMetadata | undefined = undefined
  let reposterDisplay: string | null = null
  let lastHydratedActionableId: string | null = null

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

  $: if (actionableEvent?.id && lastHydratedActionableId !== actionableEvent.id) {
    lastHydratedActionableId = actionableEvent.id
    queueEngagementHydration([actionableEvent.id])
  }

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

  function handleZap() {
    // Open zap modal with event details
    openZapModal({
      eventId: actionableEvent.id,
      recipientPubkey: actionableEvent.pubkey,
      recipientName: displayName,
    })
  }

  function resolveMoneroAddress(): string | null {
    if (!metadata) return null
    const candidates = ['monero_address', 'moneroAddress', 'xmr_address', 'ember_address']
    for (const key of candidates) {
      const value = metadata[key]
      if (typeof value === 'string' && value.length > 80) {
        return value
      }
    }
    return null
  }

  function handleEmber() {
    emberTarget.set({
      recipientPubkey: actionableEvent.pubkey,
      noteId: actionableEvent.id,
      address: resolveMoneroAddress(),
    })
    showEmberModal.set(true)
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
    'group flex items-center gap-2 rounded-md px-2 py-1 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none'
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
    <div class="mb-3 flex items-center gap-2 text-sm text-text-muted/80">
      <span class="text-emerald-400/70">
        <RepostIcon size={16} color="currentColor" strokeWidth={1.8} />
      </span>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          class="font-semibold text-text-soft hover:underline focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 -mx-1"
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
        <span class="text-text-muted/70">reposted</span>
        {#if repostTargetLoading}
          <span class="text-xs text-text-muted/60">(loading...)</span>
        {/if}
      </div>
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
          <img
            src={avatarUrl}
            alt={displayLabel}
            class="h-full w-full rounded-full object-cover"
            loading="lazy"
            decoding="async"
          />
        {:else}
          <div class="flex h-full w-full items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
            {initials}
          </div>
        {/if}
      </button>
    </div>

    <!-- User info and header content only -->
    <div class="flex-1 min-w-0">
      <!-- User info row -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            class="font-semibold text-text-soft hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-md px-1 -mx-1 truncate"
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
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-text-muted truncate">@{nip05}</span>
              <!-- NIP-05 Verified Badge -->
              <svg class="h-4 w-4 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-label="Verified">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
              </svg>
            </div>
          {/if}
        </div>

        <div class="flex items-center gap-2 text-sm text-text-muted flex-shrink-0">
          <span class="hover:underline cursor-pointer" title={new Date(actionableEvent.created_at * 1000).toLocaleString()}>{formattedTime}</span>
          <FollowButton pubkey={actionableEvent.pubkey} size="sm" layout="inline" />
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
    </div>
  </div>

  <!-- Post content (full width below header) -->
  <div class="mt-3">
    {#if isReply && (parsed.replyToId || parsed.mentions.length > 0)}
      <div class="text-sm text-text-muted">
          <span class="text-text-tertiary">Replying to</span>
          {#if parsed.mentions.length > 0}
            {#each parsed.mentions.slice(0, 3) as mention, idx}
              {@const mentionMetadata = $metadataCache.get(mention.pubkey)}
              {@const mentionDisplayName = getDisplayName(mention.pubkey, mentionMetadata) || mention.pubkey.slice(0, 8)}
              <button
                type="button"
                class="text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-0.5 -mx-0.5"
                on:click|stopPropagation={() => onProfileSelect?.(mention.pubkey)}
              >
                @{mentionDisplayName}
              </button>
              {#if idx < Math.min(parsed.mentions.length, 3) - 1}
                <span class="text-text-tertiary"> </span>
              {/if}
            {/each}
            {#if parsed.mentions.length > 3}
              <span class="text-text-tertiary"> and {parsed.mentions.length - 3} others</span>
            {/if}
          {:else if parentLoading}
            <span class="text-text-tertiary">...</span>
          {:else if parentDisplayName}
            <button
              type="button"
              class="text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary/40 rounded px-0.5 -mx-0.5"
              on:click|stopPropagation={() => {
                void handleReplyContextClick()
              }}
            >
              @{parentDisplayName}
            </button>
          {/if}
      </div>
    {/if}

    {#if isLongForm}
      <!-- Render markdown for long-form content -->
      <div class="mt-2 prose prose-invert prose-sm max-w-none text-text-soft">
        {@html renderedHtml}
      </div>
    {:else}
      <!-- Regular plaintext content -->
      <div class="mt-2 text-text-soft whitespace-pre-wrap break-words" style="overflow-wrap:anywhere">
        {#if parsed.nostrURIs && parsed.nostrURIs.length > 0}
          <NostrURIRenderer
            text={parsed.text}
            onEventClick={onNavigateToEventId}
            onProfileClick={onProfileSelect}
          />
        {:else}
          {parsed.text}
        {/if}
      </div>
    {/if}

    {#if parsed.images.length > 0 || parsed.videos.length > 0 || parsed.embeds.length > 0}
      <div class="mt-3">
        <MediaRenderer images={parsed.images} videos={parsed.videos} embeds={parsed.embeds} event={actionableEvent} />
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
      <div class="mt-4 flex items-center justify-between text-text-muted border-t border-dark-border/40 pt-3">
          <!-- Like -->
          <button
            on:click|stopPropagation={handleLike}
            disabled={likeLoading}
            class={`${baseActionClass} hover:text-rose-400 hover:bg-rose-400/5 ${
              isLiked ? 'text-rose-400/80' : 'text-text-muted'
            }`}
            title="Like"
          >
            <LikeIcon size={18} color="currentColor" strokeWidth={1.75} filled={isLiked} />
            {#if displayLikeCount > 0}
              <span class="text-xs font-medium">{displayLikeCount}</span>
            {/if}
          </button>

          <!-- Comment -->
          <button
            on:click|stopPropagation={handleReply}
            class={`${baseActionClass} hover:text-sky-400 hover:bg-sky-400/10 ${
              hasCommented ? 'text-sky-300' : 'text-text-muted'
            }`}
            title="Comment"
          >
            <CommentIcon size={18} color="currentColor" strokeWidth={1.75} />
            {#if displayReplyCount > 0}
              <span class="text-xs font-medium">{displayReplyCount}</span>
            {/if}
          </button>

          <!-- Repost -->
          <button
            on:click|stopPropagation={handleRepost}
            disabled={repostActionLoading}
            class={`${baseActionClass} hover:text-emerald-400 hover:bg-emerald-400/5 ${
              isReposted ? 'text-emerald-400/80' : 'text-text-muted'
            }`}
            title="Repost"
          >
            <RepostIcon size={18} color="currentColor" strokeWidth={1.75} />
            {#if displayRepostCount > 0}
              <span class="text-xs font-medium">{displayRepostCount}</span>
            {/if}
          </button>

          <!-- Zap -->
          <button
            on:click|stopPropagation={handleZap}
            disabled={zapLoading}
            class={`${baseActionClass} hover:text-yellow-400 hover:bg-yellow-400/5 ${
              isZapped ? 'text-yellow-400/80' : 'text-text-muted'
            }`}
            title="Zap {displayZapAmount > 0 ? displayZapAmount + ' sats' : ''}"
          >
            <ZapIcon size={18} color="currentColor" strokeWidth={1.75} />
            {#if displayZapAmount > 0}
              <span class="text-xs font-medium">{Math.round(displayZapAmount)}</span>
            {/if}
          </button>

          <!-- Ember -->
          <button
            on:click|stopPropagation={handleEmber}
            class={`${baseActionClass} hover:text-orange-400 hover:bg-orange-400/5 ${
              emberAmount > 0 ? 'text-orange-400' : ''
            }`}
            title="Ember {emberAmount > 0 ? emberAmount.toFixed(4) + ' XMR' : ''}"
          >
            <EmberIcon size={18} color="currentColor" strokeWidth={1.75} />
            {#if emberAmount > 0}
              <span class="text-xs font-medium">{emberAmount.toFixed(4)}</span>
            {/if}
          </button>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Markdown styling for long-form posts */
  :global(.prose) {
    color: inherit;
    line-height: 1.75;
  }

  :global(.prose h1) {
    font-size: 1.875rem;
    font-weight: 700;
    margin-top: 1.5rem;
    margin-bottom: 1rem;
    color: #fff;
  }

  :global(.prose h2) {
    font-size: 1.5rem;
    font-weight: 600;
    margin-top: 1.25rem;
    margin-bottom: 0.75rem;
    color: #fff;
  }

  :global(.prose h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    color: #e5e7eb;
  }

  :global(.prose p) {
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
  }

  :global(.prose a) {
    color: #f97316;
    text-decoration: underline;
  }

  :global(.prose a:hover) {
    color: #fb923c;
  }

  :global(.prose strong) {
    font-weight: 600;
    color: #fff;
  }

  :global(.prose em) {
    font-style: italic;
  }

  :global(.prose code) {
    background: rgba(255, 255, 255, 0.1);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    font-family: ui-monospace, monospace;
  }

  :global(.prose pre) {
    background: rgba(255, 255, 255, 0.05);
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-top: 1rem;
    margin-bottom: 1rem;
  }

  :global(.prose ul),
  :global(.prose ol) {
    margin-top: 0.75rem;
    margin-bottom: 0.75rem;
    padding-left: 1.5rem;
  }

  :global(.prose li) {
    margin-top: 0.25rem;
    margin-bottom: 0.25rem;
  }

  :global(.prose blockquote) {
    border-left: 4px solid #f97316;
    padding-left: 1rem;
    font-style: italic;
    color: #9ca3af;
    margin-top: 1rem;
    margin-bottom: 1rem;
  }

  :global(.prose hr) {
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
  }

  :global(.prose img) {
    border-radius: 0.5rem;
    margin-top: 1rem;
    margin-bottom: 1rem;
    max-width: 100%;
    height: auto;
  }
</style>





