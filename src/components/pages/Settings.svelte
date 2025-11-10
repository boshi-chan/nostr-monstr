<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { walletState, showWallet } from '$stores/wallet'
  import { metadataCache } from '$stores/feed'
  import { getAvatarUrl, getNip05Display } from '$lib/metadata'
  import { setWalletSharePreference, getAvailableNodes, setActiveNode } from '$lib/wallet'
  import { getRelaysFromNIP65, publishRelays, getDefaultRelays, isValidRelayUrl, type RelayConfig } from '$lib/relays'
  import { onMount } from 'svelte'
  import UserIcon from '../icons/UserIcon.svelte'
  import ServerIcon from '../icons/ServerIcon.svelte'
  import WalletIcon from '../icons/WalletIcon.svelte'
  import type { MoneroNode } from '$lib/wallet/nodes'

  type SettingsTab = 'profile' | 'relays' | 'wallet'

  let activeTab: SettingsTab = 'profile'

  // Profile state
  async function handleShareToggle(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    try {
      await setWalletSharePreference(input.checked)
    } catch (err) {
      console.error('Failed to update share preference', err)
    }
  }

  // Relays state
  let relays: RelayConfig[] = []
  let newRelayUrl = ''
  let relayLoading = false
  let relayError: string | null = null
  let relaySuccess: string | null = null
  let showRelayForm = false

  onMount(async () => {
    await loadRelays()
  })

  async function loadRelays() {
    try {
      relayLoading = true
      relayError = null
      const fetchedRelays = await getRelaysFromNIP65()
      relays = fetchedRelays.length > 0 ? fetchedRelays : getDefaultRelays()
    } catch (err) {
      relayError = err instanceof Error ? err.message : String(err)
    } finally {
      relayLoading = false
    }
  }

  async function handleAddRelay() {
    if (!newRelayUrl.trim()) {
      relayError = 'Relay URL cannot be empty'
      return
    }

    if (!isValidRelayUrl(newRelayUrl)) {
      relayError = 'Invalid relay URL. Must be wss:// format'
      return
    }

    if (relays.some(r => r.url === newRelayUrl)) {
      relayError = 'This relay is already added'
      return
    }

    try {
      relayLoading = true
      relayError = null
      relaySuccess = null

      const updatedRelays = [...relays, { url: newRelayUrl, read: true, write: true }]
      await publishRelays(updatedRelays)

      relays = updatedRelays
      newRelayUrl = ''
      showRelayForm = false
      relaySuccess = 'Relay added successfully'
      setTimeout(() => (relaySuccess = null), 3000)
    } catch (err) {
      relayError = err instanceof Error ? err.message : String(err)
    } finally {
      relayLoading = false
    }
  }

  async function handleRemoveRelay(url: string) {
    try {
      relayLoading = true
      relayError = null
      relaySuccess = null

      const updatedRelays = relays.filter(r => r.url !== url)

      if (updatedRelays.length === 0) {
        relayError = 'Cannot remove all relays - you must keep at least one'
        return
      }

      await publishRelays(updatedRelays)

      relays = updatedRelays
      relaySuccess = 'Relay removed successfully'
      setTimeout(() => (relaySuccess = null), 3000)
    } catch (err) {
      relayError = err instanceof Error ? err.message : String(err)
    } finally {
      relayLoading = false
    }
  }

  async function handleToggleRelay(index: number, type: 'read' | 'write') {
    try {
      relayLoading = true
      relayError = null
      relaySuccess = null

      const relay = relays[index]
      const updated = { ...relay }

      if (type === 'read') {
        updated.read = !updated.read
      } else {
        updated.write = !updated.write
      }

      // Ensure at least one is enabled
      if (!updated.read && !updated.write) {
        relayError = 'Relay must have read or write enabled'
        return
      }

      const updatedRelays = [...relays]
      updatedRelays[index] = updated

      await publishRelays(updatedRelays)

      relays = updatedRelays
      relaySuccess = 'Relay updated successfully'
      setTimeout(() => (relaySuccess = null), 3000)
    } catch (err) {
      relayError = err instanceof Error ? err.message : String(err)
    } finally {
      relayLoading = false
    }
  }

  // Wallet state
  const nodes: MoneroNode[] = getAvailableNodes()
  let nodeBusy: string | null = null

  async function handleNodeChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement
    const nodeId = select.value
    nodeBusy = nodeId
    try {
      await setActiveNode(nodeId)
    } catch (err) {
      console.error('Failed to switch node:', err)
    } finally {
      nodeBusy = null
    }
  }

  const settingsTabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'relays', label: 'Relays', icon: ServerIcon },
    { id: 'wallet', label: 'Wallet', icon: WalletIcon },
  ]
