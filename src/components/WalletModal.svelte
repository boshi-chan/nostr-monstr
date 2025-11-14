<script lang="ts">
  import { fade } from 'svelte/transition'
  import { walletState, showWallet } from '$stores/wallet'
  import { currentUser } from '$stores/auth'
  import {
    initWallet,
    setActiveNode,
    saveCustomNode,
    clearCustomNode,
    refreshWallet,
    restoreWalletFromNostr,
    sendMonero,
    deleteWallet,
    getTransactionHistory,
    unlockWallet,
  } from '$lib/wallet/lazy'
  import { getCachedMnemonic, type WalletInfo } from '$lib/wallet'
  import { toDataURL as qrToDataURL } from 'qrcode'
  import { CUSTOM_NODE_ID, DEFAULT_NODES, type MoneroNode } from '$lib/wallet/nodes'
  import LayoutGridIcon from 'lucide-svelte/icons/layout-grid'
  import ClockIcon from 'lucide-svelte/icons/clock'
  import ArrowDownIcon from 'lucide-svelte/icons/arrow-down'
  import ArrowUpIcon from 'lucide-svelte/icons/arrow-up'

  const builtInNodes: MoneroNode[] = [...DEFAULT_NODES]
  let nodes: MoneroNode[] = [...builtInNodes]
  let customNodeEntry: MoneroNode | null = null

  let importSeed = ''
  let activeTab: 'create' | 'import' = 'create'
  let activePanel: 'overview' | 'deposit' | 'withdraw' | 'history' = 'overview'
  let error: string | null = null
  let loading = false
  let restoreBusy = false
  let showSeedPhrase = false
  let recentWallet: WalletInfo | null = null
  let nodeBusy: string | null = null
  let sendAddress = ''
  let sendAmount = ''
  let sendNote = ''
  let sendRecipientPubkey = ''
  let sendNoteId: string | null = null
  let sendLoading = false
  let sendError: string | null = null
  let lastTxHash: string | null = null
  let syncError: string | null = null
  let depositQr: string | null = null
  let qrError: string | null = null
  let lastQrAddress: string | null = null
  let deleteBusy = false
  let restoreHeightOverride = ''
  let transactions: any[] = []
  let loadingHistory = false
  let historyError: string | null = null
  let unlockBusy = false
  let customNodeLabel = ''
  let customNodeUri = ''
  let customNodeError: string | null = null
  let customNodeBusy = false
  let customFormTouched = false

  $: isOpen = $showWallet
  $: walletMode = !$walletState.hasWallet ? 'setup' : $walletState.isReady ? 'ready' : 'pending'
  $: customNodeEntry =
    $walletState.customNodeUri
      ? {
          id: CUSTOM_NODE_ID,
          label: $walletState.customNodeLabel ?? 'Custom node',
          uri: $walletState.customNodeUri,
        }
      : null
  $: nodes = customNodeEntry ? [...builtInNodes, customNodeEntry] : [...builtInNodes]
  $: selectedNodeId = $walletState.selectedNode ?? nodes[0]?.id
  $: displayMnemonic =
    walletMode === 'ready'
      ? recentWallet?.mnemonic ?? getCachedMnemonic()
      : recentWallet?.mnemonic ?? null
  $: if (walletMode !== 'ready') {
    activePanel = 'overview'
  }
  $: if (!isOpen) {
    resetForm()
  }

  $: if (walletMode === 'ready' && $walletState.address) {
    if ($walletState.address !== lastQrAddress) {
      void generateDepositQr($walletState.address)
    }
  } else {
    depositQr = null
    lastQrAddress = null
  }

  $: if (!customFormTouched) {
    customNodeLabel = $walletState.customNodeLabel ?? ''
    customNodeUri = $walletState.customNodeUri ?? ''
  }

  function resetForm(): void {
    importSeed = ''
    activeTab = 'create'
    activePanel = 'overview'
    error = null
    loading = false
    restoreBusy = false
    showSeedPhrase = false
    recentWallet = null
    nodeBusy = null
    sendAddress = ''
    sendAmount = ''
    sendNote = ''
    sendRecipientPubkey = ''
    sendNoteId = null
    sendError = null
    lastTxHash = null
    syncError = null
    depositQr = null
    qrError = null
    lastQrAddress = null
    restoreHeightOverride = ''
    transactions = []
    loadingHistory = false
    historyError = null
    unlockBusy = false
    customNodeError = null
    customNodeBusy = false
    customFormTouched = false
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

    let parsedRestoreHeight: number | undefined
    if (restoreHeightOverride.trim().length > 0) {
      parsedRestoreHeight = Number(restoreHeightOverride.trim())
      if (!Number.isFinite(parsedRestoreHeight) || parsedRestoreHeight <= 0) {
        error = 'Restore height must be a positive number.'
        return
      }
      parsedRestoreHeight = Math.floor(parsedRestoreHeight)
    }

    loading = true
    error = null
    try {
      const wallet = await initWallet(
        activeTab === 'import' ? importSeed.trim() : undefined,
        parsedRestoreHeight ? { restoreHeight: parsedRestoreHeight } : undefined
      )
      recentWallet = wallet
      showSeedPhrase = true
      importSeed = ''
      restoreHeightOverride = ''
    } catch (err) {
      console.error('Wallet setup failed', err)
      error = err instanceof Error ? err.message : 'Unable to set up wallet. Please try again.'
    } finally {
      loading = false
    }
  }

  async function handleRestoreViaNostr(): Promise<void> {
    restoreBusy = true
    error = null
    try {
      const wallet = await restoreWalletFromNostr()
      recentWallet = wallet
      showSeedPhrase = true
      importSeed = ''
    } catch (err) {
      console.error('Wallet restore failed', err)
      error = err instanceof Error ? err.message : 'Unable to restore wallet. Please try again.'
    } finally {
      restoreBusy = false
    }
  }

  async function handleRefresh(): Promise<void> {
    syncError = null
    try {
      await refreshWallet()
    } catch (err) {
      console.error('Wallet sync failed', err)
      syncError = err instanceof Error ? err.message : 'Unable to refresh balance.'
    }
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

  function useMaxBalance(): void {
    sendAmount = $walletState.unlockedBalance.toFixed(6)
  }

  async function handleSend(): Promise<void> {
    if (!$walletState.isReady) {
      sendError = 'Finish wallet setup before sending.'
      return
    }
    const amountValue = Number(sendAmount)
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      sendError = 'Enter a valid amount of XMR.'
      return
    }
    if (!sendAddress.trim()) {
      sendError = 'Recipient address is required.'
      return
    }

    sendLoading = true
    sendError = null
    try {
      const result = await sendMonero({
        address: sendAddress.trim(),
        amount: amountValue,
        note: sendNote.trim() || undefined,
        recipientPubkey: sendRecipientPubkey || undefined,
        noteId: sendNoteId ?? undefined,
      })
      lastTxHash = result.txHash
      sendAmount = ''
      sendNote = ''
      sendAddress = ''
      sendRecipientPubkey = ''
      sendNoteId = null
    } catch (err) {
      console.error('Failed to send Ember payment', err)
      sendError = err instanceof Error ? err.message : 'Unable to send payment. Please try again.'
    } finally {
      sendLoading = false
    }
  }

  function markCustomFormTouched(): void {
    if (!customFormTouched) {
      customFormTouched = true
    }
  }

  async function handleCustomNodeSave(): Promise<void> {
    if (customNodeBusy) return
    customNodeError = null
    customNodeBusy = true
    try {
      await saveCustomNode({
        label: customNodeLabel.trim() || undefined,
        uri: customNodeUri.trim(),
      })
      customFormTouched = false
    } catch (err) {
      console.error('Failed to save custom node', err)
      customNodeError =
        err instanceof Error ? err.message : 'Unable to save custom node. Check the URL and try again.'
    } finally {
      customNodeBusy = false
    }
  }

  async function handleCustomNodeRemove(): Promise<void> {
    if (customNodeBusy) return
    customNodeError = null
    customNodeBusy = true
    try {
      await clearCustomNode()
      customNodeLabel = ''
      customNodeUri = ''
      customFormTouched = false
    } catch (err) {
      console.error('Failed to remove custom node', err)
      customNodeError = err instanceof Error ? err.message : 'Unable to remove custom node.'
    } finally {
      customNodeBusy = false
    }
  }

  async function handleUnlockWallet(): Promise<void> {
    unlockBusy = true
    error = null
    try {
      await unlockWallet()
    } catch (err) {
      if (!(err instanceof Error && err.message === 'WALLET_PIN_CANCELLED')) {
        error = err instanceof Error ? err.message : 'Unable to unlock wallet.'
      }
    } finally {
      unlockBusy = false
    }
  }

  function formatRelativeTime(timestamp: number | null): string {
    if (!timestamp) return 'never'
    const diff = Date.now() - timestamp
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  async function handleDeleteWallet(): Promise<void> {
    if (deleteBusy) return
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'This will remove the wallet from this device. You must have your seed saved to restore later. Continue?'
          )
    if (!confirmed) return
    deleteBusy = true
    try {
      await deleteWallet()
      resetForm()
      showWallet.set(false)
    } catch (err) {
      console.error('Failed to delete wallet', err)
      error = 'Unable to delete wallet. Please try again.'
    } finally {
      deleteBusy = false
    }
  }
  async function generateDepositQr(address: string): Promise<void> {
    try {
      qrError = null
      lastQrAddress = address
      depositQr = await qrToDataURL(address, { margin: 1, scale: 6 })
    } catch (err) {
      console.error('Failed to generate deposit QR', err)
      qrError = 'Unable to generate QR code right now.'
      depositQr = null
    }
  }

  function handleHistoryClick(): void {
    activePanel = 'history'
    if (transactions.length === 0) {
      void loadTransactionHistory()
    }
  }

  async function loadTransactionHistory(): Promise<void> {
    if (loadingHistory) return
    loadingHistory = true
    historyError = null
    try {
      transactions = await getTransactionHistory()
      console.log('📜 Loaded transaction history:', transactions.length, 'transactions')
      if (transactions.length > 0) {
        console.log('First transaction:', transactions[0])
      }
    } catch (err) {
      console.error('Failed to load transaction history', err)
      historyError = err instanceof Error ? err.message : 'Unable to load transaction history.'
    } finally {
      loadingHistory = false
    }
  }

  function formatTxDate(timestamp: number | null): string {
    if (!timestamp) return 'Pending'
    const date = new Date(timestamp)
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatTxTime(timestamp: number | null): string {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  function getTxDirection(tx: any): 'in' | 'out' {
    // Check if transaction has any incoming transfers
    const incomingTransfers = tx.getIncomingTransfers?.() || []
    const outgoingTransfer = tx.getOutgoingTransfer?.()

    if (incomingTransfers.length > 0) return 'in'
    if (outgoingTransfer) return 'out'

    // Fallback: check if it's in the subaddresses we own
    return tx.getIsIncoming?.() ? 'in' : 'out'
  }

  function getTxAmount(tx: any): number {
    const direction = getTxDirection(tx)
    const incomingTransfers = tx.getIncomingTransfers?.() || []
    const outgoingTransfer = tx.getOutgoingTransfer?.()

    if (direction === 'in' && incomingTransfers.length > 0) {
      // Handle BigInt amounts from Monero
      const totalBigInt = incomingTransfers.reduce((sum: bigint, transfer: any) => {
        const amount = transfer.getAmount?.() || 0n
        // Convert to BigInt if it's a number
        const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount)
        return sum + amountBigInt
      }, 0n)
      // Convert BigInt to number
      return Number(totalBigInt)
    }

    if (direction === 'out' && outgoingTransfer) {
      const amount = outgoingTransfer.getAmount?.() || 0
      // Handle BigInt
      return typeof amount === 'bigint' ? Number(amount) : Number(amount)
    }

    return 0
  }

  function formatXmr(atomic: number): string {
    // Convert atomic units to XMR (1 XMR = 1e12 atomic units)
    const xmr = atomic / 1_000_000_000_000
    return xmr.toFixed(6)
  }

  function getTxHash(tx: any): string {
    return tx.getHash?.() || tx.getId?.() || 'Unknown'
  }

  function shortenHash(hash: string): string {
    if (hash.length <= 16) return hash
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center px-4 py-4" aria-labelledby="wallet-modal-title" aria-modal="true" role="dialog" transition:fade>
    <button
      type="button"
      class="absolute inset-0 bg-dark/80 backdrop-blur-md"
      aria-label="Close wallet modal"
      on:click={closeModal}
    ></button>
    <div class="relative w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl border border-dark-border/60 bg-dark-light/95 p-4 md:p-6 shadow-2xl">
      <header class="flex items-center justify-between gap-4">
        <div>
          <h2 id="wallet-modal-title" class="text-lg font-semibold text-text-soft">Ember Wallet</h2>
          <p class="text-sm text-text-muted/75">
            {#if walletMode === 'setup'}
              Create or import a Monero wallet to send and receive tips.
            {:else if walletMode === 'pending'}
              Your wallet is locked. Enter your PIN to unlock or restore a backup.
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
            <div class="mt-3">
              <label for="wallet-restore-height" class="text-xs uppercase tracking-[0.25em] text-text-muted">
                Restore height (optional)
              </label>
              <input
                id="wallet-restore-height"
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
                bind:value={restoreHeightOverride}
                placeholder="Enter block height if known"
              />
              <p class="mt-1 text-xs text-text-muted">
                Use the block height from your previous wallet (or a slightly earlier block) for faster sync.
              </p>
            </div>
          {/if}

          <button class="btn-primary w-full justify-center" on:click={handleCreateOrImport} disabled={loading}>
            {loading ? 'Preparing wallet…' : activeTab === 'create' ? 'Create wallet' : 'Import wallet'}
          </button>

          {#if $currentUser}
            <button
              class="mt-3 w-full rounded-2xl border border-primary/50 px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary/10"
              type="button"
              on:click={handleRestoreViaNostr}
              disabled={restoreBusy}
            >
              {restoreBusy ? 'Restoring…' : 'Restore from Nostr backup'}
            </button>
            <p class="mt-2 text-xs text-text-muted/80">
              Secure your seed phrase offline—your wallet automatically unlocks on this device.
            </p>
          {:else}
            <p class="mt-3 text-xs text-text-muted/75">
              Log in with your Nostr key to sync a private wallet backup.
            </p>
          {/if}
        {:else if walletMode === 'pending'}
          {#if $walletState.locked}
            <div class="rounded-2xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-100 space-y-2">
              <p>We found your encrypted Ember wallet on this device, but it’s locked behind your PIN.</p>
              <p class="text-xs text-amber-200">
                Reminder: this is a hot wallet. Only keep small balances on this browser and never share your PIN.
              </p>
            </div>
            <div class="flex flex-col gap-3 md:grid md:grid-cols-3">
              <button
                class="btn-primary flex-1 justify-center"
                type="button"
                on:click={handleUnlockWallet}
                disabled={unlockBusy}
              >
                {unlockBusy ? 'Unlocking…' : 'Unlock with PIN'}
              </button>
              <button
                class="btn-secondary flex-1 justify-center"
                type="button"
                on:click={handleRestoreViaNostr}
                disabled={restoreBusy}
              >
                {restoreBusy ? 'Restoring…' : 'Restore backup'}
              </button>
              <button
                class="flex-1 rounded-2xl border border-dark-border/60 px-4 py-2 text-sm font-semibold text-text-soft transition hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-50"
                type="button"
                on:click={handleDeleteWallet}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Removing…' : 'Remove local wallet'}
              </button>
            </div>
          {:else}
            <div class="rounded-2xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-100 space-y-2">
              <p>Your wallet setup is incomplete. Restore from backup or remove the local data to start fresh.</p>
            </div>
            <div class="flex flex-col gap-3 md:flex-row">
              <button
                class="btn-primary flex-1 justify-center"
                type="button"
                on:click={handleRestoreViaNostr}
                disabled={restoreBusy}
              >
                {restoreBusy ? 'Restoring…' : 'Restore backup'}
              </button>
              <button
                class="flex-1 rounded-2xl border border-dark-border/60 px-4 py-2 text-sm font-semibold text-text-soft transition hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-50"
                type="button"
                on:click={handleDeleteWallet}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Removing…' : 'Remove local wallet'}
              </button>
            </div>
          {/if}
        {:else}
          <div class="flex gap-2 rounded-2xl border border-dark-border/60 bg-dark/60 p-1 text-sm font-semibold text-text-muted">
            <button
              type="button"
              class={`flex-1 rounded-xl px-3 py-2 transition flex items-center justify-center gap-2 ${activePanel === 'overview' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
              on:click={() => (activePanel = 'overview')}
            >
              <LayoutGridIcon size={16} />
              <span class="hidden sm:inline">Overview</span>
            </button>
            <button
              type="button"
              class={`flex-1 rounded-xl px-3 py-2 transition flex items-center justify-center gap-2 ${activePanel === 'history' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
              on:click={handleHistoryClick}
            >
              <ClockIcon size={16} />
              <span class="hidden sm:inline">History</span>
            </button>
            <button
              type="button"
              class={`flex-1 rounded-xl px-3 py-2 transition flex items-center justify-center gap-2 ${activePanel === 'deposit' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
              on:click={() => (activePanel = 'deposit')}
            >
              <ArrowDownIcon size={16} />
              <span class="hidden sm:inline">Deposit</span>
            </button>
            <button
              type="button"
              class={`flex-1 rounded-xl px-3 py-2 transition flex items-center justify-center gap-2 ${activePanel === 'withdraw' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
              on:click={() => (activePanel = 'withdraw')}
            >
              <ArrowUpIcon size={16} />
              <span class="hidden sm:inline">Withdraw</span>
            </button>
          </div>

          <p class="text-xs text-text-muted/80">
            This on-device wallet is non-custodial and meant for quick Embers. For larger savings, withdraw to your long-term wallet.
          </p>

          {#if activePanel === 'overview'}
            <div class="rounded-2xl border border-dark-border/60 bg-dark/50 p-4">
              <div class="flex items-center justify-between gap-4">
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
                  Copy
                </button>
              </div>
            </div>

            <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-4">
              <div class="flex items-center justify-between">
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Balance</p>
                <button
                  type="button"
                  class="rounded-full border border-dark-border/60 px-3 py-1 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-white disabled:opacity-50"
                  on:click={handleRefresh}
                  disabled={$walletState.isSyncing}
                >
                  {$walletState.isSyncing ? 'Syncing…' : 'Refresh'}
                </button>
              </div>
              <p class="mt-2 text-3xl font-semibold text-primary">
                {$walletState.balance.toFixed(6)} XMR
              </p>
              <p class="text-sm text-text-muted">
                Unlocked: {$walletState.unlockedBalance.toFixed(6)} XMR
              </p>
              <p class="mt-1 text-xs text-text-muted/80">
                {$walletState.lastSyncedAt ? `Last synced ${formatRelativeTime($walletState.lastSyncedAt)}` : 'Not synced yet'}
              </p>
              {#if syncError}
                <p class="mt-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{syncError}</p>
              {/if}
            </div>

            <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-4">
              <div class="flex items-center justify-between">
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Connected node</p>
                {#if nodeBusy}
                  <span class="text-xs text-text-muted">Switching…</span>
                {/if}
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
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
              <p class="mt-3 text-xs text-text-muted">
                Restore height: {$walletState.restoreHeight ?? '—'}
              </p>
              <div class="mt-4 rounded-2xl border border-dark-border/60 bg-dark/40 p-3">
                <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">Custom node</p>
                <p class="mt-2 text-[12px] text-text-muted">
                  Paste a HTTPS endpoint that enables CORS so browsers can talk to it directly.
                </p>
                <form class="mt-3 space-y-2" on:submit|preventDefault={handleCustomNodeSave}>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <input
                      class="w-full rounded-xl border border-dark-border/60 bg-dark/60 px-3 py-2 text-sm text-text-soft focus:border-primary focus:outline-none"
                      placeholder="Label (optional)"
                      bind:value={customNodeLabel}
                      on:input={markCustomFormTouched}
                    />
                    <input
                      class="w-full rounded-xl border border-dark-border/60 bg-dark/60 px-3 py-2 text-sm text-text-soft focus:border-primary focus:outline-none"
                      placeholder="https://node.example.com:443"
                      bind:value={customNodeUri}
                      on:input={markCustomFormTouched}
                    />
                  </div>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="submit"
                      class="btn-secondary flex-1 justify-center"
                      disabled={customNodeBusy}
                    >
                      {customNodeBusy ? 'Saving…' : 'Save & connect'}
                    </button>
                    {#if $walletState.customNodeUri}
                      <button
                        type="button"
                        class="flex-1 rounded-full border border-dark-border/60 px-4 py-2 text-sm font-semibold text-text-muted transition hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-50"
                        on:click={handleCustomNodeRemove}
                        disabled={customNodeBusy}
                      >
                        Remove custom node
                      </button>
                    {/if}
                  </div>
                  {#if customNodeError}
                    <p class="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-100">{customNodeError}</p>
                  {/if}
                  <p class="text-[11px] text-text-muted/70">
                    Tip: most public RPCs block browsers unless they send <code class="text-primary">Access-Control-Allow-Origin</code>.
                  </p>
                </form>
              </div>
            </div>

            <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-4">
              <div class="flex items-center justify-between">
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Backup</p>
                <span
                  class={`rounded-full px-3 py-1 text-xs font-semibold ${
                    $walletState.backupStatus === 'ok'
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : $walletState.backupStatus === 'syncing'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-amber-500/10 text-amber-200'
                  }`}
                >
                  {$walletState.backupStatus === 'ok'
                    ? 'Synced'
                    : $walletState.backupStatus === 'syncing'
                    ? 'Syncing'
                    : 'Pending'}
                </span>
              </div>
              <p class="mt-2 text-sm text-text-soft/90">
                {$walletState.remoteBackupAvailable
                  ? `Encrypted backup stored ${formatRelativeTime($walletState.lastBackupAt)} via your Nostr login.`
                  : 'Log in with your Nostr key to keep a private backup in sync.'}
              </p>
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
                  Keep this phrase private. You'll need it if you ever reinstall the app or move wallets.
                </p>
              {/if}
            </div>

            <div class="flex flex-col gap-2 md:flex-row md:gap-3">
              <button
                type="button"
                class="btn-primary flex-1 justify-center"
                on:click={() => copyToClipboard($walletState.address, 'address')}
              >
                Share address
              </button>
              <button
                type="button"
                class="rounded-full border border-rose-500/60 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
                on:click={handleDeleteWallet}
                disabled={deleteBusy}
              >
                {deleteBusy ? 'Deleting…' : 'Delete wallet'}
              </button>
            </div>
          {:else if activePanel === 'deposit'}
            <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-4 text-center">
              <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Deposit via QR</p>
              {#if depositQr}
                <img src={depositQr} alt="Monero deposit QR" class="mx-auto mt-4 h-48 w-48 rounded-xl border border-dark-border/40 bg-dark/80 p-3" />
              {:else}
                <div class="mt-6 rounded-xl border border-dashed border-dark-border/60 bg-dark/40 p-6 text-sm text-text-muted">
                  {qrError ?? 'Generating QR code…'}
                </div>
              {/if}
              <p class="mt-4 text-xs text-text-muted">
                Scan with any Monero wallet or share your address. Funds stay in your browser until you withdraw.
              </p>
              <div class="mt-5 rounded-2xl border border-dark-border/60 bg-dark/50 p-4 text-left">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Deposit address</p>
                  <button
                    type="button"
                    class="rounded-full border border-dark-border/60 px-4 py-1 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-white"
                    on:click={() => copyToClipboard($walletState.address, 'address')}
                  >
                    Copy
                  </button>
                </div>
                <p class="mt-2 break-all text-sm text-text-soft/90">
                  {$walletState.address}
                </p>
              </div>
            </div>
          {:else if activePanel === 'withdraw'}
            <form class="space-y-4" on:submit|preventDefault={handleSend}>
              <div>
                <label for="withdraw-amount" class="text-xs uppercase tracking-[0.25em] text-text-muted">Amount to withdraw (XMR)</label>
                <div class="mt-2 flex gap-2">
                  <input
                    id="withdraw-amount"
                    type="number"
                    min="0"
                    step="0.000001"
                    class="flex-1 rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
                    bind:value={sendAmount}
                    placeholder="0.010000"
                  />
                  <button
                    type="button"
                    class="rounded-2xl border border-dark-border/60 px-3 py-2 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-white"
                    on:click={useMaxBalance}
                  >
                    Max
                  </button>
                </div>
                <p class="mt-1 text-xs text-text-muted">Unlocked: {$walletState.unlockedBalance.toFixed(6)} XMR</p>
              </div>

              <div>
                <label for="withdraw-address" class="text-xs uppercase tracking-[0.25em] text-text-muted">Recipient address</label>
                <textarea
                  id="withdraw-address"
                  rows="3"
                  class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 p-3 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
                  bind:value={sendAddress}
                  placeholder="Paste a Monero address or subaddress"
                  required
                />
              </div>

              {#if sendRecipientPubkey}
                <p class="text-xs text-text-muted/80">
                  Target pubkey: <span class="font-mono text-text-soft">{sendRecipientPubkey.slice(0, 16)}…</span>
                </p>
              {/if}

              <div>
                <label for="withdraw-note" class="text-xs uppercase tracking-[0.25em] text-text-muted">Optional note</label>
                <input
                  id="withdraw-note"
                  type="text"
                  class="mt-2 w-full rounded-2xl border border-dark-border/60 bg-dark/70 px-3 py-2 text-sm text-text-soft focus:border-primary/60 focus:outline-none"
                  bind:value={sendNote}
                  placeholder="Attach a short note"
                />
              </div>

              <button class="btn-primary w-full justify-center" type="submit" disabled={sendLoading}>
                {sendLoading ? 'Sending…' : 'Send Ember'}
              </button>

              {#if sendError}
                <p class="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{sendError}</p>
              {/if}

              {#if lastTxHash}
                <p class="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
                  Sent! Tx hash {lastTxHash.slice(0, 18)}…
                </p>
              {/if}

              <p class="text-xs text-text-muted/80">
                Withdrawals send XMR directly from this lightweight wallet. Please move long-term holdings to a dedicated cold-storage wallet.
              </p>
            </form>
          {:else if activePanel === 'history'}
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Transaction History</p>
                <button
                  type="button"
                  class="rounded-full border border-dark-border/60 px-3 py-1 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-white disabled:opacity-50"
                  on:click={loadTransactionHistory}
                  disabled={loadingHistory}
                >
                  {loadingHistory ? 'Loading…' : 'Refresh'}
                </button>
              </div>

              {#if loadingHistory && transactions.length === 0}
                <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-6 text-center text-sm text-text-muted">
                  Loading transaction history...
                </div>
              {:else if historyError}
                <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                  {historyError}
                </div>
              {:else if transactions.length === 0}
                <div class="rounded-2xl border border-dark-border/60 bg-dark/60 p-6 text-center text-sm text-text-muted">
                  No transactions yet. Deposit or receive Embers to see your history.
                </div>
              {:else}
                <div class="space-y-2 max-h-96 overflow-y-auto">
                  {#each transactions as tx (getTxHash(tx))}
                    {@const direction = getTxDirection(tx)}
                    {@const amount = getTxAmount(tx)}
                    {@const hash = getTxHash(tx)}
                    {@const timestamp = tx.getTimestamp?.() || tx.getBlock?.()?.getTimestamp?.() || null}
                    {@const isConfirmed = tx.getIsConfirmed?.() || false}
                    {@const confirmations = tx.getNumConfirmations?.() || 0}

                    <div class="rounded-2xl border border-dark-border/60 bg-dark/50 p-4 hover:bg-dark/70 transition-colors">
                      <div class="flex items-start justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span class={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                              direction === 'in'
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : 'bg-orange-500/10 text-orange-300'
                            }`}>
                              {direction === 'in' ? '↓' : '↑'}
                            </span>
                            <span class="text-sm font-semibold text-text-soft">
                              {direction === 'in' ? 'Received' : 'Sent'}
                            </span>
                            {#if !isConfirmed}
                              <span class="text-xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                Pending
                              </span>
                            {/if}
                          </div>
                          <p class="mt-1 text-xs font-mono text-text-muted break-all">
                            {shortenHash(hash)}
                          </p>
                          <p class="mt-1 text-xs text-text-muted">
                            {formatTxDate(timestamp)} {formatTxTime(timestamp)}
                            {#if isConfirmed}
                              · {confirmations} confirmations
                            {/if}
                          </p>
                        </div>
                        <div class="text-right">
                          <p class={`text-base font-semibold ${
                            direction === 'in' ? 'text-emerald-300' : 'text-text-soft'
                          }`}>
                            {direction === 'in' ? '+' : '-'}{formatXmr(amount)} XMR
                          </p>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>

                <p class="text-xs text-center text-text-muted/70 pt-2">
                  Showing {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
                </p>
              {/if}

              <p class="text-xs text-text-muted/80">
                Transaction history is stored privately on your device. This data is not shared or backed up to Nostr.
              </p>
            </div>
          {/if}
        {/if}
      </section>

      {#if error && walletMode !== 'ready'}
        <p class="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>
      {/if}

      {#if walletMode !== 'setup'}
        <p class="mt-4 text-center text-xs text-text-muted/70">
          Ember Wallet keeps your keys on-device. Non-custodial Monero for tipping.
        </p>
      {/if}
    </div>
  </div>
{/if}

<svelte:window on:keydown={handleKeydown} />
