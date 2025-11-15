<script lang="ts">
  import { onMount } from 'svelte'
  import { loginWithExtension, hasNostrExtension } from '$lib/auth'
  import Button from '../Button.svelte'

  let isLoading = false
  let error = ''
  let hasExtension = false

  onMount(() => {
    hasExtension = hasNostrExtension()
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
</script>

<div class="min-h-screen bg-bg-primary flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <div class="text-center mb-8">
      <img src="/logo.svg" alt="Monstr" class="h-16 w-16 mx-auto mb-4" />
      <h1 class="text-3xl font-bold text-white">Monstr</h1>
      <p class="text-text-tertiary mt-2">Nostr Client with Monero Embers</p>
    </div>

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

      <div class="space-y-4">
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

        <div class="p-4 bg-bg-tertiary rounded-lg border border-bg-tertiary/50">
          <h3 class="font-semibold text-white mb-2">Remote Keys</h3>
          <p class="text-sm text-text-tertiary">
            Amber / Nostr Connect support is being rebuilt with full NIP-46 compliance.
          </p>
        </div>

        <div class="text-xs text-text-tertiary space-y-1 p-3 bg-bg-tertiary rounded">
          <p class="font-medium text-text-secondary">Supported:</p>
          <ul class="space-y-1">
            <li>• Browser extensions (Alby, nos2x, Nostr Garden, etc.)</li>
            <li>• Amber remote key manager (coming soon)</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>

    cursor: default;
  }
