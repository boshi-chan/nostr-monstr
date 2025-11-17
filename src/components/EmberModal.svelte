<script lang="ts">
  import { fade } from 'svelte/transition'
  import { walletState, showEmberModal, emberTarget } from '$stores/wallet'
  import { sendMonero } from '$lib/wallet/lazy'
  import { incrementEmberTotal } from '$stores/ember'
  import EmberIcon from './icons/EmberIcon.svelte'
  import { EMBER_PRESET_AMOUNTS, generateMoneroPaymentURI, isValidMoneroTxHash } from '$lib/ember'
  import { navigateToPage } from '$stores/router'
  import QRCode from 'qrcode'
  import { currentUser } from '$stores/auth'
  import { getNDK } from '$lib/ndk'
  import { EMBER_EVENT_KIND, encodeEmberPayload, type EmberReceiptPayload } from '$lib/ember'
  import { NDKEvent } from '@nostr-dev-kit/ndk'

  type TabMode = 'monstr' | 'external'

  let activeTab: TabMode = 'monstr'
  let amountInput = '0.001'
  let noteInput = ''
  let txHashInput = ''
  let error: string | null = null
  let success: string | null = null
  let loading = false
  let qrDataUrl: string | null = null

  $: isOpen = $showEmberModal
  $: target = $emberTarget
  $: paymentURI = target?.address && Number(amountInput) > 0
    ? generateMoneroPaymentURI(
        target.address,
        Number(amountInput),
        noteInput.trim() || `Tip for ${target.noteId ? 'post' : 'user'}`
      )
    : ''

  // Generate QR code when payment URI changes
  $: if (activeTab === 'external' && paymentURI) {
    generateQRCode(paymentURI)
  }

  async function generateQRCode(uri: string): Promise<void> {
    try {
      qrDataUrl = await QRCode.toDataURL(uri, {
        width: 256,
        margin: 2,
        color: {
          dark: '#ffffff',
          light: '#1a1a1a',
        },
      })
    } catch (err) {
      console.error('Failed to generate QR code:', err)
      qrDataUrl = null
    }
  }

  function closeModal(): void {
    showEmberModal.set(false)
    activeTab = 'monstr'
    amountInput = '0.001'
    noteInput = ''
    txHashInput = ''
    error = null
    success = null
    qrDataUrl = null
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
      console.error('Failed to send Ember', err)
      error = err instanceof Error ? err.message : 'Unable to send Ember.'
    } finally {
      loading = false
    }
  }

  async function handleExternalSubmit(): Promise<void> {
    if (!target?.address) {
      error = 'Recipient has not published a Monero address.'
      return
    }

    const amount = Number(amountInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      error = 'Enter a valid amount of XMR.'
      return
    }

    const txHash = txHashInput.trim()
    if (!txHash) {
      error = 'Please enter the transaction hash from your wallet.'
      return
    }

    if (!isValidMoneroTxHash(txHash)) {
      error = 'Invalid transaction hash format. Should be 64 hex characters.'
      return
    }

    loading = true
    error = null
    success = null

    try {
      // If user is authenticated, publish receipt event
      if ($currentUser) {
        const ndk = getNDK()
        if (ndk && ndk.signer) {
          const atomicAmount = (BigInt(Math.floor(amount * 1_000_000_000_000))).toString()

          const payload: EmberReceiptPayload = {
            senderPubkey: $currentUser.pubkey,
            recipientPubkey: target.recipientPubkey ?? undefined,
            noteId: target.noteId ?? undefined,
            txHash,
            amountAtomic: atomicAmount,
            createdAt: Math.floor(Date.now() / 1000),
          }

          const event = new NDKEvent(ndk)
          event.kind = EMBER_EVENT_KIND
          event.content = encodeEmberPayload(payload)
          event.tags = [
            ['emberxmr'],
            ...(target.recipientPubkey ? [['p', target.recipientPubkey]] : []),
            ...(target.noteId ? [['e', target.noteId]] : []),
          ]
          event.created_at = payload.createdAt

          await event.sign()
          await event.publish()

          if (target.noteId) {
            incrementEmberTotal(target.noteId, amount)
          }
        }
      }

      success = 'Thank you! Your Ember has been recorded.'
      setTimeout(() => {
        closeModal()
      }, 2000)
    } catch (err) {
      console.error('Failed to submit external Ember receipt', err)
      error = err instanceof Error ? err.message : 'Unable to record Ember.'
    } finally {
      loading = false
    }
  }

  function openInWallet(): void {
    if (!paymentURI) return
    window.location.href = paymentURI
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

      <!-- Tab Navigation -->
      <nav class="mt-4 flex gap-2 border-b border-dark-border/40 pb-2">
        <button
          type="button"
          class={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'monstr'
              ? 'bg-orange-500/10 text-orange-300 border border-orange-400/40'
              : 'text-text-muted hover:text-text-soft hover:bg-dark/40'
          }`}
          on:click={() => { activeTab = 'monstr'; error = null; success = null; }}
        >
          Monstr Wallet
        </button>
        <button
          type="button"
          class={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'external'
              ? 'bg-orange-500/10 text-orange-300 border border-orange-400/40'
              : 'text-text-muted hover:text-text-soft hover:bg-dark/40'
          }`}
          on:click={() => { activeTab = 'external'; error = null; success = null; }}
        >
          External Wallet
        </button>
      </nav>

      <!-- Monstr Wallet Tab -->
      {#if activeTab === 'monstr'}
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
                  navigateToPage('settings')
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
      {/if}

      <!-- External Wallet Tab -->
      {#if activeTab === 'external'}
        <section class="mt-6 space-y-5">
          {#if !target?.address}
            <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              Recipient has not published a Monero address in their profile.
            </div>
          {:else}
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

            {#if qrDataUrl && paymentURI}
              <div class="flex flex-col items-center gap-3">
                <div class="rounded-2xl bg-white p-3">
                  <img src={qrDataUrl} alt="Monero Payment QR Code" class="h-64 w-64" />
                </div>
                <p class="text-xs text-text-muted text-center px-4">
                  Scan with your Monero wallet or use the button below to open your mobile wallet
                </p>
              </div>

              <button
                type="button"
                class="w-full rounded-2xl bg-orange-500/20 border border-orange-400/40 px-4 py-3 text-sm font-semibold text-orange-200 transition hover:bg-orange-500/30"
                on:click={openInWallet}
              >
                Open in Wallet App
              </button>
            {/if}

            <div>
              <label for="tx-hash" class="text-xs uppercase tracking-[0.25em] text-text-muted">
                Transaction Hash <span class="text-text-muted/60 normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="tx-hash"
                type="text"
                class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft font-mono focus:border-orange-400/60 focus:outline-none"
                bind:value={txHashInput}
                placeholder="Paste TX hash to record your tip on Nostr"
                maxlength="64"
              />
              <p class="mt-1 text-xs text-text-muted/60">
                You can close without submitting proof. Your payment is complete once sent from your wallet.
              </p>
            </div>

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
                {txHashInput.trim() ? 'Skip Proof' : 'Done'}
              </button>
              {#if txHashInput.trim()}
                <button
                  type="button"
                  class="btn-primary flex-1 justify-center disabled:opacity-50"
                  on:click={handleExternalSubmit}
                  disabled={loading}
                >
                  {loading ? 'Recording…' : 'Submit Proof'}
                </button>
              {/if}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </div>
{/if}

<svelte:window on:keydown={handleKeydown} />

