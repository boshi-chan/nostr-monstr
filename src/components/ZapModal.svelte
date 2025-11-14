<script lang="ts">
  import { showZapModal, zapTarget, nwcConnected, closeZapModal } from '$stores/nwc'
  import { sendZap } from '$lib/nwc'
  import ZapIcon from './icons/ZapIcon.svelte'
  import XIcon from './icons/XIcon.svelte'

  let amount = 21
  let comment = ''
  let sending = false
  let error: string | null = null

  // Preset amounts in sats
  const presets = [21, 100, 500, 1000, 5000]

  let currentTarget: typeof $zapTarget = null
  $: currentTarget = $zapTarget

  function handleOverlayClick() {
    if (!sending) {
      closeZapModal()
    }
  }

  function handleModalClick(event: MouseEvent) {
    event.stopPropagation()
  }

  function handleOverlayKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && !sending) {
      closeZapModal()
    }
  }

  function setAmount(value: number) {
    amount = value
  }

  async function handleSend() {
    if (!currentTarget || sending || !$nwcConnected) return

    try {
      sending = true
      error = null

      await sendZap(
        currentTarget.eventId,
        currentTarget.recipientPubkey,
        amount,
        comment
      )

      // Success - close modal
      closeZapModal()
      amount = 21
      comment = ''
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to send zap'
      logger.error('Zap send error:', err)
    } finally {
      sending = false
    }
  }

  function handleCancel() {
    if (!sending) {
      closeZapModal()
    }
  }
</script>

{#if $showZapModal}
  <div
    role="button"
    tabindex="0"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    on:click={handleOverlayClick}
    on:keydown={handleOverlayKey}
  >
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      role="dialog"
      class="relative w-full max-w-md rounded-2xl border border-dark-border/80 bg-dark-light p-6 shadow-2xl"
      on:click={handleModalClick}
      on:keydown={(e) => e.stopPropagation()}
    >
      <!-- Close button -->
      <button
        on:click={handleCancel}
        class="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-dark-lighter/60 hover:text-text-soft"
        title="Close"
        disabled={sending}
      >
        <XIcon size={18} />
      </button>

      <!-- Header -->
      <div class="mb-6 flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
          <ZapIcon size={24} color="#F79B5E" strokeWidth={1.75} />
        </div>
        <div>
          <h2 class="text-xl font-bold text-text-soft">Send Zap</h2>
          {#if currentTarget?.recipientName}
            <p class="text-sm text-text-muted">to @{currentTarget.recipientName}</p>
          {/if}
        </div>
      </div>

      {#if !$nwcConnected}
        <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p class="text-sm text-amber-200">
            No wallet connected. Configure Nostr Wallet Connect in Settings to send zaps.
          </p>
        </div>
      {:else}
        <!-- Amount selection -->
        <div class="mb-6">
          <!-- svelte-ignore a11y-label-has-associated-control -->
          <label for="zap-amount" class="mb-2 block text-sm font-semibold text-text-soft">
            Amount (sats)
          </label>
          <div class="flex gap-2">
            {#each presets as preset}
              <button
                on:click={() => setAmount(preset)}
                class={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  amount === preset
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'border-dark-border/60 bg-dark/60 text-text-muted hover:border-primary/40 hover:text-text-soft'
                }`}
                disabled={sending}
              >
                {preset}
              </button>
            {/each}
          </div>
          <input
            id="zap-amount"
            type="number"
            bind:value={amount}
            min="1"
            step="1"
            placeholder="Custom amount"
            class="mt-3 w-full rounded-lg border border-dark-border/60 bg-dark/60 px-4 py-2 text-text-soft placeholder-text-muted transition focus:border-primary focus:outline-none"
            disabled={sending}
          />
        </div>

        <!-- Comment -->
        <div class="mb-6">
          <!-- svelte-ignore a11y-label-has-associated-control -->
          <label for="zap-comment" class="mb-2 block text-sm font-semibold text-text-soft">
            Comment (optional)
          </label>
          <textarea
            id="zap-comment"
            bind:value={comment}
            placeholder="Say something nice..."
            rows="3"
            maxlength="280"
            class="w-full resize-none rounded-lg border border-dark-border/60 bg-dark/60 px-4 py-2 text-sm text-text-soft placeholder-text-muted transition focus:border-primary focus:outline-none"
            disabled={sending}
          />
        </div>

        <!-- Error message -->
        {#if error}
          <div class="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3">
            <p class="text-sm text-rose-200">{error}</p>
          </div>
        {/if}

        <!-- Action buttons -->
        <div class="flex gap-3">
          <button
            on:click={handleCancel}
            class="flex-1 rounded-xl border border-dark-border/60 bg-dark/60 px-4 py-2.5 text-sm font-semibold text-text-soft transition hover:bg-dark-lighter/60"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            on:click={handleSend}
            class="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-dark shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
            disabled={sending || !amount || amount < 1}
          >
            {#if sending}
              Sending...
            {:else}
              Send {amount} sats ⚡
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

