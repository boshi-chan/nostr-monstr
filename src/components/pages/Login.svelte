<script lang="ts">
  import { onMount } from 'svelte'
  import { loginWithNostrConnect, loginWithExtension, hasNostrExtension } from '$lib/auth'
  import Button from '../Button.svelte'
  import { toDataURL as qrToDataURL } from 'qrcode'

  let isLoading = false
  let error = ''
  let connectUrl = ''
  let showQR = false
  let hasExtension = false
  let qrDataUrl: string | null = null
  let qrError: string | null = null

  // Check for extensions on component mount
  onMount(() => {
    hasExtension = hasNostrExtension()
  })

  async function handleNostrConnect() {
    try {
      isLoading = true
      error = ''
      connectUrl = await loginWithNostrConnect()
      showQR = true
    } catch (err) {
      error = String(err)
    } finally {
      isLoading = false
    }
  }

  async function handleExtensionLogin() {
    try {
      isLoading = true
      error = ''
      await loginWithExtension()
    } catch (err) {
      error = String(err)
    } finally {
      isLoading = false
    }
  }

  function handleCopyUrl() {
    if (connectUrl) {
      navigator.clipboard.writeText(connectUrl)
      alert('Connection URL copied to clipboard')
    }
  }

  $: if (showQR && connectUrl) {
    qrDataUrl = null
    qrError = null
    qrToDataURL(connectUrl, { margin: 1, scale: 5 })
      .then(url => {
        qrDataUrl = url
      })
      .catch(err => {
        qrError = 'Failed to render QR code'
        console.error('QR generation error', err)
      })
  } else if (!showQR) {
    qrDataUrl = null
    qrError = null
  }
</script>

<div class="min-h-screen bg-bg-primary flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-8">
      <img src="/logo.svg" alt="Monstr" class="h-16 w-16 mx-auto mb-4" />
      <h1 class="text-3xl font-bold text-white">Monstr</h1>
      <p class="text-text-tertiary mt-2">Nostr Client with Monero Embers</p>
    </div>

    <!-- Login Options -->
    <div class="bg-bg-secondary rounded-lg p-6 space-y-6">
      <div>
        <h2 class="text-xl font-semibold text-white mb-2">Login</h2>
        <p class="text-sm text-text-tertiary">
          Connect securely using your Nostr key manager
        </p>
      </div>

      {#if error}
        <div class="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
          {error}
        </div>
      {/if}

      {#if !showQR}
        <!-- Login Options -->
        <div class="space-y-4">
          <!-- Browser Extension Option (if available) -->
          {#if hasExtension}
            <div class="p-4 bg-bg-tertiary rounded-lg border border-primary/30">
              <h3 class="font-semibold text-white mb-2">Browser Extension</h3>
              <p class="text-sm text-text-tertiary mb-4">
                Detected extension ready to use
              </p>
              <Button
                variant="primary"
                size="lg"
                loading={isLoading}
                on:click={handleExtensionLogin}
                className="w-full"
              >
                {isLoading ? 'Connecting...' : 'Sign with Extension'}
              </Button>
            </div>
          {/if}

          <!-- Nostr Connect Option -->
          <div class="p-4 bg-bg-tertiary rounded-lg border border-bg-tertiary/50">
            <h3 class="font-semibold text-white mb-2">Nostr Connect (NIP-46)</h3>
            <p class="text-sm text-text-tertiary mb-4">
              Generate a Nostr Connect URI for Amber or other remote key managers.
            </p>
            <p class="text-xs text-text-tertiary mb-4">
              Uses relays: relay.damus.io, nos.lol, relay.nostr.band, nostr.mom
            </p>
            <Button
              variant="primary"
              size="lg"
              loading={isLoading}
              on:click={handleNostrConnect}
              className="w-full"
            >
              {isLoading ? 'Generating...' : 'Generate Connect URI'}
            </Button>
          </div>

          <!-- Supported Methods -->
          <div class="text-xs text-text-tertiary space-y-1 p-3 bg-bg-tertiary rounded">
            <p class="font-medium text-text-secondary">Supported:</p>
            <ul class="space-y-1">
              <li>✓ Browser extensions (Alby, nos2x, Nostr Garden, etc.)</li>
              <li>✓ Mobile wallets (Amber, Nostros, Primal, etc.)</li>
              <li>✓ Nostr Bunkers</li>
            </ul>
          </div>
        </div>
      {:else}
        <!-- QR Code Display -->
        <div class="space-y-4">
          <div class="p-4 bg-bg-tertiary rounded-lg">
            <p class="text-sm text-text-secondary mb-3">
              Scan with your wallet or copy the connection URL:
            </p>
            <div class="bg-white p-4 rounded-lg mb-3 flex items-center justify-center min-h-64">
              {#if qrDataUrl}
                <img src={qrDataUrl} alt="Nostr Connect QR" class="w-full max-w-xs" />
              {:else if qrError}
                <p class="text-sm text-red-500">{qrError}</p>
              {:else}
                <p class="text-sm text-text-tertiary text-center">
                  Generating QR code...
                </p>
              {/if}
            </div>
            <textarea
              readonly
              value={connectUrl}
              class="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded text-white text-xs resize-none"
              rows="3"
            />
          </div>

          <div class="space-y-2">
            <Button
              variant="primary"
              size="lg"
              on:click={handleCopyUrl}
              className="w-full"
            >
              Copy Connection URL
            </Button>

            <Button
              variant="secondary"
              size="lg"
              on:click={() => (showQR = false)}
              className="w-full"
            >
              Back
            </Button>
          </div>

          <p class="text-xs text-text-tertiary text-center">
            Waiting for wallet connection...
          </p>
        </div>
      {/if}
    </div>

    <!-- Security Info -->
    
  </div>
</div>

<style>
  textarea:readonly {
    cursor: default;
  }
</style>

