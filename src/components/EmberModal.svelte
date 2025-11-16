<script lang="ts">
  import { fade } from 'svelte/transition'
  import { walletState, showEmberModal, showWallet, emberTarget } from '$stores/wallet'
  import { sendMonero } from '$lib/wallet/lazy'
  import { incrementEmberTotal } from '$stores/ember'
  import EmberIcon from './icons/EmberIcon.svelte'
  import { EMBER_PRESET_AMOUNTS } from '$lib/ember'

  let amountInput = '0.001'
  let noteInput = ''
  let error: string | null = null
  let success: string | null = null
  let loading = false

  $: isOpen = $showEmberModal
  $: target = $emberTarget

  function closeModal(): void {
    showEmberModal.set(false)
    amountInput = '0.001'
    noteInput = ''
    error = null
    success = null
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!isOpen) return
    if (event.key === 'Escape') {
      closeModal()
    }
  }

  function selectPreset(amount: number): void {
    amountInput = amount.toString()
  }

  async function handleSend(): Promise<void> {
    if (!target?.address) {
      error = 'Recipient has not published a Monero address in their profile or bio.'
      return
    }

    const amount = Number(amountInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      error = 'Enter a valid amount of XMR.'
      return
    }

    if (!$walletState.isReady) {
      error = 'Open your wallet and let it finish syncing first.'
      return
    }

    loading = true
    error = null
    success = null

    try {
      await sendMonero({
        address: target.address,
        amount,
        note: noteInput.trim() || undefined,
        recipientPubkey: target.recipientPubkey ?? undefined,
        noteId: target.noteId ?? undefined,
      })
      if (target.noteId) {
        incrementEmberTotal(target.noteId, amount)
      }
      success = 'Ember sent!'
      setTimeout(() => {
        closeModal()
      }, 1000)
    } catch (err) {
      logger.error('Failed to send Ember', err)
      error = err instanceof Error ? err.message : 'Unable to send Ember.'
    } finally {
      loading = false
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4" aria-modal="true" aria-labelledby="ember-modal-title" role="dialog" transition:fade>
    <button
      type="button"
      class="absolute inset-0 bg-dark/80 backdrop-blur-md"
      aria-label="Close ember modal"
      on:click={closeModal}
    ></button>

    <div class="relative w-full max-w-md rounded-3xl border border-dark-border/60 bg-dark-light/95 p-6 shadow-2xl">
      <header class="flex items-center justify-between gap-4">
        <div>
          <h2 id="ember-modal-title" class="text-lg font-semibold text-text-soft flex items-center gap-2">
            <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-orange-400">
              <EmberIcon size={18} color="currentColor" strokeWidth={1.75} />
            </span>
            Send an Ember
          </h2>
          <p class="text-sm text-text-muted/75">
            {#if target?.noteId}
              Fuel this post with a quick Monero tip.
            {:else}
              Send Monero directly.
            {/if}
          </p>
        </div>
        <button
          type="button"
          class="rounded-full bg-dark/60 px-3 py-1 text-sm text-text-muted transition hover:bg-dark/80 hover:text-text-soft"
          on:click={closeModal}
        >
          Close
        </button>
      </header>

      <section class="mt-6 space-y-5">
        <div>
          <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Amount</p>
          <div class="mt-3 grid grid-cols-3 gap-2">
            {#each EMBER_PRESET_AMOUNTS as preset}
              <button
                type="button"
                class={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                  Number(amountInput) === preset
                    ? 'border-orange-400 bg-orange-500/10 text-orange-200'
                    : 'border-dark-border/60 text-text-muted hover:text-text-soft'
                }`}
                on:click={() => selectPreset(preset)}
              >
                {preset} XMR
              </button>
            {/each}
          </div>
          <input
            type="number"
            min="0"
            step="0.000001"
            class="mt-3 w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-orange-400/60 focus:outline-none"
            bind:value={amountInput}
            placeholder="Custom amount"
          />
        </div>

        <div>
          <label for="ember-note" class="text-xs uppercase tracking-[0.25em] text-text-muted">
            Message (optional)
          </label>
          <textarea
            id="ember-note"
            rows="2"
            class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 p-3 text-sm text-text-soft focus:border-orange-400/60 focus:outline-none"
            bind:value={noteInput}
            maxlength={280}
            placeholder="Say thanks or leave a note"
          />
        </div>

        {#if !$walletState.isReady}
          <div class="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Finish wallet setup before sending Embers.
            <button
              type="button"
              class="ml-2 text-amber-200 underline"
              on:click={() => {
                showWallet.set(true)
                closeModal()
              }}
            >
              Open wallet
            </button>
          </div>
        {/if}

        {#if error}
          <p class="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>
        {/if}
        {#if success}
          <p class="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</p>
        {/if}

        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 rounded-2xl border border-dark-border/60 px-4 py-2 text-sm font-semibold text-text-muted transition hover:border-text-soft hover:text-text-soft"
            on:click={closeModal}
          >
            Cancel
          </button>
          <button
            type="button"
            class="btn-primary flex-1 justify-center disabled:opacity-50"
            on:click={handleSend}
            disabled={loading || !$walletState.isReady}
          >
            {loading ? 'Sending…' : 'Send Ember'}
          </button>
        </div>
      </section>
    </div>
  </div>
{/if}

<svelte:window on:keydown={handleKeydown} />

