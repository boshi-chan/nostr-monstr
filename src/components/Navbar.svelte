<script lang="ts">
  import { activeTab } from '$stores/nav'
  import { currentUser } from '$stores/auth'
  import { feedSource, lastTimelineFeed } from '$stores/feedSource'
  import { logout } from '$lib/auth'
  import { showCompose } from '$stores/feed'
  import { navigateToPage } from '$stores/router'
  import type { NavTab } from '$stores/nav'
  import HomeIcon from './icons/HomeIcon.svelte'
  import BookOpenIcon from './icons/BookOpenIcon.svelte'
  import BellIcon from './icons/BellIcon.svelte'
  import SquarePenIcon from './icons/SquarePenIcon.svelte'
  import SearchIcon from './icons/SearchIcon.svelte'
  import { unreadCount } from '$stores/notifications'
  import { showSearch } from '$stores/search'

  const tabs: { id: NavTab; label: string; icon: any }[] = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'long-reads', label: 'Long Reads', icon: BookOpenIcon },
    // { id: 'messages', label: 'Messages', icon: MessageIcon }, // DISABLED - relay config needs fixing
    { id: 'notifications', label: 'Notifications', icon: BellIcon },
  ]

  let desktopMenuOpen = false
  let mobileMenuOpen = false

  function handleTabClick(tab: NavTab) {
    navigateToPage(tab)

    if (tab === 'home') {
      const targetFeed = $lastTimelineFeed ?? 'following'
      feedSource.set(targetFeed)
    } else if (tab === 'long-reads') {
      feedSource.set('long-reads')
    }
  }

  function handleCompose() {
    showCompose.set(true)
  }

  function navigate(tab: NavTab) {
    handleTabClick(tab)
    closeMenus()
  }

  function toggleDesktopMenu() {
    desktopMenuOpen = !desktopMenuOpen
    if (desktopMenuOpen) {
      mobileMenuOpen = false
    }
  }

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen
    if (mobileMenuOpen) {
      desktopMenuOpen = false
    }
  }

  function closeMenus() {
    desktopMenuOpen = false
    mobileMenuOpen = false
  }

  async function handleLogout() {
    await logout()
    closeMenus()
  }

  function handleOverlayKey(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      closeMenus()
    }
  }

  function handleSearch() {
    showSearch.set(true)
    closeMenus()
  }
</script>

