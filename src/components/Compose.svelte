<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { showCompose, composeReplyTo } from '$stores/feed'
  import { publishNote } from '$lib/feed-ndk'
  import { getDisplayName, getAvatarUrl } from '$lib/metadata'
  import { metadataCache } from '$stores/feed'
  import SendIcon from './icons/SendIcon.svelte'
  import { get } from 'svelte/store'

  let content = ''
  let loading = false
  let error = ''
  let charCount = 0
  const MAX_CHARS = 5000

  $: replyTo = $composeReplyTo
  $: metadata = $metadataCache.get($currentUser?.pubkey || '')
  $: displayName = getDisplayName($currentUser?.pubkey || '', metadata)
  $: avatarUrl = getAvatarUrl(metadata)
  $: charCount = content.length
  $: isOverLimit = charCount > MAX_CHARS
  $: isNearLimit = charCount > MAX_CHARS * 0.9

  async function handleSubmit() {
    if (!content.trim() || loading || isOverLimit) return

    try {
      loading = true
      error = ''

      await publishNote(content, replyTo || undefined)

      // Reset and close
      content = ''
      composeReplyTo.set(null)
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
    composeReplyTo.set(null)
    showCompose.set(false)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit()
    }
  }

  function handleOverlayKeyDown(e: KeyboardEvent) {
    if (!get(showCompose)) return
    if (e.key === 'Escape') {
      handleCancel()
    }
  }
</script>

<svelte:window on:keydown={handleOverlayKeyDown} />

<!-- Modal overlay -->
{#if $showCompose}
  <div
    class="fixed inset-0 z-50 flex items-end bg-black/50 px-0 py-0 md:items-center md:justify-center md:px-4 md:py-4"
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
      class="relative w-full max-h-[90vh] md:max-h-[calc(100vh-2rem)] overflow-y-auto rounded-t-3xl border border-dark-border bg-dark-light md:w-full md:max-w-2xl md:rounded-3xl"
      on:click|stopPropagation
      role="presentation"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-dark-border px-4 py-3 md:px-6 md:py-4">
        <h2 class="text-lg font-semibold text-text-soft">
          {replyTo ? 'Reply to post' : 'Compose'}
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

      <!-- Compose area -->
      <div class="px-4 py-4 md:px-6 md:py-6">
        <!-- User info -->
        <div class="mb-4 flex gap-3">
          {#if avatarUrl}
            <img src={avatarUrl} alt={displayName} class="h-12 w-12 rounded-full object-cover flex-shrink-0" />
          {:else}
            <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          {/if}
          <div class="flex-1">
            <p class="font-semibold text-text-soft">{displayName}</p>
            <p class="text-sm text-text-muted">Public</p>
          </div>
        </div>

        <!-- Textarea -->
        <textarea
          bind:value={content}
          on:keydown={handleKeyDown}
          placeholder="What's happening!?"
          class="w-full resize-none bg-transparent text-2xl text-text-soft placeholder-text-muted/50 outline-none"
          rows="6"
        />

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
{/if}

<style>
  textarea {
    font-family: inherit;
  }

  textarea::placeholder {
    color: rgba(166, 166, 166, 0.5);
  }
</style>

