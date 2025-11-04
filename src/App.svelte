<script lang="ts">
  import { onMount } from 'svelte'
  import { isAuthenticated } from '$stores/auth'
  import { initDB } from '$lib/db'
  import { initNDK } from '$lib/ndk'
  import { restoreSession } from '$lib/auth'
  import Layout from './components/Layout.svelte'
  import Login from './components/pages/Login.svelte'

  let isInitialized = false
  let error = ''

  onMount(async () => {
    const initTimeout = setTimeout(() => {
      if (!isInitialized) {
        console.warn('Initialization timeout - forcing display')
        isInitialized = true
      }
    }, 5000)

    try {
      await initDB()
      await initNDK()
      await restoreSession()
      isInitialized = true
      clearTimeout(initTimeout)
    } catch (err) {
      console.error('App initialization error:', err)
      error = String(err)
      isInitialized = true
      clearTimeout(initTimeout)
    }
  })
</script>

{#if isInitialized}
  {#if $isAuthenticated}
    <Layout />
  {:else}
    <Login />
  {/if}
{:else}
  <div class="flex items-center justify-center h-screen w-screen bg-bg-primary">
    <div class="text-center text-white">
      <div class="animate-spin text-4xl mb-4">⏳</div>
      <p>Initializing Monstr...</p>
    </div>
  </div>
{/if}

<style global>
  :global(body) {
    margin: 0;
    padding: 0;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
</style>
