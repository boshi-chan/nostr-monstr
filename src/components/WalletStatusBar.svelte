<script lang="ts">
  import { walletState } from '$stores/wallet'
  import { showSearch } from '$stores/search'
  import { lockWallet, unlockWallet } from '$lib/wallet/lazy'
  import { showCanaryModal, showDonateModal } from '$stores/modals'
  import { navigateToPage } from '$stores/router'
  import LockIcon from 'lucide-svelte/icons/lock'
  import LockOpenIcon from 'lucide-svelte/icons/lock-open'
  import WalletIcon from 'lucide-svelte/icons/wallet'
  import HandCoinsIcon from 'lucide-svelte/icons/hand-coins'
  import BirdIcon from 'lucide-svelte/icons/bird'
  import SearchIcon from 'lucide-svelte/icons/search'
  import InfoIcon from 'lucide-svelte/icons/info'

  type ChipInfo = { label: string; classes: string }

  let lockBusy = false
  let showAboutMenu = false

  $: isLocked = $walletState.hasWallet && $walletState.locked
  $: syncPercent =
    $walletState.isSyncing && $walletState.syncProgress !== null
      ? Math.max(0, Math.min(100, Math.round($walletState.syncProgress)))
      : null
  $: hasSyncedOnce = Boolean($walletState.lastSyncedAt)
  $: statusChip = (() => {
    if (!$walletState.hasWallet || !$walletState.isReady || $walletState.locked) {
      const label = !$walletState.hasWallet ? 'No wallet' : $walletState.locked ? 'Locked' : 'Unsynced'
      return {
        label,
        classes: 'border border-rose-500/50 bg-rose-500/10 text-rose-100',
      }
    }
    if (!$walletState.isSyncing && !hasSyncedOnce) {
      return {
        label: 'Unsynced — try refreshing or another node',
        classes: 'border border-rose-500/50 bg-rose-500/10 text-rose-100',
      }
    }
    if ($walletState.isSyncing) {
      return {
        label: syncPercent !== null ? `Syncing ${syncPercent}%` : 'Syncing…',
        classes: 'border border-amber-400/40 bg-amber-500/10 text-amber-100',
      }
    }
    return {
      label: 'Synced',
      classes: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    }
  })() satisfies ChipInfo

  async function handleUnlock(): Promise<void> {
    if (lockBusy) return
    lockBusy = true
    try {
      await unlockWallet()
    } catch (err) {
      if (!(err instanceof Error && err.message === 'WALLET_PIN_CANCELLED')) {
        logger.error('Failed to unlock wallet:', err)
      }
    } finally {
      lockBusy = false
    }
  }

  async function handleLock(): Promise<void> {
    if (lockBusy || !$walletState.isReady) return
    lockBusy = true
    try {
      await lockWallet()
    } catch (err) {
      logger.error('Failed to lock wallet:', err)
    } finally {
      lockBusy = false
    }
  }
  const repoUrl = 'https://github.com/boshi-chan/nostr-monstr'
</script>

