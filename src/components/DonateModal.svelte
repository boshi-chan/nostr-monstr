<script lang="ts">
  import { fade } from 'svelte/transition'
  import { toDataURL as qrToDataURL } from 'qrcode'
  import { showDonateModal } from '$stores/modals'

  const supportNpub = 'npub1zwphufj02nwm9fy0hr8879l74ky7kqz50lz8wdyeu79gsa7zz3esu2s3t5'
  const donateAddress =
    '89J6rmkNi6NK5ZCGNd1NNzYAMAJpQtZW4QL35Q1kviSy4nCmBrmfTNy7RdF8HeNNznYdvMmYME7ANbGuyhX65gpf2Wj3epP'

  let qrDataUrl: string | null = null
  let copyState: 'idle' | 'copied' | 'error' = 'idle'

  $: if ($showDonateModal && !qrDataUrl) {
    void generateQr()
  }

  async function generateQr(): Promise<void> {
    try {
      qrDataUrl = await qrToDataURL(donateAddress, { margin: 1, scale: 5 })
    } catch (err) {
      logger.warn('Failed to render donation QR', err)
    }
  }

  async function copyAddress(): Promise<void> {
    try {
      await navigator.clipboard.writeText(donateAddress)
      copyState = 'copied'
      setTimeout(() => (copyState = 'idle'), 1500)
    } catch (err) {
      copyState = 'error'
      logger.warn('Failed to copy donate address', err)
      setTimeout(() => (copyState = 'idle'), 2000)
    }
  }

  function close(): void {
    showDonateModal.set(false)
    copyState = 'idle'
  }
</script>

{#if $showDonateModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
    transition:fade
    role="button"
    tabindex="0"
    aria-label="Close donate modal"
    on:click|self={close}
    on:keydown={(event) => (event.key === 'Escape' ? close() : null)}
  >
    <div class="w-[92%] max-w-md rounded-2xl border border-amber-400/30 bg-dark px-6 py-6 text-center shadow-2xl shadow-black/50">
      <h2 class="text-base font-semibold text-white">Support Monstr</h2>
      <p class="mt-3 text-sm text-text-soft">
        This project is maintained entirely by boseph (<span class="font-mono text-[11px] text-emerald-200 break-all">{supportNpub}</span>)
        because he think it's fun. If you'd like to help support him and keep development going, donate here:
      </p>
      <div class="mt-4 flex flex-col items-center gap-3">
        {#if qrDataUrl}
          <img src={qrDataUrl} alt="Donation QR" class="h-40 w-40 rounded-xl border border-amber-200/30 bg-white/95 p-3" />
        {:else}
          <div class="h-40 w-40 animate-pulse rounded-xl border border-amber-200/30 bg-dark/60"></div>
        {/if}
        <p class="break-words rounded-lg bg-dark/60 px-3 py-2 text-[11px] font-mono text-text-soft">
          {donateAddress}
        </p>
        <button
          type="button"
          class="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
          on:click={() => copyAddress()}
        >
          {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Copy failed' : 'Copy address'}
        </button>
      </div>
      <button
        type="button"
        class="mt-5 w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-text-soft transition hover:bg-white/10"
        on:click={close}
      >
        Close
      </button>
    </div>
  </div>
{/if}
