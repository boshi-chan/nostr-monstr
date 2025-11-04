<script lang="ts">
  import { extractDomain } from '$lib/content'

  export let images: string[] = []
  export let videos: string[] = []
  export let embeds: string[] = []

  function hideBrokenImage(event: Event) {
    const target = event.currentTarget
    if (target instanceof HTMLImageElement) {
      target.style.display = 'none'
    }
  }
</script>

<!-- Images -->
{#if images.length > 0}
  <div class="mt-4 grid grid-cols-2 gap-3">
    {#each images as image (image)}
      <div class="relative overflow-hidden rounded-2xl border border-dark-border bg-dark-lighter">
        <button
          type="button"
          class="block h-full w-full overflow-hidden rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/40"
          on:click={() => window.open(image, '_blank')}
        >
          <img
            src={image}
            alt="Media attachment"
            class="h-auto w-full max-h-96 rounded-2xl object-cover transition-opacity hover:opacity-90"
            on:error={hideBrokenImage}
          />
        </button>
      </div>
    {/each}
  </div>
{/if}

<!-- Videos -->
{#if videos.length > 0}
  <div class="mt-4 space-y-3">
    {#each videos as video (video)}
      <div class="relative aspect-video overflow-hidden rounded-2xl border border-dark-border bg-dark-lighter">
        <!-- svelte-ignore a11y-media-has-caption -->
        <video src={video} controls class="h-full w-full object-cover" />
      </div>
    {/each}
  </div>
{/if}

<!-- Embeds/Links -->
{#if embeds.length > 0}
  <div class="mt-4 space-y-3">
    {#each embeds as embed (embed)}
      <a
        href={embed}
        target="_blank"
        rel="noopener noreferrer"
        class="block rounded-2xl border border-dark-border bg-dark-lighter p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60"
      >
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 text-sm text-primary">
            🌐
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-text-soft">
              {extractDomain(embed)}
            </p>
            <p class="truncate text-xs text-text-muted">
              {embed}
            </p>
          </div>
        </div>
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
