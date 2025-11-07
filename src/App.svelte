<script lang="ts">
  import { onMount } from 'svelte'
  import { isAuthenticated, currentUser } from '$stores/auth'
  import { isInitialized, initError } from '$stores/app'
  import { initDB } from '$lib/db'
  import { initNDK } from '$lib/ndk'
  import { restoreSession } from '$lib/auth'

  import { feedSource } from '$stores/feedSource'
  import { feedError, feedLoading, following, circles } from '$stores/feed'
  import {
    stopAllSubscriptions,
    clearFeed,
    subscribeToGlobalFeed,
    subscribeToFollowingFeed,
    subscribeToCirclesFeed,
    subscribeToLongReadsFeed,
  } from '$lib/feed-ndk'
  import { startNotificationListener, stopNotificationListener } from '$lib/notifications'
  import { hydrateWalletState } from '$lib/wallet'
  import { initWalletLifecycle } from '$lib/wallet/lifecycle'

  // force reactivity for feedSource
  $: $feedSource

  import Layout from './components/Layout.svelte'
  import Login from './components/pages/Login.svelte'

  onMount(async () => {
    try {
      await initDB()
      await initNDK()
      await restoreSession()
      await hydrateWalletState()
      initWalletLifecycle()

      // default feed: global on startup
      await subscribeToGlobalFeed()

      isInitialized.set(true)
    } catch (err) {
      console.error('App initialization error:', err)
      initError.set(String(err))
      isInitialized.set(true)
    }
  })

  // switching tabs changes subscription here
  $: if ($isInitialized) {
    const targetFeed = $feedSource
    const authed = $isAuthenticated
    const pubkey = $currentUser?.pubkey ?? null

    ;(async () => {
      // Stop all subscriptions and clear feed
      stopAllSubscriptions()
      clearFeed()
      
      // Give subscriptions time to actually stop before starting new ones
      await new Promise(resolve => setTimeout(resolve, 100))

      if (targetFeed === 'global') {
        await subscribeToGlobalFeed()
        return
      }

      if (!authed || !pubkey) {
        feedError.set('Log in to view this feed')
        feedLoading.set(false)
        return
      }

      if (targetFeed === 'following') {
        await subscribeToFollowingFeed()
        return
      }

      if (targetFeed === 'circles') {
        await subscribeToCirclesFeed()
        return
      }

      if (targetFeed === 'long-reads') {
        await subscribeToLongReadsFeed()
        return
      }
    })().catch(err => {
      console.error('Subscription error:', err)
      feedError.set(String(err))
      feedLoading.set(false)
    })
  }

  // manage notifications and cleanup on logout
  $: if ($isAuthenticated && $currentUser?.pubkey) {
    startNotificationListener($currentUser.pubkey)
  } else {
    stopNotificationListener()
    stopAllSubscriptions()
    clearFeed()
    following.set(new Set())
    circles.set(new Set())
  }
</script>

{#if $isInitialized}
  {#if $initError}
    <div class="bg-red-600/10 border border-red-500/40 text-red-300 text-sm px-4 py-3 text-center">
      Initialization issue: {$initError}
    </div>
  {/if}
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
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
</style>
