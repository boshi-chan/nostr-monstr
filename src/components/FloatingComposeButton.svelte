<script lang="ts">
  import { activeTab } from '$stores/nav'
  import { showCompose } from '$stores/feed'
  import SquarePenIcon from './icons/SquarePenIcon.svelte'
  import type { NavTab } from '$stores/nav'

  let currentTab: NavTab = 'home'
  $: currentTab = $activeTab

  // Only show on feed pages (home and long-reads)
  let shouldShow = false
  $: shouldShow = currentTab === 'home' || currentTab === 'long-reads'

  function handleCompose() {
    showCompose.set(true)
  }
</script>

{#if shouldShow}
  <button
    on:click={handleCompose}
    class="compose-button fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-dark shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl md:bottom-6 md:right-6 md:h-16 md:w-16"
    title="Compose"
    aria-label="Compose new post"
  >
    <SquarePenIcon size={24} color="currentColor" strokeWidth={1.75} />
  </button>
{/if}

<style>
  .compose-button {
    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
  }

  @media (min-width: 768px) {
    .compose-button {
      bottom: 1.5rem;
    }
  }
</style>
