<script lang="ts">
  import { walletState, showWallet } from '$stores/wallet'
  import { lockWallet, unlockWallet } from '$lib/wallet/lazy'
  import EmberIcon from './icons/EmberIcon.svelte'
  import LockIcon from 'lucide-svelte/icons/lock'
  import LockOpenIcon from 'lucide-svelte/icons/lock-open'

  function formatRelative(timestamp: number | null): string {
    if (!timestamp) return 'never'
    const diff = Date.now() - timestamp
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  type StatusInfo = { label: string; accent: string }
  type ChipInfo = { label: string; classes: string }

  let lockBusy = false

  $: status = (() => {
    if (!$walletState.hasWallet) {
      return {
        label: 'Set up your Ember wallet to send Embers',
        accent: 'text-rose-300',
      }
    }
    if ($walletState.locked) {
      return {
        label: 'Wallet locked — tap the padlock to unlock',
        accent: 'text-rose-300',
      }
    }
    if (!$walletState.isReady) {
      return {
        label: 'Wallet needs setup — open wallet to finish sync',
        accent: 'text-rose-300',
      }
    }
    if ($walletState.isSyncing) {
      return {
        label: 'Wallet syncing…',
        accent: 'text-sky-300',
      }
    }
    return {
      label: 'Wallet ready',
      accent: 'text-emerald-300',
    }
  })() satisfies StatusInfo

  $: needsAction = $walletState.hasWallet && !$walletState.isReady && !$walletState.locked
  $: isLocked = $walletState.hasWallet && $walletState.locked
  $: syncPercent =
    $walletState.isSyncing && $walletState.syncProgress !== null
      ? Math.max(0, Math.min(100, Math.round($walletState.syncProgress)))
      : null
  $: statusChip = (() => {
    if (!$walletState.hasWallet || !$walletState.isReady || $walletState.locked) {
      const label = !$walletState.hasWallet ? 'No wallet' : $walletState.locked ? 'Locked' : 'Unsynced'
      return {
        label,
        classes: 'border border-rose-500/50 bg-rose-500/10 text-rose-100',
      }
    }
    if ($walletState.isSyncing) {
      return {
        label: syncPercent !== null ? `Syncing ${syncPercent}%` : 'Syncing…',
        classes: 'border border-sky-500/40 bg-sky-500/10 text-sky-100',
      }
    }
    return {
      label:
        $walletState.lastSyncedAt !== null ? `Synced ${formatRelative($walletState.lastSyncedAt)}` : 'Synced',
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
        console.error('Failed to unlock wallet:', err)
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
      console.error('Failed to lock wallet:', err)
    } finally {
      lockBusy = false
    }
  }
</script>

<div class="w-full border-b border-dark-border/60 bg-dark/90 px-3 py-1 backdrop-blur-2xl">
  <div class="flex flex-nowrap items-center gap-3 text-[11px] text-text-soft">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      {#if $walletState.hasWallet}
        <button
          type="button"
          class={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-dark-border/60 text-xs transition ${status.accent} ${
            isLocked ? 'hover:border-emerald-400/60 hover:text-emerald-200' : 'hover:border-rose-400/60 hover:text-rose-200'
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
      <span class="flex h-6 w-6 flex-shrink-0 items-center justify-center text-amber-300" aria-hidden="true">
        <EmberIcon size={14} />
      </span>
      <div class="flex min-w-0 items-center gap-2">
        <span
          aria-label={status.label}
          class={`hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex ${statusChip.classes}`}
        >
          {statusChip.label}
        </span>
      </div>
      <span
        aria-label={status.label}
        class={`sm:hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChip.classes}`}
      >
        {statusChip.label}
      </span>
    </div>
    <div class="flex flex-shrink-0 items-center gap-2">
      {#if needsAction}
        <button
          type="button"
          class="hidden whitespace-nowrap rounded-full border border-amber-400/60 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 transition hover:border-amber-300 hover:text-white sm:inline-flex"
          on:click={() => showWallet.set(true)}
        >
          Open wallet
        </button>
      {/if}
      {#if needsAction}
        <button
          type="button"
          class="sm:hidden whitespace-nowrap rounded-full border border-amber-400/60 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 transition hover:border-amber-300 hover:text-white"
          on:click={() => showWallet.set(true)}
        >
          Open
        </button>
      {/if}
    </div>
  </div>
</div>
