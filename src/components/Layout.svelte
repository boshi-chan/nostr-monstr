<script lang="ts">
  import Navbar from './Navbar.svelte'
  import Compose from './Compose.svelte'
  import SearchModal from './SearchModal.svelte'
  import WalletModal from './WalletModal.svelte'
  import WalletStatusBar from './WalletStatusBar.svelte'
  import EmberModal from './EmberModal.svelte'
  import Home from './pages/Home.svelte'
  import LongReads from './pages/LongReads.svelte'
  import Messages from './pages/Messages.svelte'
  import Notifications from './pages/Notifications.svelte'
  import Profile from './pages/Profile.svelte'
  import Settings from './pages/Settings.svelte'
  import PostView from './pages/PostView.svelte'
  import { activeRoute } from '$stores/router'
</script>

<div class="flex h-screen w-screen flex-col bg-dark">
  <WalletStatusBar />
  <div class="flex flex-1 flex-col overflow-hidden md:flex-row">
    <!-- Left sidebar for desktop -->
    <div class="hidden md:flex md:h-full md:border-r md:border-dark-border">
      <Navbar />
    </div>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto bg-transparent">
      {#if $activeRoute.type === 'page'}
        {#if $activeRoute.tab === 'home'}
          <Home />
        {:else if $activeRoute.tab === 'long-reads'}
          <LongReads />
        {:else if $activeRoute.tab === 'messages'}
          <Messages />
        {:else if $activeRoute.tab === 'notifications'}
          <Notifications />
        {:else if $activeRoute.tab === 'profile'}
          <Profile />
        {:else if $activeRoute.tab === 'settings'}
          <Settings />
        {/if}
      {:else if $activeRoute.type === 'post'}
        <PostView
          eventId={$activeRoute.eventId}
          originTab={$activeRoute.originTab}
          initialEvent={$activeRoute.initialEvent}
        />
      {:else if $activeRoute.type === 'profile'}
        <Profile pubkey={$activeRoute.pubkey} originTab={$activeRoute.originTab} />
      {/if}
    </main>
  </div>

  <!-- Bottom navbar for mobile -->
  <div class="fixed bottom-0 left-0 right-0 z-40 md:hidden">
    <Navbar />
  </div>

  <!-- Compose modal -->
  <Compose />
  <WalletModal />
  <EmberModal />

  <!-- Search modal -->
  <SearchModal />
</div>

<style>
  :global(body) {
    overflow: hidden;
    background-color: transparent;
  }
</style>
