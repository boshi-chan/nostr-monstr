<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import {  loginWithExtension, hasNostrExtension, startNostrConnectLogin, finishNostrConnectLogin } from '$lib/auth'
  import Button from '../Button.svelte'
  import { toDataURL as qrToDataURL } from 'qrcode'
  import type { NDKNip46Signer } from '@nostr-dev-kit/ndk'

  let isLoading = false
  let error = ''
  let connectUrl = ''
  let showQR = false
  let hasExtension = false
  let qrDataUrl: string | null = null
  let qrError: string | null = null
  let currentSigner: NDKNip46Signer | null = null
  let connectionStatus = 'waiting' // waiting | connecting | connected | error

  // Check for extensions on component mount
  onMount(() => {
    hasExtension = hasNostrExtension()
  })

  // Cleanup on destroy
  onDestroy(() => {
    if (currentSigner) {
      currentSigner.stop()
      currentSigner = null
    }
  })

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

  async function handleMobileSignerLogin() {
    try {
      isLoading = true
      error = ''
      connectionStatus = 'waiting'

      // Start the Nostr Connect flow
      const result = await startNostrConnectLogin()
      currentSigner = result.signer
      connectUrl = result.uri

      // Show QR code
      showQR = true
      isLoading = false

      // Wait for connection in background
      connectionStatus = 'connecting'
      await finishNostrConnectLogin(result.signer)
      connectionStatus = 'connected'

      // Login successful - component will be unmounted as user is authenticated
    } catch (err) {
      connectionStatus = 'error'
      error = String(err)
      showQR = false
      isLoading = false
      if (currentSigner) {
        currentSigner.stop()
        currentSigner = null
      }
    }
  }

  function handleCancelMobileSigner() {
    if (currentSigner) {
      currentSigner.stop()
      currentSigner = null
    }
    showQR = false
    connectUrl = ''
    connectionStatus = 'waiting'
    error = ''
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

          <!-- Mobile Signer Option -->
          <div class="p-4 bg-bg-tertiary rounded-lg border border-dark-border/60">
            <h3 class="font-semibold text-white mb-2">Mobile Signer</h3>
            <p class="text-sm text-text-tertiary mb-4">
              Connect with Amber or other mobile signers via QR code
            </p>
            <Button
              variant="secondary"
              size="lg"
              loading={isLoading}
              on:click={handleMobileSignerLogin}
              className="w-full"
            >
              {isLoading ? 'Generating...' : 'Connect Mobile Signer'}
            </Button>
          </div>

          <!-- Supported Methods -->
          <div class="text-xs text-text-tertiary space-y-1 p-3 bg-bg-tertiary rounded">
            <p class="font-medium text-text-secondary">Supported:</p>
            <ul class="space-y-1">
              <li>Browser extensions (Alby, nos2x, Flamingo, etc.)</li>
              <li>Mobile signers (Amber, Keystache, etc.)</li>
            </ul>
          </div>
        </div>
      {:else}
        <!-- QR Code Display -->
        <div class="space-y-4">
          <div class="p-4 bg-bg-tertiary rounded-lg">
            <p class="text-sm text-text-secondary mb-3">
              Scan this QR code with your mobile signer app (e.g., Amber):
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

            <!-- Connection Status -->
            {#if connectionStatus === 'connecting'}
              <div class="p-3 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-sm text-center">
                <div class="flex items-center justify-center gap-2">
                  <div class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Waiting for approval from your mobile signer...</span>
                </div>
              </div>
            {:else if connectionStatus === 'connected'}
              <div class="p-3 bg-green-500/10 border border-green-500/20 rounded text-green-400 text-sm text-center">
                ✓ Connected! Logging you in...
              </div>
            {/if}

            <textarea
              readonly
              value={connectUrl}
              class="w-full px-3 py-2 bg-bg-primary border border-bg-tertiary rounded text-white text-xs resize-none mt-3"
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
              on:click={handleCancelMobileSigner}
              className="w-full"
              disabled={connectionStatus === 'connecting'}
            >
              Cancel
            </Button>
          </div>

          <div class="text-xs text-text-tertiary text-center space-y-1">
            <p class="font-medium">Instructions:</p>
            <ol class="list-decimal list-inside space-y-1 text-left max-w-sm mx-auto">
              <li>Open your mobile signer app (Amber, Keystache, etc.)</li>
              <li>Scan the QR code above or paste the connection URL</li>
              <li>Approve the connection request in your app</li>
            </ol>
          </div>
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

