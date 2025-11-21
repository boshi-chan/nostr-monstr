<script lang="ts">
  import { extractDomain, hasContentWarning, getContentWarningReason } from '$lib/content'
  import { isFollowing } from '$lib/follows'
  import { mediaFilters } from '$stores/mediaFilters'
  import { feedSource } from '$stores/feedSource'
  import type { NostrEvent } from '$types/nostr'
  import EyeOffIcon from './icons/EyeOffIcon.svelte'

  export let images: string[] = []
  export let videos: string[] = []
  export let embeds: string[] = []
  export let event: NostrEvent

  // Following AI_Guidelines: Component reads from stores
  $: filterKey = ((): 'following' | 'circles' | 'global' | 'profile' => {
    if ($feedSource === 'following' || $feedSource === 'circles' || $feedSource === 'global' || $feedSource === 'profile') {
      return $feedSource
    }
    return 'global'
  })()
  $: currentFilters = $mediaFilters[filterKey]
  $: hasCW = event ? hasContentWarning(event) : false
  $: cwReason = event ? getContentWarningReason(event) : null
  $: isContact = event ? isFollowing(event.pubkey) : false

  // Determine if media should be blurred
  $: shouldBlur =
    currentFilters.blurAll ||
    (currentFilters.respectCW && hasCW) ||
    (currentFilters.blurUnknown && !isContact)

  // Track revealed state per media item
  let revealedImages = new Set<number>()
  let revealedVideos = new Set<number>()

  function revealImage(index: number) {
    revealedImages = new Set([...revealedImages, index])
  }

  function hideImage(index: number) {
    const updated = new Set(revealedImages)
    updated.delete(index)
    revealedImages = updated
  }

  function revealVideo(index: number) {
    revealedVideos = new Set([...revealedVideos, index])
  }

  function hideVideo(index: number) {
    const updated = new Set(revealedVideos)
    updated.delete(index)
    revealedVideos = updated
  }

  function hideBrokenImage(event: Event) {
    const target = event.currentTarget
    if (target instanceof HTMLImageElement) {
      target.style.display = 'none'
    }
  }

  function getWarningMessage(): string {
    if (hasCW && cwReason) {
      return `Content Warning: ${cwReason}`
    }
    if (hasCW) {
      return 'Content Warning'
    }
    if (!isContact) {
      return 'Media from unknown user'
    }
    return 'Sensitive Content'
  }
</script>

<!-- Images -->
{#if images.length > 0}
  <div class="mt-4 grid grid-cols-2 gap-3">
    {#each images as image, index (index)}
      {@const isBlurred = shouldBlur && !revealedImages.has(index)}
      {@const wasRevealed = shouldBlur && revealedImages.has(index)}
      <div class="relative overflow-hidden rounded-2xl border border-dark-border bg-dark-lighter">
        <button
          type="button"
          class="block h-full w-full overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/40"
          on:click|stopPropagation={() => {
            if (isBlurred) {
              revealImage(index)
            } else {
              window.open(image, '_blank')
            }
          }}
        >
          <img
            src={image}
            alt="Media attachment"
            class={`h-auto w-full max-h-96 rounded-2xl object-cover transition-all duration-200 ${
              isBlurred ? 'blur-3xl scale-110 brightness-75' : 'hover:opacity-90'
            }`}
            on:error={hideBrokenImage}
          />
          {#if isBlurred}
            <div class="absolute inset-0 flex flex-col items-center justify-center bg-dark/60 backdrop-blur-sm">
              <EyeOffIcon size={32} color="currentColor" />
              <p class="mt-3 px-4 text-center text-sm font-medium text-text-soft">
                {getWarningMessage()}
              </p>
              <p class="mt-1 text-xs text-text-muted">Click to reveal</p>
            </div>
          {/if}
        </button>
        {#if wasRevealed}
          <button
            type="button"
            class="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-dark/80 px-2 py-1 text-xs font-medium text-text-soft backdrop-blur-sm transition-colors hover:bg-dark/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
            on:click|stopPropagation={() => hideImage(index)}
            aria-label="Hide image"
          >
            <EyeOffIcon size={12} />
            <span>Hide</span>
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<!-- Videos -->
{#if videos.length > 0}
  <div class="mt-4 space-y-3">
    {#each videos as video, index (index)}
      {@const isBlurred = shouldBlur && !revealedVideos.has(index)}
      {@const wasRevealed = shouldBlur && revealedVideos.has(index)}
      <div class="relative aspect-video overflow-hidden rounded-2xl border border-dark-border bg-dark-lighter">
        {#if isBlurred}
          <button
            type="button"
            class="absolute inset-0 flex flex-col items-center justify-center bg-dark/80 backdrop-blur-sm transition-colors hover:bg-dark/70 focus:outline-none focus:ring-2 focus:ring-primary/40"
            on:click|stopPropagation={() => revealVideo(index)}
          >
            <EyeOffIcon size={32} color="currentColor" />
            <p class="mt-3 px-4 text-center text-sm font-medium text-text-soft">
              {getWarningMessage()}
            </p>
            <p class="mt-1 text-xs text-text-muted">Click to reveal</p>
          </button>
        {:else}
          <!-- svelte-ignore a11y-media-has-caption -->
          <video src={video} controls class="h-full w-full object-cover" />
          {#if wasRevealed}
            <button
              type="button"
              class="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-dark/80 px-2 py-1 text-xs font-medium text-text-soft backdrop-blur-sm transition-colors hover:bg-dark/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
              on:click|stopPropagation={() => hideVideo(index)}
              aria-label="Hide video"
            >
              <EyeOffIcon size={12} />
              <span>Hide</span>
            </button>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
{/if}

<!-- Embeds/Links -->
{#if embeds.length > 0}
  <div class="mt-4 space-y-2 text-sm">
    {#each embeds as embed, index (index)}
      <a
        href={embed}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex w-full items-center gap-2 break-all rounded-xl border border-dark-border/60 px-3 py-2 text-primary/90 transition-colors hover:border-primary/60 hover:text-primary"
      >
        <span class="text-[10px] uppercase tracking-[0.35em] text-text-muted/80">
          {extractDomain(embed)}
        </span>
        <span class="flex-1">{embed}</span>
      </a>
    {/each}
  </div>
{/if}

<style>
  img,
  video {
    user-select: none;
  }
</style>
