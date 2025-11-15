<script lang="ts">
  import { fade } from 'svelte/transition'
  import { showCanaryModal } from '$stores/modals'

  function close(): void {
    showCanaryModal.set(false)
  }
</script>

{#if $showCanaryModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    transition:fade
    role="button"
    tabindex="0"
    aria-label="Close canary modal"
    on:click|self={close}
    on:keydown={(event) => (event.key === 'Escape' ? close() : null)}
  >
    <div class="w-[90%] max-w-sm rounded-2xl border border-emerald-400/40 bg-dark px-6 py-6 text-center shadow-2xl shadow-black/40">
    
      <p class="mt-3 text-sm text-text-soft">
        Canary says <span class="font-semibold text-emerald-300">"Chirp chirp"</span>
      </p>
      <button
        type="button"
        class="mt-6 w-full rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        on:click={close}
      >
        Close
      </button>
    </div>
  </div>
{/if}
