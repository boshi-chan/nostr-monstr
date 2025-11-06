<script lang="ts">
  import { fade } from 'svelte/transition'
  import { walletState, showWallet } from '$stores/wallet'
  import {
    initWallet,
    unlockWallet,
    lockWallet,
    getAvailableNodes,
    setActiveNode,
    getCachedMnemonic,
    type WalletInfo,
  } from '$lib/wallet'
  import type { MoneroNode } from '$lib/wallet/nodes'

  const nodes: MoneroNode[] = getAvailableNodes()

  let setupPin = ''
  let confirmPin = ''
  let unlockPin = ''
  let importSeed = ''
  let activeTab: 'create' | 'import' = 'create'
  let error: string | null = null
  let loading = false
  let showSeedPhrase = false
  let recentWallet: WalletInfo | null = null
  let nodeBusy: string | null = null

  $: isOpen = $showWallet
  $: walletMode = !$walletState.hasWallet ? 'setup' : $walletState.isLocked ? 'locked' : 'unlocked'
  $: selectedNodeId = $walletState.selectedNode ?? nodes[0]?.id
  $: displayMnemonic =
    walletMode === 'unlocked'
      ? recentWallet?.mnemonic ?? getCachedMnemonic()
      : recentWallet?.mnemonic ?? null

  $: if (!isOpen) {
    resetForm()
  }

  function resetForm(): void {
    setupPin = ''
    confirmPin = ''
    unlockPin = ''
    importSeed = ''
    activeTab = 'create'
    error = null
    loading = false
    showSeedPhrase = false
    recentWallet = null
    nodeBusy = null
  }

  function closeModal(): void {
    showWallet.set(false)
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!isOpen) return
    if (event.key === 'Escape') {
      closeModal()
    }
  }

  function validateSetupForm(): string | null {
    if (setupPin.trim().length < 4) {
      return 'PIN must be at least 4 characters.'
    }
    if (setupPin !== confirmPin) {
      return 'PINs do not match.'
    }
    if (activeTab === 'import' && importSeed.trim().length === 0) {
      return 'Seed phrase is required to import a wallet.'
    }
    return null
  }

  async function handleCreateOrImport(): Promise<void> {
    const validationError = validateSetupForm()
    if (validationError) {
      error = validationError
      return
    }

    loading = true
    error = null
    try {
      const wallet = await initWallet(setupPin.trim(), activeTab === 'import' ? importSeed.trim() : undefined)
      recentWallet = wallet
      showSeedPhrase = true
      setupPin = ''
      confirmPin = ''
      importSeed = ''
    } catch (err) {
      console.error('Wallet setup failed', err)
      error = err instanceof Error ? err.message : 'Unable to set up wallet. Please try again.'
    } finally {
      loading = false
    }
  }

  async function handleUnlock(): Promise<void> {
    if (unlockPin.trim().length === 0) {
      error = 'Enter your PIN to unlock the wallet.'
      return
    }

    loading = true
    error = null
    try {
      const wallet = await unlockWallet(unlockPin.trim())
      if (!wallet) {
        error = 'Invalid PIN. Please try again.'
      } else {
        recentWallet = wallet
        showSeedPhrase = false
        unlockPin = ''
      }
    } catch (err) {
      console.error('Failed to unlock wallet', err)
      error = 'Unable to unlock wallet. Please try again.'
    } finally {
      loading = false
    }
  }

  async function handleLock(): Promise<void> {
    lockWallet()
    recentWallet = null
    showSeedPhrase = false
  }

  async function handleNodeChange(nodeId: string): Promise<void> {
    if (nodeBusy || nodeId === selectedNodeId) return
    nodeBusy = nodeId
    error = null
    try {
      await setActiveNode(nodeId)
    } catch (err) {
      console.error('Failed to switch node', err)
      error = 'Unable to switch node. Please try again.'
    } finally {
      nodeBusy = null
    }
  }

  async function copyToClipboard(value: string | null, label: string): Promise<void> {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch (err) {
      console.error('Clipboard copy failed', err)
      error = `Unable to copy ${label}.`
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4" aria-labelledby="wallet-modal-title" aria-modal="true" role="dialog" transition:fade>
    <button
      type="button"
      class="absolute inset-0 bg-dark/80 backdrop-blur-md"
      aria-label="Close wallet modal"
      on:click={closeModal}
    ></button>
    <div class="relative w-full max-w-xl rounded-3xl border border-dark-border/60 bg-dark-light/95 p-6 shadow-2xl">
      <header class="flex items-center justify-between gap-4">
        <div>
          <h2 id="wallet-modal-title" class="text-lg font-semibold text-text-soft">Monstr Wallet</h2>
          <p class="text-sm text-text-muted/75">
            {#if walletMode === 'setup'}
              Create or import a Monero wallet to send and receive tips.
            {:else if walletMode === 'locked'}
              Unlock your wallet to access your address and funds.
            {:else}
              Wallet ready. Select a node, copy your address, or lock when done.
            {/if}
          </p>
        </div>
        <button
          type="button"
          class="rounded-full bg-dark/60 px-3 py-1 text-sm text-text-muted transition hover:bg-dark/80 hover:text-text-soft"
          on:click={closeModal}
        >
          Close
        </button>
      </header>

      <section class="mt-6 space-y-5">
        {#if walletMode === 'setup'}
          <div class="flex gap-2 rounded-2xl border border-dark-border/60 bg-dark/60 p-1 text-sm font-semibold text-text-muted">
            <button
              class={`flex-1 rounded-xl px-4 py-2 transition ${activeTab === 'create' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
              type="button"
              on:click={() => (activeTab = 'create')}
            >
              Create Wallet
            </button>
            <button
              class={`flex-1 rounded-xl px-4 py-2 transition ${activeTab === 'import' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
              type="button"
              on:click={() => (activeTab = 'import')}
            >
              Import Seed
            </button>
          </div>

          {#if activeTab === 'import'}
            <div>
              <label for="wallet-import-seed" class="text-xs uppercase tracking-[0.25em] text-text-muted">
                Seed phrase
              </label>
              <textarea
                id="wallet-import-seed"
                class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 p-3 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
                rows="3"
                bind:value={importSeed}
                placeholder="Enter your 25-word Monero seed phrase"
              />
            </div>
          {/if}

          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <label for="wallet-create-pin" class="text-xs uppercase tracking-[0.25em] text-text-muted">PIN</label>
              <input
                id="wallet-create-pin"
                type="password"
                class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
                minlength={4}
                bind:value={setupPin}
                placeholder="Choose a secure PIN"
              />
            </div>
            <div>
              <label for="wallet-confirm-pin" class="text-xs uppercase tracking-[0.25em] text-text-muted">Confirm PIN</label>
              <input
                id="wallet-confirm-pin"
                type="password"
                class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
                minlength={4}
                bind:value={confirmPin}
                placeholder="Re-enter PIN"
              />
            </div>
          </div>

          <button class="btn-primary w-full justify-center" on:click={handleCreateOrImport} disabled={loading}>
            {loading ? 'Preparing wallet…' : activeTab === 'create' ? 'Create wallet' : 'Import wallet'}
          </button>
        {:else if walletMode === 'locked'}
          <div>
            <label for="wallet-unlock-pin" class="text-xs uppercase tracking-[0.25em] text-text-muted">PIN</label>
            <input
              id="wallet-unlock-pin"
              type="password"
              class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
              minlength={4}
              bind:value={unlockPin}
              placeholder="Enter your PIN"
            />
          </div>
          <button class="btn-primary w-full justify-center" on:click={handleUnlock} disabled={loading}>
            {loading ? 'Unlocking…' : 'Unlock wallet'}
          </button>
        {:else}
          <div class="rounded-2xl border border-dark-border/60 bg-dark/50 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Primary address</p>
                <p class="mt-2 break-all text-sm text-text-soft/90">
                  {$walletState.address ?? '—'}
                </p>
              </div>
              <button
                type="button"
                class="rounded-full border border-dark-border/60 px-4 py-2 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-white"
                on:click={() => copyToClipboard($walletState.address, 'address')}
              >
                Copy address
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Balance</p>
            <p class="text-3xl font-semibold text-primary">
              {$walletState.balance.toFixed(6)} XMR
            </p>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Connected node</p>
              {#if nodeBusy}
                <span class="text-xs text-text-muted">Switching…</span>
              {/if}
            </div>
            <div class="flex flex-wrap gap-2">
              {#each nodes as node}
                <button
                  type="button"
                  class={`rounded-full border px-3 py-1 text-sm transition ${
                    selectedNodeId === node.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-dark-border/60 text-text-muted hover:text-text-soft'
                  }`}
                  on:click={() => handleNodeChange(node.id)}
                  disabled={nodeBusy === node.id}
                >
                  {node.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-4">
            <div class="flex items-center justify-between">
              <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Seed phrase</p>
              <button
                type="button"
                class="text-xs font-semibold text-primary transition hover:text-primary/80"
                on:click={() => (showSeedPhrase = !showSeedPhrase)}
              >
                {showSeedPhrase ? 'Hide' : 'Reveal'}
              </button>
            </div>
            {#if showSeedPhrase && displayMnemonic}
              <p class="mt-3 break-words text-sm leading-relaxed text-text-soft/90">{displayMnemonic}</p>
              <button
                type="button"
                class="mt-3 rounded-full border border-dark-border/60 px-4 py-2 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-white"
                on:click={() => copyToClipboard(displayMnemonic, 'seed phrase')}
              >
                Copy seed
              </button>
            {:else}
              <p class="mt-3 text-sm text-text-muted">
                Keep this phrase private. You’ll need it if you ever reinstall Monstr or move wallets.
              </p>
            {/if}
          </div>

          <div class="flex flex-col gap-2 md:flex-row md:gap-3">
            <button
              type="button"
              class="rounded-full border border-dark-border/60 px-4 py-2 text-sm font-semibold text-text-muted transition hover:border-primary/60 hover:text-white"
              on:click={handleLock}
            >
              Lock wallet
            </button>
            <button
              type="button"
              class="btn-primary flex-1 justify-center"
              on:click={() => copyToClipboard($walletState.address, 'address')}
            >
              Share address
            </button>
          </div>
        {/if}
      </section>

      {#if error}
        <p class="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>
      {/if}

      {#if walletMode !== 'setup'}
        <p class="mt-4 text-center text-xs text-text-muted/70">
          Monero tipping is in progress—wallets created here keep your keys on-device.
        </p>
      {/if}
    </div>
  </div>
{/if}

<svelte:window on:keydown={handleKeydown} />