<div class="w-full border-b border-dark-border/60 bg-dark/90 px-3 py-1 backdrop-blur-2xl">
  <div class="flex flex-nowrap items-center gap-2 text-[11px] text-text-soft">
    <!-- Wallet pill -->
    <div class="flex flex-shrink-0 items-center gap-2 rounded-full border border-dark-border/60 bg-dark/60 px-2 py-1 shadow-sm shadow-black/20">
      {#if $walletState.hasWallet}
        <button
          type="button"
          class={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/10 text-xs transition ${
            isLocked
              ? 'text-rose-300 hover:border-emerald-400/60 hover:text-emerald-200'
              : 'text-emerald-300 hover:border-rose-400/60 hover:text-rose-200'
          } ${lockBusy ? 'cursor-not-allowed opacity-50' : ''}`}
          aria-label={isLocked ? 'Unlock wallet' : 'Lock wallet'}
          on:click={isLocked ? handleUnlock : handleLock}
          disabled={lockBusy || (!isLocked && !$walletState.isReady)}
        >
          {#if isLocked}
            <LockIcon size={15} />
          {:else}
            <LockOpenIcon size={15} />
          {/if}
        </button>
      {/if}
      <button
        type="button"
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/10 text-emerald-200 transition hover:border-emerald-400/60 hover:text-emerald-100"
        aria-label={$walletState.hasWallet ? 'Open wallet' : 'Create wallet'}
        on:click={() => navigateToPage('settings')}
      >
        <WalletIcon size={15} />
      </button>
      <div class="flex min-w-0 flex-col text-[10px] font-semibold">
        <span class={`whitespace-nowrap ${statusChip.classes}`}>
          {#if !$walletState.hasWallet}
            No wallet
          {:else if $walletState.locked}
            Locked
          {:else if (!$walletState.isSyncing && !hasSyncedOnce && $walletState.isReady)}
            Unsynced — try refreshing or another node
          {:else if ($walletState.isSyncing || syncPercent !== null) && $walletState.isReady}
            {syncPercent !== null ? `Syncing ${syncPercent}%` : 'Syncing…'}
          {:else if ($walletState.isReady)}
            Synced
          {:else}
            Unsynced
          {/if}
        </span>
      </div>
    </div>

    <!-- Search pill -->
    <div class="flex min-w-0 flex-1 justify-center">
      <button
        type="button"
        class="inline-flex w-full items-center justify-center gap-1 rounded-full border border-white/10 bg-dark/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-soft transition hover:border-emerald-400/60 hover:text-white"
        on:click={() => showSearch.set(true)}
      >
        <SearchIcon size={16} />
        <span class="hidden sm:inline">Search</span>
      </button>
    </div>

    <!-- Right pill -->
    <div class="ml-auto flex flex-shrink-0 items-center">
      <div class="flex items-center gap-1 rounded-full border border-white/10 bg-dark/60 px-2 py-1">
        <button
          type="button"
          class="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-soft transition hover:text-emerald-200"
          aria-haspopup="true"
          aria-expanded={showAboutMenu}
          on:click={() => (showAboutMenu = !showAboutMenu)}
        >
          <InfoIcon size={16} />
          About
        </button>
      </div>

    </div>
  </div>
</div>

{#if showAboutMenu}
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4"
    on:click={() => (showAboutMenu = false)}
  >
    <div
      class="w-full max-w-sm rounded-2xl border border-white/10 bg-dark/95 p-6 text-sm text-text-soft shadow-2xl"
      on:click|stopPropagation
    >
      <div class="mb-4 flex items-center justify-between">
        <div>
          <p class="text-xs uppercase tracking-wide text-text-muted">About</p>
          <p class="text-base font-semibold text-white">Monstr v1.0.0.1</p>
        </div>
        <button
          type="button"
          class="rounded-full border border-white/10 px-2 py-1 text-xs uppercase tracking-wide text-text-muted transition hover:text-white"
          on:click={() => (showAboutMenu = false)}
        >
          Close
        </button>
      </div>

      <div class="space-y-3">
        <a
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          class="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 transition hover:border-emerald-400/60 hover:text-white"
          on:click={() => (showAboutMenu = false)}
        >
          <span>GitHub</span>
          <span class="text-xs text-text-muted">Open repo</span>
        </a>

        <button
          type="button"
          class="flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-left text-amber-200 transition hover:border-amber-400/60"
          on:click={() => {
            showAboutMenu = false
            showDonateModal.set(true)
          }}
        >
          <span>Donate</span>
          <HandCoinsIcon size={18} />
        </button>

        <button
          type="button"
          class="flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-left text-cyan-200 transition hover:border-cyan-400/60"
          on:click={() => {
            showAboutMenu = false
            showCanaryModal.set(true)
          }}
        >
          <span>Canary</span>
          <BirdIcon size={18} />
        </button>
      </div>
    </div>
  </div>
{/if}