</script>

<div class="w-full pb-24 md:pb-0">
  <!-- Tabs header -->
  <div class="sticky top-0 z-20 border-b border-dark-border/60 bg-dark/80 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-dark/60">
    <div class="flex h-14 md:h-16 w-full items-center justify-between px-3 md:px-6 gap-2">
      <div class="flex flex-1 w-full items-center gap-3 overflow-x-auto">
        {#each settingsTabs as tab (tab.id)}
          {@const isActive = activeTab === tab.id}
          <button
            type="button"
            class={`flex flex-1 md:min-w-[120px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 md:px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
              isActive
                ? 'bg-primary text-dark shadow-md shadow-primary/20'
                : 'text-text-muted hover:text-text-soft hover:bg-dark/30'
            }`}
            on:click={() => activeTab = tab.id}
            aria-label={tab.label}
          >
            {#if tab.icon}
              <svelte:component this={tab.icon} size={16} />
            {/if}
            <span class="hidden md:inline">{tab.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Tab content -->
  <div class="flex-1 overflow-y-auto px-3 py-6 md:px-8 md:py-8">
    {#if !$currentUser}
      <div class="flex h-full items-center justify-center text-text-muted">
        <div class="space-y-2 text-center">
          <p class="text-lg font-semibold text-text-soft">Not logged in</p>
          <p class="text-sm">Connect your Nostr key to manage settings</p>
        </div>
      </div>
    {:else if activeTab === 'profile'}
      {@const metadata = $metadataCache.get($currentUser.pubkey)}
      {@const avatarUrl = getAvatarUrl(metadata)}
      {@const nip05 = getNip05Display(metadata?.nip05)}

      <div class="max-w-3xl mx-auto space-y-6">
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

        <section class="surface-card p-6">
          <h4 class="text-sm font-semibold uppercase tracking-[0.3em] text-text-muted mb-4">Nostr Identity</h4>
          <div class="space-y-4">
            <div>
              <label class="text-xs uppercase tracking-[0.25em] text-text-muted">Public Key</label>
              <p class="mt-2 break-all text-sm text-text-soft/80 font-mono bg-dark/50 rounded-lg border border-dark-border/60 p-3">
                {$currentUser.pubkey}
              </p>
            </div>
            {#if nip05}
              <div>
                <label class="text-xs uppercase tracking-[0.25em] text-text-muted">NIP-05 Verification</label>
                <p class="mt-2 text-sm text-text-soft/80 bg-dark/50 rounded-lg border border-dark-border/60 p-3">
                  {nip05}
                </p>
              </div>
            {/if}
          </div>
        </section>
      </div>

    {:else if activeTab === 'relays'}
      <div class="max-w-3xl mx-auto space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-lg font-semibold text-text-soft">Nostr Relays</h4>
            <p class="text-sm text-text-muted mt-1">Manage your relay connections</p>
          </div>
          <button
            type="button"
            on:click={() => (showRelayForm = !showRelayForm)}
            class="rounded-full border border-dark-border/70 px-4 py-2 text-sm font-medium text-text-soft transition-colors hover:border-primary/60 hover:text-white"
            disabled={relayLoading}
          >
            {showRelayForm ? 'Cancel' : 'Add Relay'}
          </button>
        </div>

        {#if showRelayForm}
          <div class="surface-card space-y-3 p-4">
            <input
              type="text"
              placeholder="wss://relay.example.com"
              bind:value={newRelayUrl}
              class="w-full rounded-lg border border-dark-border bg-dark/50 px-3 py-2 text-sm text-text-soft placeholder-text-muted/50 outline-none focus:border-primary/60"
              disabled={relayLoading}
            />
            <button
              type="button"
              on:click={handleAddRelay}
              disabled={relayLoading || !newRelayUrl.trim()}
              class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-dark transition-colors disabled:opacity-50 hover:bg-primary/90"
            >
              {relayLoading ? 'Adding...' : 'Add Relay'}
            </button>
          </div>
        {/if}

        {#if relayError}
          <div class="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {relayError}
          </div>
        {/if}

        {#if relaySuccess}
          <div class="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-300">
            {relaySuccess}
          </div>
        {/if}

        {#if relayLoading}
          <div class="flex items-center justify-center py-4">
            <p class="text-sm text-text-muted">Loading...</p>
          </div>
        {:else if relays.length === 0}
          <div class="rounded-lg border border-dark-border/60 bg-dark/50 p-4 text-center text-sm text-text-muted">
            No relays configured. Add one to get started.
          </div>
        {:else}
          <div class="space-y-2">
            {#each relays as relay, index (relay.url)}
              <div class="surface-card flex items-center justify-between gap-4 p-4">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium text-text-soft">{relay.url}</p>
                  <div class="mt-2 flex gap-4">
                    <label class="flex items-center gap-2 text-xs text-text-muted">
                      <input
                        type="checkbox"
                        checked={relay.read}
                        on:change={() => handleToggleRelay(index, 'read')}
                        disabled={relayLoading || (!relay.read && !relay.write)}
                        class="rounded accent-primary"
                      />
                      <span>Read</span>
                    </label>
                    <label class="flex items-center gap-2 text-xs text-text-muted">
                      <input
                        type="checkbox"
                        checked={relay.write}
                        on:change={() => handleToggleRelay(index, 'write')}
                        disabled={relayLoading || (!relay.read && !relay.write)}
                        class="rounded accent-primary"
                      />
                      <span>Write</span>
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  on:click={() => handleRemoveRelay(relay.url)}
                  disabled={relayLoading || relays.length === 1}
                  class="text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                  title="Remove relay"
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    {:else if activeTab === 'wallet'}
      <div class="max-w-3xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-lg font-semibold text-text-soft">Monero Wallet</h4>
            <p class="text-sm text-text-muted mt-1">
              {$walletState.hasWallet ? ($walletState.isReady ? 'Wallet ready' : 'Setting up wallet...') : 'No wallet configured'}
            </p>
          </div>
          <button
            class="rounded-full border border-dark-border/70 px-5 py-2 text-sm font-medium text-text-soft transition-colors hover:border-primary/60 hover:text-white"
            on:click={() => showWallet.set(true)}
          >
            {$walletState.hasWallet ? 'Open Wallet' : 'Set Up Wallet'}
          </button>
        </div>

        <div class="surface-card space-y-6 p-6">
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Balance</p>
              <p class="mt-2 text-3xl font-bold text-primary">
                {$walletState.balance.toFixed(6)} XMR
              </p>
              <p class="text-sm text-text-muted">Unlocked: {$walletState.unlockedBalance.toFixed(6)} XMR</p>
            </div>
          </div>

          {#if $walletState.address}
            <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
              <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Address</p>
              <p class="mt-2 break-all text-sm text-text-soft/80 font-mono">
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

          {#if $walletState.hasWallet}
            <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
              <label class="block">
                <p class="text-sm font-semibold text-text-soft mb-2">Monero Node</p>
                <select
                  class="w-full rounded-lg border border-dark-border bg-dark/50 px-3 py-2 text-sm text-text-soft outline-none focus:border-primary/60"
                  value={$walletState.selectedNode ?? nodes[0]?.id}
                  on:change={handleNodeChange}
                  disabled={nodeBusy !== null}
                >
                  {#each nodes as node (node.id)}
                    <option value={node.id}>
                      {node.label} - {node.uri}
                    </option>
                  {/each}
                </select>
                {#if nodeBusy}
                  <p class="mt-2 text-xs text-text-muted">Switching nodes...</p>
                {/if}
              </label>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
