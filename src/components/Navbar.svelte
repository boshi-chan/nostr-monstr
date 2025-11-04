<script lang="ts">
  import { activeTab } from '$stores/nav'
  import { logout } from '$lib/auth'
  import type { NavTab } from '$stores/nav'
  import HomeIcon from './icons/HomeIcon.svelte'
  import MessageIcon from './icons/MessageIcon.svelte'
  import UserIcon from './icons/UserIcon.svelte'

  function handleTabClick(tab: NavTab) {
    activeTab.set(tab)
  }

  async function handleLogout() {
    await logout()
  }

  const tabs: { id: NavTab; label: string; icon: any }[] = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'messages', label: 'Messages', icon: MessageIcon },
    { id: 'profile', label: 'Profile', icon: UserIcon },
  ]
</script>

<nav class="flex h-16 w-full items-center gap-2 border-t border-dark-border bg-dark-light px-4 py-2 text-text-muted md:h-full md:w-20 md:flex-col md:items-center md:justify-start md:gap-4 md:border-t-0 md:border-r md:bg-transparent md:px-4 md:py-8">
  <!-- Desktop: Logo Only -->
  <div class="hidden md:flex items-center justify-center">
    <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
      <img src="/logo.svg" alt="Monstr" class="h-8 w-8" />
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="flex flex-1 items-center justify-evenly gap-2 md:flex-col md:items-center md:justify-start md:gap-3 md:w-full">
    {#each tabs as tab (tab.id)}
      <button
        class={`flex-1 h-12 md:flex-none md:w-12 md:h-12 flex items-center justify-center rounded-xl text-sm font-medium transition-colors duration-200 ${
          $activeTab === tab.id
            ? 'bg-primary text-dark font-semibold'
            : 'text-text-muted hover:bg-dark-lighter/60 hover:text-text-soft'
        }`}
        on:click={() => handleTabClick(tab.id)}
        title={tab.label}
        aria-current={$activeTab === tab.id ? 'page' : undefined}
      >
        <svelte:component this={tab.icon} size={22} color="currentColor" strokeWidth={1.75} />
      </button>
    {/each}
  </div>

  <!-- Logout button (desktop only - icon only) -->
  <div class="hidden md:flex md:mt-auto md:pt-6 md:border-t md:border-dark-border/60 md:w-full md:justify-center">
    <button
      on:click={handleLogout}
      class="w-12 h-12 flex items-center justify-center rounded-xl text-text-muted transition-colors duration-200 hover:bg-dark-lighter/60 hover:text-text-soft"
      title="Logout"
    >
      <span class="text-xl">⎋</span>
    </button>
  </div>
</nav>

<style>
  nav {
    transition: all 0.3s ease;
  }

  button {
    transition: all 0.2s ease;
  }
</style>
