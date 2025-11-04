<script lang="ts">
  export let isOpen = false
  export let title = ''
  export let onClose: (() => void) | null = null

  function handleBackdropClick() {
    if (onClose) {
      onClose()
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50">
    <button
      type="button"
      class="absolute inset-0 w-full h-full bg-transparent cursor-default"
      aria-label="Close modal"
      on:click={handleBackdropClick}
    />
    <div
      class="relative bg-dark rounded-t-2xl md:rounded-2xl w-full md:w-96 max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up"
      on:pointerdown|stopPropagation
    >
      <!-- Header -->
      <div class="sticky top-0 flex items-center justify-between p-4 border-b border-dark-light bg-dark">
        <h2 class="text-xl font-bold text-white">{title}</h2>
        <button
          class="text-gray-400 hover:text-white transition-colors"
          on:click={handleBackdropClick}
        >
          ✕
        </button>
      </div>

      <!-- Content -->
      <div class="p-4">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  :global(.animate-slide-up) {
    animation: slideUp 0.3s ease-out;
  }
</style>
