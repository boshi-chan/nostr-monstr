<script lang="ts">
  import { fade } from 'svelte/transition'
  import { tick } from 'svelte'
  import { pinPrompt, closePinPrompt } from '$stores/pinPrompt'
  import type { PinPromptRequest } from '$stores/pinPrompt'

  let pin = ''
  let localError: string | null = null
  let pinInput: HTMLInputElement | null = null
  let submitting = false
  let request: PinPromptRequest | null = null
  let lastRequest: PinPromptRequest | null = null
  $: request = $pinPrompt
  $: if (request !== lastRequest) {
    lastRequest = request
    pin = ''
    localError = null
    submitting = false
    if (request) {
      queueMicrotask(() => {
        if (pinInput) {
          pinInput.value = ''
          pinInput.focus()
        }
      })
    }
  }

  function validatePin(value: string): boolean {
    if (!value) {
      localError = 'PIN is required.'
      return false
    }
    if (!/^\d{4,32}$/.test(value)) {
      localError = 'PIN must be 4-32 digits.'
      return false
    }
    localError = null
    return true
  }

  async function submit(): Promise<void> {
    const trimmed = pin.trim()
    if (!validatePin(trimmed)) return
    submitting = true
    await tick()
    closePinPrompt(trimmed)
  }

  function cancel(): void {
    if (request?.allowCancel) {
      closePinPrompt(null)
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!request) return
    if (event.key === 'Escape') {
      cancel()
    } else if (event.key === 'Enter') {
      submit()
    }
  }
</script>

{#if request}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-dark/80 px-4"
    role="dialog"
    aria-modal="true"
    aria-label="Wallet PIN prompt"
    tabindex="-1"
    transition:fade
  >
    <div class="w-full max-w-sm rounded-3xl border border-dark-border/60 bg-dark-light/95 p-6 shadow-2xl">
      <h3 class="text-lg font-semibold text-text-soft mb-2">Enter Wallet PIN</h3>
      <p class="text-sm text-text-muted mb-4 whitespace-pre-line">{request.message}</p>

      <label for="pin-prompt-input" class="block text-xs uppercase tracking-[0.25em] text-text-muted">PIN</label>
      <input
        type="password"
        inputmode="numeric"
        pattern="[0-9]*"
        placeholder="4-32 digits"
        autocomplete="new-password"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        bind:value={pin}
        id="pin-prompt-input"
        bind:this={pinInput}
        class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-primary/60 focus:outline-none disabled:opacity-60"
        disabled={submitting}
      />
      {#if localError}
        <p class="mt-2 text-xs text-rose-300">{localError}</p>
      {/if}

      <div class="mt-6 flex flex-col gap-3 sm:flex-row">
        {#if request.allowCancel}
          <button
            type="button"
            class="rounded-2xl border border-dark-border/60 px-4 py-2 text-sm font-semibold text-text-soft transition hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-50"
            on:click={cancel}
            disabled={submitting}
          >
            Cancel
          </button>
        {/if}
        <button
          type="button"
          class="btn-primary flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-60"
          on:click={submit}
          disabled={submitting}
        >
          {submitting ? 'Checking PIN…' : 'Continue'}
        </button>
      </div>
    </div>
  </div>
{/if}

<svelte:window on:keydown={handleKeydown} />
