<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { showCompose, composeReplyTo, composeQuoteOf } from '$stores/feed'
  import { publishNote } from '$lib/feed-ndk'
  import { getDisplayName, getAvatarUrl } from '$lib/metadata'
  import { metadataCache } from '$stores/feed'
  import SendIcon from './icons/SendIcon.svelte'
  import { get } from 'svelte/store'
  import QuotedNote from './QuotedNote.svelte'
  import MentionAutocomplete from './MentionAutocomplete.svelte'
  import { logger } from '$lib/logger'
  import { nip19 } from 'nostr-tools'

  let content = ''
  let loading = false
  let error = ''
  let charCount = 0
  const MAX_CHARS = 5000

  // Mention autocomplete state
  let textareaElement: HTMLTextAreaElement
  let mentionSearchTerm = ''
  let showMentionAutocomplete = false
  let mentionAutocompletePosition = { top: 0, left: 0 }
  let mentionStartIndex = -1
  let mentionedPubkeys = new Set<string>()
  let mentionedNames = new Map<string, string>() // displayName -> pubkey
  let mentionAutocompleteRef: any

  $: replyTo = $composeReplyTo
  $: quoteTarget = $composeQuoteOf
  $: metadata = $metadataCache.get($currentUser?.pubkey || '')
  $: displayName = getDisplayName($currentUser?.pubkey || '', metadata)
  $: avatarUrl = getAvatarUrl(metadata)
  $: userAvatar = avatarUrl || $currentUser?.picture || null
  $: userName =
    displayName ||
    $currentUser?.name ||
    ($currentUser?.pubkey ? `${$currentUser.pubkey.slice(0, 8)}…` : 'Nostr user')
  $: charCount = content.length
  $: isOverLimit = charCount > MAX_CHARS
  $: isNearLimit = charCount > MAX_CHARS * 0.9
  $: composeTitle = replyTo ? 'Reply to post' : quoteTarget ? 'Quote post' : 'Compose'

  async function handleSubmit() {
    if (!content.trim() || loading || isOverLimit) return

    try {
      loading = true
      error = ''

      await publishNote(
        content,
        replyTo || undefined,
        quoteTarget || undefined,
        Array.from(mentionedPubkeys)
      )

      // Reset and close
      content = ''
      mentionedPubkeys.clear()
      mentionedNames.clear()
      composeReplyTo.set(null)
      composeQuoteOf.set(null)
      showCompose.set(false)
    } catch (err) {
      error = String(err)
      logger.error('Publish failed:', err)
    } finally {
      loading = false
    }
  }

  function handleCancel() {
    content = ''
    mentionedPubkeys.clear()
    mentionedNames.clear()
    composeReplyTo.set(null)
    composeQuoteOf.set(null)
    showCompose.set(false)
  }

  function getHighlightedContent(): string {
    let result = content
    // Highlight mentioned names
    for (const [displayName] of mentionedNames) {
      const mentionText = `@${displayName}`
      result = result.replace(
        new RegExp(`@${displayName}\\b`, 'g'),
        `<span class="mention-highlight">@${displayName}</span>`
      )
    }
    return result
  }

  function handleTextareaInput(e: Event) {
    const textarea = e.target as HTMLTextAreaElement
    const cursorPosition = textarea.selectionStart
    const textBeforeCursor = content.slice(0, cursorPosition)

    // Check if we're typing a mention
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex !== -1) {
      // Check if there's a space between @ and cursor
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1)
      const hasSpace = /\s/.test(textAfterAt)

      if (!hasSpace) {
        // Show autocomplete
        mentionStartIndex = lastAtIndex
        mentionSearchTerm = textAfterAt
        showMentionAutocomplete = true

        // Calculate position
        updateAutocompletePosition(textarea, cursorPosition)
      } else {
        showMentionAutocomplete = false
      }
    } else {
      showMentionAutocomplete = false
    }
  }

  function updateAutocompletePosition(textarea: HTMLTextAreaElement, cursorPosition: number) {
    // Get textarea position
    const rect = textarea.getBoundingClientRect()

    // Approximate cursor position (this is a simple approach)
    const textBeforeCursor = content.slice(0, cursorPosition)
    const lines = textBeforeCursor.split('\n')
    const currentLine = lines.length
    const lineHeight = 24 // approximate line height

    mentionAutocompletePosition = {
      top: rect.top + currentLine * lineHeight - textarea.scrollTop,
      left: rect.left + 20
    }
  }

  function handleMentionSelect(pubkey: string, displayName: string) {
    // Encode pubkey as npub
    const npub = nip19.npubEncode(pubkey)

    // Replace @searchterm with nostr:npub (Nostr standard)
    const before = content.slice(0, mentionStartIndex)
    const after = content.slice(mentionStartIndex + 1 + mentionSearchTerm.length)

    // Insert as nostr:npub format but show displayName in badge
    content = `${before}nostr:${npub}${after}`

    // Store the pubkey and name mapping (for badge display)
    mentionedPubkeys.add(pubkey)
    mentionedNames.set(displayName, pubkey)

    // Close autocomplete
    showMentionAutocomplete = false

    // Focus back on textarea
    setTimeout(() => {
      if (textareaElement) {
        textareaElement.focus()
        const newCursorPos = mentionStartIndex + npub.length + 6 // "nostr:" + npub
        textareaElement.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Let autocomplete handle keys if it's visible
    if (showMentionAutocomplete && mentionAutocompleteRef) {
      const handled = mentionAutocompleteRef.handleKeyDown(e)
      if (handled) return
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit()
    }
  }

  function handleOverlayKeyDown(e: KeyboardEvent) {
    if (!get(showCompose)) return
    if (e.key === 'Escape' && !showMentionAutocomplete) {
      handleCancel()
    }
  }
</script>

<svelte:window on:keydown={handleOverlayKeyDown} />

<!-- Modal overlay -->
{#if $showCompose}
  <div
    class="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 px-3 py-4 sm:px-4 sm:py-8"
    style="
      padding-top: calc(env(safe-area-inset-top, 0px) + 72px);
      padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
    "
    role="dialog"
    aria-modal="true"
  >
    <button
      type="button"
      class="absolute inset-0 w-full h-full cursor-default bg-transparent"
      aria-label="Close compose modal"
      on:click={handleCancel}
    />
    <!-- Modal content -->
    <div
      class="relative mx-auto mt-3 w-full max-w-lg sm:max-w-xl md:max-w-2xl overflow-y-auto rounded-3xl border border-dark-border bg-dark-light shadow-2xl"
      style="max-height: calc(82vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));"
      on:click|stopPropagation
      role="presentation"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-dark-border px-4 py-3 md:px-6 md:py-4">
        <h2 class="text-lg font-semibold text-text-soft">
          {composeTitle}
        </h2>
        <button
          on:click={handleCancel}
          class="text-2xl text-text-muted transition-colors hover:text-text-soft"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <!-- Reply context -->
      {#if replyTo}
        <div class="border-b border-dark-border/50 bg-dark-lighter/50 px-4 py-3 md:px-6">
          <p class="text-sm text-text-muted">
            Replying to <span class="font-semibold text-text-soft">{replyTo.content.slice(0, 50)}</span>...
          </p>
        </div>
      {/if}

      <!-- Quote context -->
      {#if quoteTarget}
        <div class="border-b border-dark-border/50 bg-dark-lighter/40 px-4 py-3 md:px-6">
          <div class="flex items-center justify-between">
            <p class="text-sm text-text-muted">Quoting</p>
            <button
              type="button"
              class="text-xs text-text-muted hover:text-text-soft"
              on:click={() => composeQuoteOf.set(null)}
            >
              Remove
            </button>
          </div>
          <div class="mt-3 pointer-events-none">
            <QuotedNote eventId={quoteTarget.id} eventData={quoteTarget} />
          </div>
        </div>
      {/if}

      <!-- Compose area -->
      <div class="px-4 py-4 md:px-6 md:py-6">
        <!-- User info -->
        <div class="mb-4 flex gap-3">
          {#if userAvatar}
            <img src={userAvatar} alt={userName} class="h-12 w-12 rounded-full object-cover flex-shrink-0" />
          {:else}
            <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
              {userName.slice(0, 2).toUpperCase()}
            </div>
          {/if}
          <div class="flex-1">
            <p class="font-semibold text-text-soft">{userName}</p>
            <p class="text-sm text-text-muted">Public</p>
          </div>
        </div>

        <!-- Textarea with mention preview -->
        <div class="relative">
          <!-- Preview layer showing @names instead of nostr:npub -->
          <div
            class="absolute inset-0 pointer-events-none text-2xl whitespace-pre-wrap break-words text-text-soft/90"
            style="padding: 0; margin: 0; line-height: 1.5; overflow: hidden;"
          >
            {#each content.split(/(nostr:npub1[a-z0-9]+)/g) as part, i}
              {#if part.startsWith('nostr:npub1')}
                {@const npub = part.slice(6)}
                {@const displayName = Array.from(mentionedNames.entries()).find(([_, pk]) => {
                  try {
                    return nip19.npubEncode(pk) === npub
                  } catch {
                    return false
                  }
                })?.[0]}
                {#if displayName}
                  <span class="text-primary font-medium bg-primary/10 px-1 rounded">@{displayName}</span>
                {:else}
                  <span class="opacity-0">{part}</span>
                {/if}
              {:else}
                <span class="opacity-0">{part}</span>
              {/if}
            {/each}
          </div>

          <!-- Actual textarea (text is partially transparent to show preview below) -->
          <textarea
            bind:this={textareaElement}
            bind:value={content}
            on:input={handleTextareaInput}
            on:keydown={handleKeyDown}
            placeholder="What's happening!?"
            class="relative w-full resize-none bg-transparent text-xl sm:text-2xl placeholder-text-muted/50 outline-none {mentionedNames.size > 0 ? 'text-transparent caret-text-soft' : 'text-text-soft'}"
            style="line-height: 1.5;"
            rows="4"
          />
        </div>

        <!-- Mentioned users indicator -->
        {#if mentionedNames.size > 0}
          <div class="mt-2 flex flex-wrap gap-2">
            {#each Array.from(mentionedNames.keys()) as displayName}
              <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                <span>@{displayName}</span>
                <button
                  type="button"
                  class="hover:text-primary/80"
                  on:click={() => {
                    const pubkey = mentionedNames.get(displayName)
                    mentionedNames.delete(displayName)
                    mentionedNames = mentionedNames
                    if (pubkey) mentionedPubkeys.delete(pubkey)
                  }}
                >
                  ×
                </button>
              </span>
            {/each}
          </div>
        {/if}

        <!-- Character counter -->
        <div class="mt-2 text-xs text-text-muted">
          {charCount} / {MAX_CHARS}
          {#if isNearLimit && !isOverLimit}
            <span class="text-orange-400 ml-2">(⚠️ Getting close to limit)</span>
          {/if}
          {#if isOverLimit}
            <span class="text-red-400 ml-2">(❌ Exceeds limit)</span>
          {/if}
        </div>

        <!-- Error message -->
        {#if error}
          <div class="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-3 border-t border-dark-border px-4 py-3 md:px-6 md:py-4">
        <button
          on:click={handleCancel}
          class="btn-secondary"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          on:click={handleSubmit}
          disabled={!content.trim() || loading || isOverLimit}
          class="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <SendIcon size={18} color="currentColor" strokeWidth={2} />
          {loading ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  </div>

  <!-- Mention Autocomplete -->
  <MentionAutocomplete
    bind:this={mentionAutocompleteRef}
    bind:visible={showMentionAutocomplete}
    bind:searchTerm={mentionSearchTerm}
    bind:position={mentionAutocompletePosition}
    onSelect={handleMentionSelect}
  />
{/if}

<style>
  textarea {
    font-family: inherit;
  }

  textarea::placeholder {
    color: rgba(166, 166, 166, 0.5);
  }

  :global(.mention-highlight) {
    color: #8b5cf6;
    font-weight: 600;
    background: rgba(139, 92, 246, 0.1);
    padding: 2px 4px;
    border-radius: 4px;
  }
</style>
