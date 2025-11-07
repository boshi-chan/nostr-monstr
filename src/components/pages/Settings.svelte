<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { walletState, showWallet } from '$stores/wallet'
  import { metadataCache } from '$stores/feed'
  import { getAvatarUrl, getNip05Display } from '$lib/metadata'
  import RelaySettings from '../RelaySettings.svelte'
  import { setWalletSharePreference } from '$lib/wallet'

  async function handleShareToggle(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    try {
      await setWalletSharePreference(input.checked)
    } catch (err) {
      console.error('Failed to update share preference', err)
    }
  }
</script>

<div class="flex h-full flex-col bg-transparent pb-24 md:pb-0 md:px-10 md:py-8">
  <div class="sticky top-0 z-20 border-b border-dark-border/60 bg-dark/80 backdrop-blur-xl md:rounded-3xl md:border md:border-dark-border/50 md:bg-dark-light/70 md:px-6 md:py-5 md:shadow-inset">
    <h2 class="text-xl font-semibold text-text-soft">Settings</h2>
    <p class="mt-1 text-sm text-text-muted">Manage your account, wallet, and preferences</p>
  </div>

  <div class="flex-1 overflow-y-auto px-3 py-6 md:px-0">
    {#if $currentUser}
      {@const metadata = $metadataCache.get($currentUser.pubkey)}
      {@const avatarUrl = getAvatarUrl(metadata)}
      {@const nip05 = getNip05Display(metadata?.nip05)}

      <div class="space-y-8">
        <section class="surface-card flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-4">
            <div class="h-16 w-16 overflow-hidden rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
              {#if avatarUrl}
                <img src={avatarUrl} alt={$currentUser.name} class="h-full w-full object-cover" />
              {:else}
                <div class="flex h-full w-full items-center justify-center">
                  {$currentUser.pubkey.slice(0, 2).toUpperCase()}
                </div>
              {/if}
            </div>
            <div>
              <h3 class="text-lg font-semibold text-text-soft">{$currentUser.name || 'Anonymous'}</h3>
              <p class="text-sm text-text-muted">{nip05 || $currentUser.pubkey.slice(0, 12)}...</p>
            </div>
          </div>

          <button
            type="button"
            class="rounded-full border border-dark-border/70 px-5 py-2 text-sm font-medium text-text-soft transition-colors hover:border-primary/60 hover:text-white"
          >
            Edit Profile
          </button>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold uppercase tracking-[0.3em] text-text-muted">Wallet</h4>
            <span class="rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
              {$walletState.hasWallet ? ($walletState.isLocked ? 'Locked' : 'Ready') : 'Not created'}
            </span>
          </div>

          <div class="surface-card space-y-4 p-6">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Balance</p>
                <p class="mt-2 text-3xl font-bold text-primary">
                  {$walletState.balance.toFixed(6)} XMR
                </p>
                <p class="text-sm text-text-muted">Unlocked: {$walletState.unlockedBalance.toFixed(6)} XMR</p>
              </div>
              <button class="btn-primary mt-4 w-full justify-center md:mt-0 md:w-auto" on:click={() => showWallet.set(true)}>
                {$walletState.hasWallet ? 'Open Wallet' : 'Set Up Wallet'}
              </button>
            </div>

            {#if $walletState.address}
              <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Address</p>
                <p class="mt-2 break-all text-sm text-text-soft/80">
                  {$walletState.address}
                </p>
              </div>
            {/if}

            <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-text-soft">Share Ember address</p>
                  <p class="text-xs text-text-muted">
                    Publish your Monero wallet address so others can send Embers directly.
                  </p>
                </div>
                <label class="flex items-center gap-2 text-sm font-semibold text-text-soft">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-primary"
                    checked={$walletState.shareAddress}
                    on:change={handleShareToggle}
                  />
                  <span>{$walletState.shareAddress ? 'On' : 'Off'}</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section>
          <RelaySettings />
        </section>

        <section class="space-y-3">
          <h4 class="text-sm font-semibold uppercase tracking-[0.3em] text-text-muted">Preferences</h4>
          <div class="surface-card divide-y divide-dark-border/70 overflow-hidden">
            <button class="flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-200 hover:bg-dark-light/60">
              <span class="font-medium text-text-soft">Privacy &amp; Security</span>
              <span class="text-text-muted">&rsaquo;</span>
            </button>
            <button class="flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-200 hover:bg-dark-light/60">
              <span class="font-medium text-text-soft">Notifications</span>
              <span class="text-text-muted">&rsaquo;</span>
            </button>
            <button class="flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-200 hover:bg-dark-light/60">
              <span class="font-medium text-text-soft">Appearance</span>
              <span class="text-text-muted">&rsaquo;</span>
            </button>
            <button class="flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-200 hover:bg-dark-light/60">
              <span class="font-medium text-text-soft">About &amp; Support</span>
              <span class="text-text-muted">&rsaquo;</span>
            </button>
          </div>
        </section>
      </div>
    {:else}
      <div class="flex h-full items-center justify-center text-text-muted">
        <div class="space-y-2 text-center">
          <p class="text-lg font-semibold text-text-soft">Not logged in</p>
          <p class="text-sm">Connect your Nostr key to manage settings</p>
        </div>
      </div>
    {/if}
  </div>
</div>
