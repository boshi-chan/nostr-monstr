<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { walletState, showWallet } from '$stores/wallet'
</script>

<div class="flex h-full flex-col bg-transparent pb-24 md:pb-0 md:px-10 md:py-8">
  <!-- Header -->
  <div class="sticky top-0 z-20 border-b border-dark-border/60 bg-dark/80 backdrop-blur-xl md:rounded-3xl md:border md:border-dark-border/50 md:bg-dark-light/70 md:px-6 md:py-5 md:shadow-inset">
    <h2 class="text-xl font-semibold text-text-soft">Profile</h2>
  </div>

  <!-- Profile content -->
  <div class="flex-1 overflow-y-auto px-3 py-6 md:px-0">
    {#if $currentUser}
      <div class="space-y-8">
        <!-- User info -->
        <div class="surface-card p-8 text-center">
          <div class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-3xl font-bold text-primary">
            {$currentUser.pubkey.slice(0, 2).toUpperCase()}
          </div>
          <h3 class="text-xl font-semibold text-text-soft">{$currentUser.name || 'Anonymous'}</h3>
          <p class="mt-2 break-all text-sm text-text-muted">{$currentUser.pubkey}</p>
          {#if $currentUser.about}
            <p class="mt-4 text-sm text-text-soft/80">{$currentUser.about}</p>
          {/if}
        </div>

        <!-- Wallet section -->
        <section class="space-y-4">
          <h4 class="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Wallet</h4>
          <div class="surface-card p-6">
            <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Balance</p>
            <p class="mt-3 text-3xl font-bold text-primary">
              {$walletState.balance.toFixed(6)} XMR
            </p>
            <button class="btn-primary mt-6 w-full justify-center" on:click={() => showWallet.set(true)}>
              Open Wallet
            </button>
          </div>
        </section>

        <!-- Settings -->
        <section class="space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Settings</h4>
          <button class="surface-card w-full p-4 text-left transition-all duration-200 hover:-translate-y-0.5">
            Privacy & Security
          </button>
          <button class="surface-card w-full p-4 text-left transition-all duration-200 hover:-translate-y-0.5">
            Notifications
          </button>
          <button class="surface-card w-full p-4 text-left transition-all duration-200 hover:-translate-y-0.5">
            About
          </button>
        </section>
      </div>
    {:else}
      <div class="flex h-full items-center justify-center text-text-muted">
        <div class="space-y-2 text-center">
          <p class="text-lg font-semibold text-text-soft">Not logged in</p>
          <p class="text-sm">Connect your Nostr key to continue</p>
        </div>
      </div>
    {/if}
  </div>
</div>
