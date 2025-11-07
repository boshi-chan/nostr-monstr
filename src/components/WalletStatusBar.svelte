<script lang="ts">
  import { walletState, showWallet } from '$stores/wallet'
  import { autoUnlockWithSessionPin } from '$lib/wallet'

  function formatRelative(timestamp: number | null): string {
    if (!timestamp) return 'never'
    const diff = Date.now() - timestamp
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  type StatusInfo = { label: string; tone: string; dot: string }
  let unlocking = false

  $: status = (() => {
    if (!$walletState.hasWallet) {
      return {
        label: 'Set up your Monstr wallet to send Embers',
        tone: 'text-amber-200',
        dot: 'bg-amber-300 animate-pulse',
      }
    }
    if ($walletState.isLocked) {
      return {
        label: 'Wallet locked — open wallet to sync',
        tone: 'text-amber-100',
        dot: 'bg-amber-200',
      }
    }
    if ($walletState.isSyncing) {
      return {
        label: 'Wallet syncing…',
        tone: 'text-sky-100',
        dot: 'bg-sky-300 animate-pulse',
      }
    }
    if (!$walletState.lastSyncedAt) {
      return {
        label: 'Wallet ready — waiting for first sync',
        tone: 'text-emerald-100',
        dot: 'bg-emerald-300',
      }
    }
    return {
      label: `Wallet ready — last synced ${formatRelative($walletState.lastSyncedAt)}`,
      tone: 'text-emerald-100',
      dot: 'bg-emerald-300',
    }
  })() satisfies StatusInfo

  $: needsUnlockAction = $walletState.hasWallet && $walletState.isLocked

  async function handleUnlockClick(): Promise<void> {
    if (unlocking) return
    unlocking = true
    try {
      const unlocked = await autoUnlockWithSessionPin()
      if (!unlocked) {
        showWallet.set(true)
      }
    } catch (err) {
      console.warn('Inline unlock failed', err)
      showWallet.set(true)
    } finally {
      unlocking = false
    }
  }
</script>

<div class="w-full border-b border-dark-border/60 bg-dark/90 px-4 py-1 text-center backdrop-blur-2xl">
  <div class="inline-flex items-center justify-center gap-3 text-[11px] font-semibold text-text-soft">
    <span class={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true"></span>
    <span class={status.tone}>{status.label}</span>
    {#if needsUnlockAction}
      <button
        type="button"
        class="rounded-full border border-amber-400/60 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 transition hover:border-amber-300 hover:text-white"
        on:click={handleUnlockClick}
        disabled={unlocking}
      >
        {unlocking ? 'Unlocking…' : 'Unlock'}
      </button>
    {/if}
  </div>
</div>
