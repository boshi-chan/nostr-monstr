<script lang="ts">
  import { activeTab } from '$stores/nav'
  import Navbar from './Navbar.svelte'
  import Home from './pages/Home.svelte'
  import Messages from './pages/Messages.svelte'
  import Profile from './pages/Profile.svelte'
</script>

<div class="flex h-screen w-screen flex-col bg-dark md:flex-row">
  <!-- Left sidebar for desktop -->
  <div class="hidden md:flex md:border-r md:border-dark-border">
    <Navbar />
  </div>

  <!-- Main content -->
  <main class="flex-1 h-full overflow-y-auto bg-transparent">
    {#if $activeTab === 'home'}
      <Home />
    {:else if $activeTab === 'messages'}
      <Messages />
    {:else if $activeTab === 'profile'}
      <Profile />
    {/if}
  </main>

  <!-- Bottom navbar for mobile -->
  <div class="fixed bottom-0 left-0 right-0 z-50 md:hidden">
    <Navbar />
  </div>
</div>

<style>
  :global(body) {
    overflow: hidden;
    background-color: transparent;
  }
</style>