<nav class="relative flex h-16 w-full items-center gap-3 border-t border-dark-border bg-dark-light px-3 py-2 text-text-muted md:h-full md:w-20 md:flex-col md:items-center md:justify-start md:gap-4 md:border-t-0 md:border-r md:bg-transparent md:px-4 md:py-4">
  <!-- Desktop: Logo Only -->
  <div class="hidden md:flex items-center justify-center h-12">
    <img src="/logo.svg" alt="Monstr" class="h-10 w-10" />
  </div>

  <!-- Navigation Tabs -->
  <div class="flex flex-1 items-center justify-around gap-2 md:flex-col md:items-center md:justify-start md:gap-3 md:w-full">
    {#each tabs as tab (tab.id)}
      <button
        class={`relative flex h-10 w-10 md:w-12 md:h-12 items-center justify-center rounded-xl text-sm font-medium transition-colors duration-200 ${
          $activeTab === tab.id
            ? 'bg-primary text-dark font-semibold'
            : 'text-text-muted hover:bg-dark-lighter/60 hover:text-text-soft'
        }`}
        on:click={() => handleTabClick(tab.id)}
        title={tab.label}
        aria-current={$activeTab === tab.id ? 'page' : undefined}
      >
        <div class="flex h-5 w-5 md:h-7 md:w-7 items-center justify-center">
          <svelte:component this={tab.icon} size={17} color="currentColor" strokeWidth={1.6} />
        </div>
        {#if tab.id === 'notifications' && $unreadCount > 0}
          <span class="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-dark">
            {$unreadCount > 9 ? '9+' : $unreadCount}
          </span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Compose button (mobile) -->
  <button
    on:click={handleCompose}
    class="md:hidden relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-dark font-semibold transition-colors duration-200"
    title="Compose"
  >
    <div class="flex h-5 w-5 items-center justify-center">
      <SquarePenIcon size={17} color="currentColor" strokeWidth={1.6} />
    </div>
  </button>

  <!-- Account button (mobile) -->
  <button
    on:click={toggleMobileMenu}
    class="md:hidden relative flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:bg-dark-lighter/60 hover:text-text-soft transition-colors duration-200"
    title="Account"
  >
    {#if $currentUser?.picture}
      <img src={$currentUser.picture} alt="Account" class="h-7 w-7 rounded-full object-cover" />
    {:else}
      <div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
        {($currentUser?.name || $currentUser?.pubkey || '??').slice(0, 2).toUpperCase()}
      </div>
    {/if}
  </button>

  <!-- Desktop compose & account -->
  <div class="hidden md:flex md:mt-auto md:w-full md:flex-col md:items-center md:gap-3 md:pb-4">
    <button
      on:click={handleCompose}
      class="w-12 h-12 flex items-center justify-center rounded-xl bg-primary text-dark transition-colors duration-200 hover:bg-primary/90"
      title="Compose"
    >
      <SquarePenIcon size={22} color="currentColor" strokeWidth={1.75} />
    </button>

    <div class="relative">
      <button
        on:click={toggleDesktopMenu}
        class="w-12 h-12 flex items-center justify-center rounded-xl border border-dark-border/60 bg-dark-light/80 transition-colors duration-200 hover:border-primary/60"
        title="Account menu"
      >
        {#if $currentUser?.picture}
          <img src={$currentUser.picture} alt="Account" class="h-10 w-10 rounded-full object-cover" />
        {:else}
          <span class="text-sm font-semibold text-text-soft">
            {($currentUser?.name || $currentUser?.pubkey || '??').slice(0, 2).toUpperCase()}
          </span>
        {/if}
      </button>

      {#if desktopMenuOpen}
        <div class="absolute left-full top-1/2 z-50 w-48 -translate-y-1/2 translate-x-4 rounded-2xl border border-dark-border/70 bg-dark-light/95 p-2 shadow-xl">
          <button
            class="w-full rounded-xl px-3 py-2 text-left text-sm text-text-soft hover:bg-dark-lighter/60"
            on:click={() => navigate('profile')}
          >
            View profile
          </button>
          <button
            class="w-full rounded-xl px-3 py-2 text-left text-sm text-text-soft hover:bg-dark-lighter/60"
            on:click={() => navigate('settings')}
          >
            Settings
          </button>
          <button
            class="w-full rounded-xl px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/20"
            on:click={handleLogout}
          >
            Logout
          </button>
        </div>
      {/if}
    </div>
  </div>
</nav>

{#if desktopMenuOpen}
  <div
    role="button"
    tabindex="0"
    aria-label="Close account menu"
    class="fixed inset-0 z-40 hidden md:block"
    on:click={closeMenus}
    on:keydown={handleOverlayKey}
  ></div>
{/if}
{#if mobileMenuOpen}
  <div
    role="button"
    tabindex="0"
    aria-label="Close account menu"
    class="fixed inset-0 z-40 md:hidden"
    on:click={closeMenus}
    on:keydown={handleOverlayKey}
  ></div>
  <div class="fixed bottom-20 right-4 z-50 w-48 rounded-2xl border border-dark-border/70 bg-dark-light/95 p-2 shadow-xl md:hidden">
    <button
      class="w-full rounded-xl px-3 py-2 text-left text-sm text-text-soft hover:bg-dark-lighter/60"
      on:click={handleSearch}
    >
      Search
    </button>
    <button
      class="w-full rounded-xl px-3 py-2 text-left text-sm text-text-soft hover:bg-dark-lighter/60"
      on:click={() => navigate('profile')}
    >
      View profile
    </button>
    <button
      class="w-full rounded-xl px-3 py-2 text-left text-sm text-text-soft hover:bg-dark-lighter/60"
      on:click={() => navigate('settings')}
    >
      Settings
    </button>
    <button
      class="w-full rounded-xl px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/20"
      on:click={handleLogout}
    >
      Logout
    </button>
  </div>
{/if}

<style>
  nav {
    transition: all 0.3s ease;
  }

  button {
    transition: all 0.2s ease;
  }
</style>
