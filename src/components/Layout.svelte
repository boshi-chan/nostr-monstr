<script lang="ts">
  import { onMount, type ComponentType } from 'svelte'
  import Navbar from './Navbar.svelte'
  import Compose from './Compose.svelte'
  import FloatingComposeButton from './FloatingComposeButton.svelte'
  import SearchModal from './SearchModal.svelte'
  import WalletStatusBar from './WalletStatusBar.svelte'
import ZapModal from './ZapModal.svelte'
import CanaryModal from './CanaryModal.svelte'
import DonateModal from './DonateModal.svelte'
  import Home from './pages/Home.svelte'
  import Messages from './pages/Messages.svelte'
  import Profile from './pages/Profile.svelte'
  import Discover from './pages/Discover.svelte'
import ScrollToTopButton from './ScrollToTopButton.svelte'
import DebugOverlay from './DebugOverlay.svelte'
import DebugOverlayToggle from './DebugOverlayToggle.svelte'
import { activeRoute } from '$stores/router'
import { showEmberModal } from '$stores/wallet'
import { debugOverlayEnabled } from '$stores/debugOverlay'
import { setupDeepLinkListener } from '$lib/deep-link'
import '$lib/native-notification-bridge'

  let NotificationsPage: ComponentType | null = null
  let SettingsPage: ComponentType | null = null
  let PostViewPage: ComponentType | null = null
  let LiveStreamsPage: ComponentType | null = null
  let EmberModalComp: ComponentType | null = null

  $: shouldLoadNotifications = $activeRoute.type === 'page' && $activeRoute.tab === 'notifications'
  $: shouldLoadSettings = $activeRoute.type === 'page' && $activeRoute.tab === 'settings'
  $: shouldLoadPostView = $activeRoute.type === 'post'
  $: shouldLoadLiveStreams = $activeRoute.type === 'page' && $activeRoute.tab === 'livestreams'
  $: shouldLoadEmberModal = $showEmberModal

  onMount(() => {
    setupDeepLinkListener()
  })

  $: if (shouldLoadNotifications && !NotificationsPage) {
    import('./pages/Notifications.svelte').then(mod => (NotificationsPage = mod.default))
  }

  $: if (shouldLoadSettings && !SettingsPage) {
    import('./pages/Settings.svelte').then(mod => (SettingsPage = mod.default))
  }

  $: if (shouldLoadPostView && !PostViewPage) {
    import('./pages/PostView.svelte').then(mod => (PostViewPage = mod.default))
  }

  $: if (shouldLoadLiveStreams && !LiveStreamsPage) {
    import('./pages/LiveStreams.svelte').then(mod => (LiveStreamsPage = mod.default))
  }

  $: if (shouldLoadEmberModal && !EmberModalComp) {
    import('./EmberModal.svelte').then(mod => (EmberModalComp = mod.default))
  }

  $: isMessagesTab = $activeRoute.type === 'page' && $activeRoute.tab === 'messages'

  let mainEl: HTMLElement | null = null

  // Reset scroll position to top when route changes
  $: if ($activeRoute && mainEl) {
    mainEl.scrollTop = 0
  }
</script>

<div
  class="flex h-screen w-screen flex-col bg-dark"
  style="height: 100dvh; padding-bottom: env(safe-area-inset-bottom, 0px);">
  <WalletStatusBar />
  <div class="flex flex-1 flex-col overflow-hidden md:flex-row">
    <!-- Left sidebar for desktop -->
    <div class="hidden md:flex md:h-full md:border-r md:border-dark-border">
      <Navbar />
    </div>

    <!-- Main content -->
    <main
      bind:this={mainEl}
      class={`flex-1 bg-transparent ${isMessagesTab ? 'overflow-hidden pb-20 md:pb-0' : 'overflow-y-auto pb-20 md:pb-0'}`}
    >
      {#if $activeRoute.type === 'page'}
        {#if $activeRoute.tab === 'home'}
          <Home />
        {:else if $activeRoute.tab === 'messages'}
          <Messages />
        {:else if $activeRoute.tab === 'livestreams'}
          {#if LiveStreamsPage}
            <svelte:component this={LiveStreamsPage} />
          {:else}
            <div class="p-4 text-text-muted">Loading live streams…</div>
          {/if}
        {:else if $activeRoute.tab === 'discover'}
          <Discover />
        {:else if $activeRoute.tab === 'notifications'}
          {#if NotificationsPage}
            <svelte:component this={NotificationsPage} />
          {:else}
            <div class="p-4 text-text-muted">Loading notifications…</div>
          {/if}
        {:else if $activeRoute.tab === 'profile'}
          <Profile />
        {:else if $activeRoute.tab === 'settings'}
          {#if SettingsPage}
            <svelte:component this={SettingsPage} />
          {:else}
            <div class="p-4 text-text-muted">Loading settings…</div>
          {/if}
        {/if}
      {:else if $activeRoute.type === 'post'}
        {#if PostViewPage}
          <svelte:component
            this={PostViewPage}
            eventId={$activeRoute.eventId}
            originTab={$activeRoute.originTab}
            initialEvent={$activeRoute.initialEvent}
          />
        {:else}
          <div class="p-4 text-text-muted">Loading post…</div>
        {/if}
      {:else if $activeRoute.type === 'profile'}
        <Profile pubkey={$activeRoute.pubkey} originTab={$activeRoute.originTab} />
      {/if}
    </main>
  </div>

  <!-- Bottom navbar for mobile -->
  <div class="fixed bottom-0 left-0 right-0 z-40 md:hidden">
    <Navbar />
  </div>

  <!-- Floating compose button (only on feed pages) -->
  <FloatingComposeButton />
  {#if !isMessagesTab}
    <ScrollToTopButton target={mainEl} />
  {/if}

  <!-- Modals -->
  <Compose />
  <ZapModal />
  <CanaryModal />
  <DonateModal />
  {#if EmberModalComp}
    <svelte:component this={EmberModalComp} />
  {/if}
  <SearchModal />
  <DebugOverlay enabled={$debugOverlayEnabled} />
  <DebugOverlayToggle />
</div>

<style>
  :global(body) {
    overflow: hidden;
    background-color: transparent;
  }
</style>
