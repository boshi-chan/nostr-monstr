<script lang="ts">
  import { onMount } from 'svelte'
  import Button from '../Button.svelte'
  import { loginWithExtension, hasNostrExtension, loginWithAmberNative } from '$lib/auth'
  import { loginWithPrivateKey } from '$lib/ndk'
  import { nip19 } from 'nostr-tools'
  import { isCapacitorAndroid, getAmberInstallStatus } from '$lib/amber-signer'

  export let onSuccess: (() => void) | undefined = undefined
  export let onCancel: (() => void) | undefined = undefined

  let isLoading = false
  let error = ''
  let hasExtension = false
  let hasAmberNative = false
  let amberDiagnostics: string | null = null
  let nativeAmberError: string | null = null
  let forceAmberNative = false
  let isCapAndroid = false
  let nsecInput = ''
  let nsecError: string | null = null

  onMount(async () => {
    hasExtension = hasNostrExtension()
    isCapAndroid = isCapacitorAndroid()

    if (isCapAndroid) {
      try {
        const status = await getAmberInstallStatus()
        hasAmberNative = status.installed
        amberDiagnostics = `packageFound=${status.packageFound ?? 'unknown'}, intentAvailable=${status.intentAvailable ?? 'unknown'}`
        nativeAmberError = status.installed ? null : 'Amber app not detected. Install Amber to use native signing.'
      } catch (err) {
        console.error('[Login] Error checking Amber:', err)
        nativeAmberError = err instanceof Error ? err.message : 'Failed to detect Amber native signer.'
        hasAmberNative = false
      }
    }
  })

  async function handleExtensionLogin(): Promise<void> {
    if (!hasExtension) {
      error = 'No NIP-07 extension detected.'
      return
    }
    try {
      isLoading = true
      error = ''
      await loginWithExtension()
      onSuccess?.()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Extension login failed'
    } finally {
      isLoading = false
    }
  }

  async function handleAmberNativeLogin(): Promise<void> {
    try {
      isLoading = true
      error = ''
      await loginWithAmberNative({ force: forceAmberNative })
      onSuccess?.()
    } catch (err) {
      error = err instanceof Error ? err.message : 'Amber login failed'
    } finally {
      isLoading = false
    }
  }

  function forceAmberOverride(): void {
    forceAmberNative = true
    hasAmberNative = true
    nativeAmberError = null
    amberDiagnostics = 'forced override'
  }

  function decodePrivateKey(raw: string): string {
    const trimmed = raw.trim()
    if (!trimmed) {
      throw new Error('Private key is required')
    }
    if (trimmed.toLowerCase().startsWith('nsec')) {
      const decoded = nip19.decode(trimmed)
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec key')
      }
      const data = decoded.data
      if (typeof data === 'string') {
        return data
      }
      if (data instanceof Uint8Array) {
        return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')
      }
      throw new Error('Unsupported nsec payload')
    }
    return trimmed
  }

  async function handlePrivateKeyLogin(): Promise<void> {
    try {
      isLoading = true
      nsecError = null
      const secret = decodePrivateKey(nsecInput)
      if (!/^[0-9a-f]{64}$/i.test(secret)) {
        throw new Error('Private key must be a 64-character hex string')
      }
      await loginWithPrivateKey(secret)
      nsecInput = ''
      onSuccess?.()
    } catch (err) {
      nsecError = err instanceof Error ? err.message : 'Failed to use private key'
    } finally {
      isLoading = false
    }
  }

  function handleCancel(): void {
    if (onCancel) {
      onCancel()
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back()
    }
  }
</script>

<div class="mx-auto w-full max-w-2xl py-6" style="padding-top: calc(env(safe-area-inset-top, 0px) + 1rem);">
  <div class="rounded-3xl border border-dark-border/60 bg-dark-light/80 p-6 shadow-xl">
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Login</p>
        <h2 class="text-2xl font-semibold text-white">Connect securely using your Nostr key manager</h2>
      </div>
      <button
        type="button"
        class="rounded-full border border-dark-border/60 px-3 py-1 text-xs uppercase tracking-wide text-text-soft hover:text-white"
        on:click={handleCancel}
      >
        Cancel
      </button>
    </div>

    {#if error}
      <div class="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error}
      </div>
    {/if}

    <div class="space-y-5">
      {#if isCapAndroid}
        <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-4">
          <div class="mb-2 text-text-soft">
            <h3 class="text-lg font-semibold">Amber (Native)</h3>
          </div>
          <p class="text-sm text-text-muted mb-4">Sign directly with Amber – instant, no relay delays.</p>

          <Button
            variant="primary"
            size="lg"
            loading={isLoading}
            on:click={() => {
              if (nativeAmberError) {
                forceAmberOverride()
              }
              void handleAmberNativeLogin()
            }}
            className="w-full"
            disabled={isLoading}
          >
            {nativeAmberError ? (isLoading ? 'Opening Amber…' : 'Open Amber') : (isLoading ? 'Connecting…' : 'Sign with Amber')}
          </Button>
        </div>
      {:else}
        <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-4">
          <div class="mb-2 flex items-center justify-between text-text-soft">
            <h3 class="text-lg font-semibold">Browser Extension</h3>
            <span class="text-[10px] uppercase tracking-widest text-text-muted">NIP-07</span>
          </div>
          <p class="text-sm text-text-muted mb-4">Use Alby, nos2x, Flamingo, or another NIP-07 extension to sign in.</p>

          <Button
            variant="primary"
            size="lg"
            loading={isLoading}
            on:click={handleExtensionLogin}
            className="w-full"
            disabled={isLoading || !hasExtension}
          >
            {hasExtension ? (isLoading ? 'Connecting...' : 'Sign with Extension') : 'No Extension Detected'}
          </Button>

          {#if !hasExtension}
            <p class="mt-2 text-xs text-red-300">
              Install a NIP-07 browser extension (e.g., Alby) and refresh this page.
            </p>
          {/if}
        </div>
      {/if}

      <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-4">
        <div class="mb-2 flex items-center justify-between text-text-soft">
          <h3 class="text-lg font-semibold">Private Key (nsec)</h3>
          <span class="text-[10px] uppercase tracking-[0.3em] text-red-300">Not Recommended</span>
        </div>
        <p class="text-xs text-text-muted mb-2">
          Paste your raw 64-char hex key or nsec. Only use this if you fully trust this device.
        </p>
        <textarea
          rows="2"
          class="w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
          placeholder="nsec1..."
          bind:value={nsecInput}
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        ></textarea>
        {#if nsecError}
          <p class="mt-2 text-xs text-rose-300">{nsecError}</p>
        {/if}
        <Button
          variant="secondary"
          size="lg"
          className="mt-3 w-full"
          loading={isLoading}
          on:click={handlePrivateKeyLogin}
          disabled={isLoading || !nsecInput.trim()}
        >
          {isLoading ? 'Checking PIN…' : 'Login with nsec (not recommended)'}
        </Button>
      </div>

      <div class="rounded-2xl border border-dark-border/40 bg-dark/40 p-3 text-xs text-text-muted">
        {#if isCapAndroid}
          Supported: Amber native signer.
        {:else}
          Supported: Browser extensions (Alby, nos2x, Flamingo, etc.).
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  textarea:readonly {
    cursor: default;
  }
</style>

