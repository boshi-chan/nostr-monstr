<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { formatDate } from '$lib/utils'
  import { parseContent } from '$lib/content'
  import UserProfile from './UserProfile.svelte'
  import MediaRenderer from './MediaRenderer.svelte'
  import QuotedNote from './QuotedNote.svelte'
  import type { NostrEvent } from '$types/nostr'

  export let event: NostrEvent | null = null
  export let thread: NostrEvent[] = []

  const dispatch = createEventDispatcher()

  function handleClose() {
    dispatch('close')
  }

  function handleReply() {
    dispatch('reply', event)
  }

  function handleOverlayClick(mouseEvent: MouseEvent) {
    if (mouseEvent.target === mouseEvent.currentTarget) {
      handleClose()
    }
  }
</script>

<svelte:window on:keydown={(keyboardEvent) => keyboardEvent.key === 'Escape' && handleClose()} />

{#if event}
  <div
    class="fixed inset-0 z-40 flex items-end justify-center bg-dark/80 backdrop-blur-md md:items-center"
    role="presentation"
    on:click={handleOverlayClick}
  >
    <div
      class="surface-panel w-full max-h-[90vh] overflow-hidden md:w-[720px]"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="sticky top-0 flex items-center justify-between border-b border-dark-border/60 bg-dark-light/90 px-6 py-4 backdrop-blur">
        <h2 class="text-base font-semibold text-text-soft">Thread</h2>
        <button
          on:click={handleClose}
          class="rounded-xl px-3 py-1 text-sm text-text-muted transition-colors duration-200 hover:bg-dark-lighter/70 hover:text-text-soft"
        >
          Close
        </button>
      </div>

      <!-- Thread -->
      <div class="h-full overflow-y-auto px-4 py-2">
        <div class="space-y-4">
          {#each thread as threadEvent (threadEvent.id)}
            {@const parsed = parseContent(threadEvent)}
            <div class="surface-card border border-dark-border/60 bg-dark-lighter/70 p-5">
              <div class="flex items-start gap-4">
                <!-- User Profile -->
                <div class="flex-shrink-0">
                  <UserProfile pubkey={threadEvent.pubkey} size="md" />
                </div>

                <div class="min-w-0 flex-1">
                  <!-- Header -->
                  <div class="mb-2 flex items-center justify-between">
                    <UserProfile pubkey={threadEvent.pubkey} size="sm" />
                    <span class="flex-shrink-0 text-xs text-text-muted">
                      {formatDate(threadEvent.created_at)}
                    </span>
                  </div>

                  <!-- Content -->
                  <p class="break-words text-sm leading-relaxed text-text-soft">
                    {parsed.text}
                  </p>

                  <!-- Media -->
                  {#if parsed.images.length > 0 || parsed.videos.length > 0 || parsed.embeds.length > 0}
                    <MediaRenderer
                      images={parsed.images}
                      videos={parsed.videos}
                      embeds={parsed.embeds}
                      event={threadEvent}
                    />
                  {/if}

                  <!-- Quoted notes -->
                  {#each parsed.quotes as quoteId (quoteId)}
                    <QuotedNote eventId={quoteId} />
                  {/each}

                  <!-- Interaction buttons -->
                  {#if threadEvent.id === event.id}
                    <div class="mt-4 flex flex-wrap gap-3 text-xs text-text-muted">
                      <button
                        on:click={handleReply}
                        class="inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1 transition-all duration-200 hover:border-primary/50 hover:text-text-soft"
                      >
                        <span aria-hidden="true">⤶</span>
                        Reply
                      </button>
                      <button class="inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1 transition-all duration-200 hover:border-primary/50 hover:text-text-soft">
                        <span aria-hidden="true">🔁</span>
                        Repost
                      </button>
                      <button class="inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1 transition-all duration-200 hover:border-primary/50 hover:text-text-soft">
                        <span aria-hidden="true">❤️</span>
                        Like
                      </button>
                      <button class="inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-1 transition-all duration-200 hover:border-primary/50 hover:text-text-soft">
                        <span aria-hidden="true">⚡</span>
                        Tip
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Reply Input -->
      <div class="border-t border-dark-border/60 bg-dark-light/80 px-6 py-4 backdrop-blur">
        <div class="flex gap-3">
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-xs font-bold text-primary">
            ME
          </div>
          <div class="flex-1">
            <textarea
              placeholder="Reply to this thread..."
              class="w-full resize-none rounded-2xl border border-dark-border bg-dark-lighter px-4 py-3 text-sm text-text-soft placeholder-text-tertiary focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
              rows="3"
            />
            <div class="mt-3 flex justify-end">
              <button class="btn-primary">
                Reply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    overflow: hidden;
  }
</style>
