<script lang="ts">
  import { currentUser } from '$stores/auth'
  import { walletState } from '$stores/wallet'
  import { metadataCache } from '$stores/feed'
  import { getAvatarUrl, getNip05Display, fetchUserMetadata, getDisplayName } from '$lib/metadata'
  import {
    setActiveNode,
    initWallet,
    saveCustomNode,
    clearCustomNode,
    refreshWallet,
    sendMonero,
    deleteWallet,
    getTransactionHistory,
    unlockWallet,
    getCachedMnemonic,
    loadCachedMnemonic,
  } from '$lib/wallet/lazy'
  import { getRelaysFromNIP65, publishRelays, getDefaultRelays, isValidRelayUrl, type RelayConfig } from '$lib/relays'
  import { updateProfileMetadata, type EditableProfileFields } from '$lib/profile'
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import UserIcon from '../icons/UserIcon.svelte'
  import ServerIcon from '../icons/ServerIcon.svelte'
  import EmberIcon from '../icons/EmberIcon.svelte'
  import ZapIcon from '../icons/ZapIcon.svelte'
  import VolumeXIcon from 'lucide-svelte/icons/volume-x'
  import { mutedPubkeys, mutedWords, mutedHashtags, mutedEvents, unmuteUser, unmuteWord } from '$lib/mute'
  import { CUSTOM_NODE_ID, DEFAULT_NODES, type MoneroNode } from '$lib/wallet/nodes'
import { nwcConnection, nwcConnected, nwcSnapshot, setNWCFromURI, disconnectNWC, ensureNwcUnlocked } from '$stores/nwc'
  import { getNWCBalance, getNWCInfo } from '$lib/nwc'
  import type { WalletInfo } from '$types/wallet'
  import { toDataURL as qrToDataURL } from 'qrcode'
  import LayoutGridIcon from 'lucide-svelte/icons/layout-grid'
  import ClockIcon from 'lucide-svelte/icons/clock'
  import ArrowDownIcon from 'lucide-svelte/icons/arrow-down'
  import ArrowUpIcon from 'lucide-svelte/icons/arrow-up'

  type SettingsTab = 'profile' | 'relays' | 'wallet' | 'lightning' | 'mute'
  type WalletPanel = 'overview' | 'deposit' | 'withdraw' | 'history'

  let activeTab: SettingsTab = 'profile'

  // Profile editor state
  let isEditingProfile = false
  let profileSaving = false
  let profileError: string | null = null
  let profileSuccess: string | null = null
  let profileDisplayNameInput = ''
  let profileUsernameInput = ''
  let profileAboutInput = ''
  let profileWebsiteInput = ''
  let profileNip05Input = ''
  let profileAvatarInput = ''
  let profileBannerInput = ''
  let profileLud16Input = ''
  let profileLud06Input = ''
  let profileMoneroAddressInput = ''

  // Wallet state
  const builtInNodes: MoneroNode[] = [...DEFAULT_NODES]
  let nodes: MoneroNode[] = [...builtInNodes]
  let customNodeEntry: MoneroNode | null = null
  let importSeed = ''
  let activeWalletTab: 'create' | 'import' = 'create'
  let activeWalletPanel: WalletPanel = 'overview'
  let walletError: string | null = null
  let walletLoading = false
  let showSeedPhrase = false
  let recentWallet: WalletInfo | null = null
  let cachedMnemonic: string | null = null
  let mnemonicLoading = false
  let mnemonicAttempted = false
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
  let hasLockedLightning = false

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
  $: if (
    walletMode === 'ready' &&
    activeTab === 'wallet' &&
    !mnemonicAttempted &&
    !cachedMnemonic &&
    !mnemonicLoading
  ) {
    mnemonicAttempted = true
    mnemonicLoading = true
    loadCachedMnemonic()
      .then(value => {
        cachedMnemonic = value
      })
      .catch(err => {
        console.warn('Failed to load cached mnemonic', err)
      })
      .finally(() => {
        mnemonicLoading = false
      })
  }

  $: displayMnemonic =
    walletMode === 'ready'
      ? recentWallet?.mnemonic ?? cachedMnemonic ?? getCachedMnemonic()
      : recentWallet?.mnemonic ?? null
  $: if (walletMode !== 'ready') {
    activeWalletPanel = 'overview'
    mnemonicAttempted = false
  }

  $: if (walletMode === 'ready' && $walletState.address) {
    if ($walletState.address !== lastQrAddress) {
      void generateDepositQr($walletState.address)
    }
  } else {
    depositQr = null
    lastQrAddress = null
  }

  // Fetch metadata for all muted users
  $: if (activeTab === 'mute' && $mutedPubkeys.size > 0) {
    for (const pubkey of $mutedPubkeys) {
      if (!$metadataCache.has(pubkey)) {
        void fetchUserMetadata(pubkey)
      }
    }
  }

  $: if (!customFormTouched) {
    customNodeLabel = $walletState.customNodeLabel ?? ''
    customNodeUri = $walletState.customNodeUri ?? ''
  }

  $: hasLockedLightning = !$nwcConnected && Boolean($nwcSnapshot)

  // Ensure the current user's metadata is loaded before showing settings
  $: if ($currentUser?.pubkey) {
    const cachedMetadata = $metadataCache.get($currentUser.pubkey)
    if (!cachedMetadata || Object.keys(cachedMetadata).length === 0) {
      void fetchUserMetadata($currentUser.pubkey)
    }
  }

  function resetProfileForm(): void {
    profileDisplayNameInput = ''
    profileUsernameInput = ''
    profileAboutInput = ''
    profileWebsiteInput = ''
    profileNip05Input = ''
    profileAvatarInput = ''
    profileBannerInput = ''
    profileLud16Input = ''
    profileLud06Input = ''
    profileMoneroAddressInput = ''
  }

  function hydrateProfileForm(): void {
    const user = get(currentUser)
    if (!user?.pubkey) {
      resetProfileForm()
      return
    }

    const metadata = get(metadataCache).get(user.pubkey)
    profileDisplayNameInput = metadata?.display_name ?? user.display_name ?? user.name ?? ''
    profileUsernameInput = metadata?.name ?? user.name ?? ''
    profileAboutInput = metadata?.about ?? ''
    profileWebsiteInput = metadata?.website ?? ''
    profileNip05Input = metadata?.nip05 ?? ''
    profileAvatarInput = metadata?.picture ?? ''
    profileBannerInput = metadata?.banner ?? ''
    profileLud16Input = metadata?.lud16 ?? ''
    profileLud06Input = metadata?.lud06 ?? ''
    profileMoneroAddressInput = metadata?.monero_address ?? ''
  }

  function startProfileEdit(): void {
    const user = get(currentUser)
    if (!user?.pubkey) {
      profileError = 'You must be logged in to edit your profile.'
      return
    }

    hydrateProfileForm()
    profileError = null
    profileSuccess = null
    isEditingProfile = true
  }

  function cancelProfileEdit(): void {
    resetProfileForm()
    profileError = null
    profileSuccess = null
    profileSaving = false
    isEditingProfile = false
  }

  function collectProfilePayload(): EditableProfileFields {
    return {
      display_name: profileDisplayNameInput,
      name: profileUsernameInput,
      about: profileAboutInput,
      website: profileWebsiteInput,
      nip05: profileNip05Input,
      picture: profileAvatarInput,
      banner: profileBannerInput,
      lud16: profileLud16Input,
      lud06: profileLud06Input,
      monero_address: profileMoneroAddressInput
    }
  }

  function normalizeProfileForm(form: EditableProfileFields): EditableProfileFields {
    const cleaned: EditableProfileFields = { ...form }
    const fields: (keyof EditableProfileFields)[] = [
      'display_name',
      'name',
      'about',
      'website',
      'nip05',
      'picture',
      'banner',
      'lud16',
      'lud06',
      'monero_address'
    ]

    for (const key of fields) {
      const value = cleaned[key]
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.length === 0) {
          delete cleaned[key]
        } else if (key === 'about') {
          cleaned[key] = trimmed
        } else {
          cleaned[key] = trimmed
        }
      }
    }

    if (cleaned.website) {
      const hasProtocol = /^https?:\/\//i.test(cleaned.website)
      cleaned.website = hasProtocol ? cleaned.website : `https://${cleaned.website}`
    }

    if (cleaned.nip05) {
      cleaned.nip05 = cleaned.nip05.toLowerCase()
    }

    return cleaned
  }

  function validateProfileForm(form: EditableProfileFields): string | null {
    if (form.display_name && form.display_name.length > 80) {
      return 'Display name must be 80 characters or less'
    }

    if (form.name && form.name.length > 64) {
      return 'Username must be 64 characters or less'
    }

    if (form.about && form.about.length > 1024) {
      return 'Bio must be 1024 characters or less'
    }

    if (form.website) {
      try {
        const url = new URL(form.website)
        if (!['http:', 'https:'].includes(url.protocol)) {
          return 'Website must use http or https'
        }
      } catch {
        return 'Website must be a valid URL'
      }
    }

    if (form.nip05 && !/^[^@]+@[^@]+\.[^@]+$/.test(form.nip05)) {
      return 'NIP-05 must look like user@example.com'
    }

    if (form.lud16 && !/^[^@]+@[^@]+\.[^@]+$/.test(form.lud16)) {
      return 'LUD-16 must look like user@example.com'
    }

    if (form.lud06 && !form.lud06.toLowerCase().startsWith('lnurl')) {
      return 'LUD-06 must start with lnurl'
    }

    if (form.monero_address && form.monero_address.length < 95) {
      return 'Monero addresses should be full-length subaddresses'
    }

    if (form.monero_address && !/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(form.monero_address)) {
      return 'Monero address can only contain Base58 characters'
    }

    return null
  }

  async function handleProfileSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (profileSaving) return

    const user = get(currentUser)
    if (!user?.pubkey) {
      profileError = 'You must be logged in to update your profile.'
      return
    }

    const payload = normalizeProfileForm(collectProfilePayload())
    const validationMessage = validateProfileForm(payload)
    if (validationMessage) {
      profileError = validationMessage
      return
    }

    try {
      profileSaving = true
      profileError = null
      profileSuccess = null

      await updateProfileMetadata(payload)

      profileSuccess = 'Profile updated and broadcast to relays.'
      isEditingProfile = false
      resetProfileForm()
      setTimeout(() => (profileSuccess = null), 4000)
    } catch (err) {
      profileError = err instanceof Error ? err.message : 'Failed to update profile'
    } finally {
      profileSaving = false
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

  // Wallet functions
  function validateSetupForm(): string | null {
    if (activeWalletTab === 'import' && importSeed.trim().length === 0) {
      return 'Seed phrase is required to import a wallet.'
    }
    return null
  }

  async function handleCreateOrImport(): Promise<void> {
    const validationError = validateSetupForm()
    if (validationError) {
      walletError = validationError
      return
    }

    let parsedRestoreHeight: number | undefined
    if (restoreHeightOverride.trim().length > 0) {
      parsedRestoreHeight = Number(restoreHeightOverride.trim())
      if (!Number.isFinite(parsedRestoreHeight) || parsedRestoreHeight <= 0) {
        walletError = 'Restore height must be a positive number.'
        return
      }
      parsedRestoreHeight = Math.floor(parsedRestoreHeight)
    }

    walletLoading = true
    walletError = null
    try {
      const wallet = await initWallet(
        activeWalletTab === 'import' ? importSeed.trim() : undefined,
        parsedRestoreHeight ? { restoreHeight: parsedRestoreHeight } : undefined
      )
      recentWallet = wallet
      showSeedPhrase = true
      importSeed = ''
      restoreHeightOverride = ''
    } catch (err) {
      logger.error('Wallet setup failed', err)
      walletError = err instanceof Error ? err.message : 'Unable to set up wallet. Please try again.'
    } finally {
      walletLoading = false
    }
  }

  async function handleRefresh(): Promise<void> {
    syncError = null
    try {
      await refreshWallet()
    } catch (err) {
      logger.error('Wallet sync failed', err)
      syncError = err instanceof Error ? err.message : 'Unable to refresh balance.'
    }
  }

  async function handleNodeChange(nodeId: string): Promise<void> {
    if (nodeBusy || nodeId === selectedNodeId) return
    nodeBusy = nodeId
    walletError = null
    try {
      await setActiveNode(nodeId)
    } catch (err) {
      logger.error('Failed to switch node', err)
      walletError = 'Unable to switch node. Please try again.'
    } finally {
      nodeBusy = null
    }
  }

  async function copyToClipboard(value: string | null, label: string): Promise<void> {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch (err) {
      logger.error('Clipboard copy failed', err)
      walletError = `Unable to copy ${label}.`
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
      logger.error('Failed to send Ember payment', err)
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
      logger.error('Failed to save custom node', err)
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
      logger.error('Failed to remove custom node', err)
      customNodeError = err instanceof Error ? err.message : 'Unable to remove custom node.'
    } finally {
      customNodeBusy = false
    }
  }

  async function handleUnlockWallet(): Promise<void> {
    unlockBusy = true
    walletError = null
    try {
      await unlockWallet()
    } catch (err) {
      if (!(err instanceof Error && err.message === 'WALLET_PIN_CANCELLED')) {
        walletError = err instanceof Error ? err.message : 'Unable to unlock wallet.'
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
      importSeed = ''
      activeWalletTab = 'create'
      activeWalletPanel = 'overview'
      walletError = null
      walletLoading = false
      showSeedPhrase = false
      recentWallet = null
    } catch (err) {
      logger.error('Failed to delete wallet', err)
      walletError = 'Unable to delete wallet. Please try again.'
    } finally {
      deleteBusy = false
    }
  }

  function downloadSeed(seed: string | null): void {
    if (!seed || typeof window === 'undefined') return
    const timestamp = new Date().toISOString().slice(0, 10)
    const contents = `Monstr Ember Wallet Seed (${timestamp})\n\n${seed}\n`
    const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ember-wallet-seed-${timestamp}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  async function generateDepositQr(address: string): Promise<void> {
    try {
      qrError = null
      lastQrAddress = address
      depositQr = await qrToDataURL(address, { margin: 1, scale: 6 })
    } catch (err) {
      logger.error('Failed to generate deposit QR', err)
      qrError = 'Unable to generate QR code right now.'
      depositQr = null
    }
  }

  function handleHistoryClick(): void {
    activeWalletPanel = 'history'
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
      logger.info('📜 Loaded transaction history:', transactions.length, 'transactions')
      if (transactions.length > 0) {
        logger.info('First transaction:', transactions[0])
      }
    } catch (err) {
      logger.error('Failed to load transaction history', err)
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
    const incomingTransfers = tx.getIncomingTransfers?.() || []
    const outgoingTransfer = tx.getOutgoingTransfer?.()

    if (incomingTransfers.length > 0) return 'in'
    if (outgoingTransfer) return 'out'

    return tx.getIsIncoming?.() ? 'in' : 'out'
  }

  function getTxAmount(tx: any): number {
    const direction = getTxDirection(tx)
    const incomingTransfers = tx.getIncomingTransfers?.() || []
    const outgoingTransfer = tx.getOutgoingTransfer?.()

    if (direction === 'in' && incomingTransfers.length > 0) {
      const totalBigInt = incomingTransfers.reduce((sum: bigint, transfer: any) => {
        const amount = transfer.getAmount?.() || 0n
        const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount)
        return sum + amountBigInt
      }, 0n)
      return Number(totalBigInt)
    }

    if (direction === 'out' && outgoingTransfer) {
      const amount = outgoingTransfer.getAmount?.() || 0
      return typeof amount === 'bigint' ? Number(amount) : Number(amount)
    }

    return 0
  }

  function formatXmr(atomic: number): string {
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

  // Lightning/NWC state
  let nwcUri = ''
  let nwcConnecting = false
  let nwcUnlocking = false
  let nwcUnlockError: string | null = null
  let nwcError: string | null = null
  let nwcSuccess: string | null = null
  let nwcBalance: number | null = null
  let nwcInfo: Record<string, any> | null = null
  let loadingNWCData = false
  let nwcDataLoaded = false

  async function handleConnectNWC() {
    if (!nwcUri.trim()) {
      nwcError = 'Please enter a valid NWC connection string'
      return
    }

    try {
      nwcConnecting = true
      nwcError = null
      nwcSuccess = null

      const success = await setNWCFromURI(nwcUri)
      if (!success) {
        throw new Error('Invalid NWC connection string')
      }

      await loadNWCData()

      nwcUri = ''
      nwcUnlockError = null
      nwcSuccess = 'Successfully connected to wallet!'
      setTimeout(() => (nwcSuccess = null), 3000)
    } catch (err) {
      nwcError = err instanceof Error ? err.message : 'Failed to connect wallet'
      disconnectNWC()
    } finally {
      nwcConnecting = false
    }
  }

  async function loadNWCData() {
    if (!$nwcConnected || loadingNWCData || nwcDataLoaded) return

    try {
      loadingNWCData = true
      nwcError = null

      const [balance, info] = await Promise.all([
        getNWCBalance().catch(() => null),
        getNWCInfo().catch(() => null),
      ])

      nwcBalance = balance
      nwcInfo = info
      nwcDataLoaded = true
    } catch (err) {
      logger.error('Failed to load NWC data:', err)
    } finally {
      loadingNWCData = false
    }
  }

  async function handleUnlockNWC() {
    if (nwcUnlocking) return
    nwcUnlocking = true
    nwcUnlockError = null
    try {
      const unlocked = await ensureNwcUnlocked({ silent: false })
      if (!unlocked) {
        nwcUnlockError = 'Unlock cancelled'
      } else {
        nwcSuccess = 'Lightning wallet unlocked'
        setTimeout(() => (nwcSuccess = null), 2500)
        if (activeTab === 'lightning') {
          void loadNWCData()
        }
      }
    } catch (err) {
      nwcUnlockError = err instanceof Error ? err.message : 'Failed to unlock wallet'
    } finally {
      nwcUnlocking = false
    }
  }

  function handleDisconnectNWC() {
    disconnectNWC()
    nwcBalance = null
    nwcInfo = null
    nwcDataLoaded = false
    nwcSuccess = 'Wallet disconnected'
    nwcUnlockError = null
    setTimeout(() => (nwcSuccess = null), 3000)
  }

  $: if (activeTab === 'lightning' && $nwcConnected && !nwcDataLoaded && !loadingNWCData) {
    void loadNWCData()
  }

  const settingsTabs: { id: SettingsTab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'relays', label: 'Relays', icon: ServerIcon },
    { id: 'wallet', label: 'Embers', icon: EmberIcon },
    { id: 'lightning', label: 'Lightning', icon: ZapIcon },
    { id: 'mute', label: 'Muted', icon: VolumeXIcon },
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
      {@const profileName = metadata?.display_name || metadata?.name || $currentUser.name || 'Anonymous'}
      {@const handleLabel = nip05 || (metadata?.name ? `@${metadata.name}` : `${$currentUser.pubkey.slice(0, 12)}...`)}

      <div class="max-w-3xl mx-auto space-y-6">
        <section class="surface-card flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div class="flex items-center gap-4">
            <div class="h-16 w-16 overflow-hidden rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
              {#if avatarUrl}
                <img src={avatarUrl} alt={profileName} class="h-full w-full object-cover" />
              {:else}
                <div class="flex h-full w-full items-center justify-center">
                  {$currentUser.pubkey.slice(0, 2).toUpperCase()}
                </div>
              {/if}
            </div>
            <div>
              <h3 class="text-lg font-semibold text-text-soft">{profileName}</h3>
              <p class="text-sm text-text-muted">{handleLabel}</p>
            </div>
          </div>

          <button
            type="button"
            class={`rounded-full border px-5 py-2 text-sm font-medium transition-colors ${
              isEditingProfile
                ? 'border-primary/70 text-primary hover:bg-primary/10'
                : 'border-dark-border/70 text-text-soft hover:border-primary/60 hover:text-white'
            }`}
            on:click={isEditingProfile ? cancelProfileEdit : startProfileEdit}
            aria-pressed={isEditingProfile}
            disabled={profileSaving}
          >
            {isEditingProfile ? 'Close Editor' : 'Edit Profile'}
          </button>
        </section>

        <section class="surface-card p-6 space-y-6">
          <div class="space-y-1">
            <h4 class="text-sm font-semibold uppercase tracking-[0.3em] text-text-muted">Nostr Identity</h4>
            <p class="text-sm text-text-muted/80">Manage your NIP-01 metadata so every Nostr client shows the same profile.</p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <!-- svelte-ignore a11y-label-has-associated-control -->
              <label class="text-xs uppercase tracking-[0.25em] text-text-muted">Public Key</label>
              <p class="mt-2 break-all text-sm text-text-soft/80 font-mono bg-dark/50 rounded-lg border border-dark-border/60 p-3">
                {$currentUser.pubkey}
              </p>
            </div>
            <div>
              <!-- svelte-ignore a11y-label-has-associated-control -->
              <label class="text-xs uppercase tracking-[0.25em] text-text-muted">NIP-05 Verification</label>
              <p class="mt-2 text-sm text-text-soft/80 bg-dark/50 rounded-lg border border-dark-border/60 p-3">
                {nip05 || 'Not set'}
              </p>
            </div>
          </div>

          <div class="border-t border-dark-border/60 pt-6 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-base font-semibold text-text-soft">Profile Metadata</p>
                <p class="text-xs uppercase tracking-[0.25em] text-text-muted">Writes kind 0 events to your relays</p>
              </div>
              {#if isEditingProfile}
                <span class="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary">
                  Editing
                </span>
              {/if}
            </div>

            {#if profileError}
              <div class="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200" role="alert">
                {profileError}
              </div>
            {/if}

            {#if profileSuccess}
              <div class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200" role="status">
                {profileSuccess}
              </div>
            {/if}

            {#if isEditingProfile}
              <form class="space-y-5" on:submit|preventDefault={handleProfileSubmit}>
                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label for="profile-display-name" class="mb-1 block text-sm font-medium text-text-soft">Display Name</label>
                    <input
                      id="profile-display-name"
                      type="text"
                      maxlength="80"
                      autocomplete="name"
                      bind:value={profileDisplayNameInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="Jane Doe"
                      disabled={profileSaving}
                    />
                    <p class="mt-1 text-xs text-text-muted">Shown prominently across feeds.</p>
                  </div>
                  <div>
                    <label for="profile-username" class="mb-1 block text-sm font-medium text-text-soft">Username (NIP-01 name)</label>
                    <input
                      id="profile-username"
                      type="text"
                      maxlength="64"
                      autocomplete="username"
                      bind:value={profileUsernameInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="janedoe"
                      disabled={profileSaving}
                    />
                    <p class="mt-1 text-xs text-text-muted">Lowercase handle stored in metadata.</p>
                  </div>
                </div>

                <div>
                  <label for="profile-bio" class="mb-1 block text-sm font-medium text-text-soft">Bio</label>
                  <textarea
                    id="profile-bio"
                    rows="4"
                    maxlength="1024"
                    bind:value={profileAboutInput}
                    class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                    placeholder="Share what you do, what you care about, or how to reach you."
                    disabled={profileSaving}
                  />
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label for="profile-website" class="mb-1 block text-sm font-medium text-text-soft">Website</label>
                    <input
                      id="profile-website"
                      type="url"
                      autocomplete="url"
                      bind:value={profileWebsiteInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="https://example.com"
                      disabled={profileSaving}
                    />
                  </div>
                  <div>
                    <label for="profile-nip05" class="mb-1 block text-sm font-medium text-text-soft">NIP-05 Identifier</label>
                    <input
                      id="profile-nip05"
                      type="text"
                      bind:value={profileNip05Input}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="you@example.com"
                      disabled={profileSaving}
                    />
                    <p class="mt-1 text-xs text-text-muted">Requires DNS TXT record on your domain.</p>
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label for="profile-avatar" class="mb-1 block text-sm font-medium text-text-soft">Avatar URL</label>
                    <input
                      id="profile-avatar"
                      type="url"
                      bind:value={profileAvatarInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="https://cdn.example.com/avatar.png"
                      disabled={profileSaving}
                    />
                  </div>
                  <div>
                    <label for="profile-banner" class="mb-1 block text-sm font-medium text-text-soft">Banner URL</label>
                    <input
                      id="profile-banner"
                      type="url"
                      bind:value={profileBannerInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="https://cdn.example.com/banner.jpg"
                      disabled={profileSaving}
                    />
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div>
                    <label for="profile-lud16" class="mb-1 block text-sm font-medium text-text-soft">Lightning Address (LUD-16)</label>
                    <input
                      id="profile-lud16"
                      type="text"
                      bind:value={profileLud16Input}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="name@wallet.com"
                      disabled={profileSaving}
                    />
                  </div>
                  <div>
                    <label for="profile-lud06" class="mb-1 block text-sm font-medium text-text-soft">LNURL (LUD-06)</label>
                    <input
                      id="profile-lud06"
                      type="text"
                      bind:value={profileLud06Input}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70"
                      placeholder="lnurl1..."
                      disabled={profileSaving}
                    />
                  </div>
                  <div class="md:col-span-2">
                    <label for="profile-monero" class="mb-1 block text-sm font-medium text-text-soft">Ember Monero Address</label>
                    <input
                      id="profile-monero"
                      type="text"
                      inputmode="text"
                      spellcheck="false"
                      bind:value={profileMoneroAddressInput}
                      class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft outline-none focus:border-primary/70 font-mono"
                      placeholder="8B... full integrated or subaddress"
                      disabled={profileSaving}
                    />
                    <p class="mt-1 text-xs text-text-muted">Published at metadata key <code>monero_address</code> for Embers.</p>
                  </div>
                </div>

                <div class="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    class="rounded-full border border-dark-border/70 px-5 py-2 text-sm font-medium text-text-soft transition-colors hover:border-primary/60 hover:text-white disabled:opacity-50"
                    on:click={cancelProfileEdit}
                    disabled={profileSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    class="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-dark transition-colors hover:bg-primary/90 disabled:opacity-60"
                    disabled={profileSaving}
                  >
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            {:else}
              <dl class="grid gap-4 md:grid-cols-2">
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Display Name</dt>
                  <dd class="mt-2 text-sm text-text-soft">{metadata?.display_name || metadata?.name || 'Not set'}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Username (name)</dt>
                  <dd class="mt-2 text-sm text-text-soft">{metadata?.name || 'Not set'}</dd>
                </div>
                <div class="md:col-span-2">
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Bio</dt>
                  <dd class="mt-2 whitespace-pre-line rounded-lg border border-dark-border/60 bg-dark/40 p-3 text-sm text-text-soft/90">
                    {metadata?.about || 'Not set'}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Website</dt>
                  <dd class="mt-2 text-sm">
                    {#if metadata?.website}
                      <a
                        href={metadata.website}
                        target="_blank"
                        rel="noreferrer"
                        class="text-primary hover:underline break-all"
                      >
                        {metadata.website}
                      </a>
                    {:else}
                      <span class="text-text-muted">Not set</span>
                    {/if}
                  </dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Avatar URL</dt>
                  <dd class="mt-2 break-all text-sm text-text-soft/90">{metadata?.picture || 'Not set'}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Banner URL</dt>
                  <dd class="mt-2 break-all text-sm text-text-soft/90">{metadata?.banner || 'Not set'}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">LUD-16</dt>
                  <dd class="mt-2 text-sm text-text-soft/90">{metadata?.lud16 || 'Not set'}</dd>
                </div>
                <div>
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">LUD-06</dt>
                  <dd class="mt-2 break-all text-sm text-text-soft/90">{metadata?.lud06 || 'Not set'}</dd>
                </div>
                <div class="md:col-span-2">
                  <dt class="text-xs uppercase tracking-[0.25em] text-text-muted">Monero Address</dt>
                  <dd class="mt-2 break-all text-sm font-mono text-text-soft/90">{metadata?.monero_address || 'Not set'}</dd>
                </div>
              </dl>
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
        {#if walletMode === 'setup'}
          <!-- Wallet Setup -->
          <div class="space-y-5">
            <div>
              <h4 class="text-lg font-semibold text-text-soft">Ember Wallet</h4>
              <p class="text-sm text-text-muted mt-1">
                Create or import a Monero wallet to send and receive tips.
              </p>
            </div>

            <div class="flex gap-2 rounded-2xl border border-dark-border/60 bg-dark/60 p-1 text-sm font-semibold text-text-muted">
              <button
                class={`flex-1 rounded-xl px-4 py-2 transition ${activeWalletTab === 'create' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
                type="button"
                on:click={() => (activeWalletTab = 'create')}
              >
                Create Wallet
              </button>
              <button
                class={`flex-1 rounded-xl px-4 py-2 transition ${activeWalletTab === 'import' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
                type="button"
                on:click={() => (activeWalletTab = 'import')}
              >
                Import Seed
              </button>
            </div>

            {#if activeWalletTab === 'import'}
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

            <button class="btn-primary w-full justify-center" on:click={handleCreateOrImport} disabled={walletLoading}>
              {walletLoading ? 'Preparing wallet…' : activeWalletTab === 'create' ? 'Create wallet' : 'Import wallet'}
            </button>

            <p class="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
              There is no remote backup. Write down your 25-word seed (or download it once created) or this wallet
              cannot be recovered if the device is lost.
            </p>

            {#if walletError}
              <p class="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{walletError}</p>
            {/if}
          </div>

        {:else if walletMode === 'pending'}
          <!-- Wallet Locked -->
          <div class="space-y-5">
            <div>
              <h4 class="text-lg font-semibold text-text-soft">Ember Wallet</h4>
              <p class="text-sm text-text-muted mt-1">
                Your wallet is locked. Enter your PIN to unlock. There is no remote backup.
              </p>
            </div>

            {#if $walletState.locked}
              <div class="rounded-2xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-100 space-y-2">
                <p>We found your encrypted Ember wallet on this device, but it's locked behind your PIN.</p>
                <p class="text-xs text-amber-200">
                  Reminder: this is a hot wallet. Only keep small balances on this browser and never share your PIN.
                </p>
              </div>
              <div class="flex flex-col gap-3 md:flex-row">
                <button
                  class="btn-primary flex-1 justify-center"
                  type="button"
                  on:click={handleUnlockWallet}
                  disabled={unlockBusy}
                >
                  {unlockBusy ? 'Unlocking…' : 'Unlock with PIN'}
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
              <p class="text-xs text-text-muted/80">
                Lost your PIN? Remove the wallet and re-import using the seed phrase you wrote down—there is no remote backup.
              </p>
            {:else}
              <div class="rounded-2xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-100 space-y-2">
                <p>Your wallet setup is incomplete. Remove the local data and re-import using your seed phrase.</p>
              </div>
              <div class="flex flex-col gap-3 md:flex-row">
                <button
                  class="flex-1 rounded-2xl border border-dark-border/60 px-4 py-2 text-sm font-semibold text-text-soft transition hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-50"
                  type="button"
                  on:click={handleDeleteWallet}
                  disabled={deleteBusy}
                >
                  {deleteBusy ? 'Removing…' : 'Remove local wallet'}
                </button>
              </div>
              <p class="text-xs text-text-muted/80">
                Recreate or import the wallet using your 25-word seed to continue.
              </p>
            {/if}

            {#if walletError}
              <p class="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{walletError}</p>
            {/if}
          </div>

        {:else}
          <!-- Wallet Ready -->
          <div class="space-y-5">
            <div>
              <h4 class="text-lg font-semibold text-text-soft">Ember Wallet</h4>
              <p class="text-sm text-text-muted mt-1">
                Wallet ready. Select a node, copy your address, or lock when done.
              </p>
            </div>

            <div class="flex gap-2 rounded-2xl border border-dark-border/60 bg-dark/60 p-1 text-sm font-semibold text-text-muted">
              <button
                type="button"
                class={`flex-1 rounded-xl px-3 py-2 transition flex items-center justify-center gap-2 ${activeWalletPanel === 'overview' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
                on:click={() => (activeWalletPanel = 'overview')}
              >
                <LayoutGridIcon size={16} />
                <span class="hidden sm:inline">Overview</span>
              </button>
              <button
                type="button"
                class={`flex-1 rounded-xl px-3 py-2 transition flex items-center justify-center gap-2 ${activeWalletPanel === 'history' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
                on:click={handleHistoryClick}
              >
                <ClockIcon size={16} />
                <span class="hidden sm:inline">History</span>
              </button>
              <button
                type="button"
                class={`flex-1 rounded-xl px-3 py-2 transition flex items-center justify-center gap-2 ${activeWalletPanel === 'deposit' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
                on:click={() => (activeWalletPanel = 'deposit')}
              >
                <ArrowDownIcon size={16} />
                <span class="hidden sm:inline">Deposit</span>
              </button>
              <button
                type="button"
                class={`flex-1 rounded-xl px-3 py-2 transition flex items-center justify-center gap-2 ${activeWalletPanel === 'withdraw' ? 'bg-primary text-dark shadow-sm shadow-primary/30' : 'hover:text-text-soft'}`}
                on:click={() => (activeWalletPanel = 'withdraw')}
              >
                <ArrowUpIcon size={16} />
                <span class="hidden sm:inline">Withdraw</span>
              </button>
            </div>

            <p class="text-xs text-text-muted/80">
              This on-device wallet is non-custodial and meant for quick Embers. For larger savings, withdraw to your long-term wallet.
            </p>

{#if activeWalletPanel === 'overview'}
              <div class="space-y-4">
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

                <div class="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
                  No remote backups exist for this wallet. Write down your 25-word seed or download it below - losing it
                  means losing your Embers.
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
                    <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        class="rounded-full border border-dark-border/60 px-4 py-2 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-white"
                        on:click={() => copyToClipboard(displayMnemonic, 'seed phrase')}
                      >
                        Copy seed
                      </button>
                      <button
                        type="button"
                        class="rounded-full border border-dark-border/60 px-4 py-2 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-white"
                        on:click={() => downloadSeed(displayMnemonic)}
                      >
                        Download seed (.txt)
                      </button>
                    </div>
                    <p class="mt-2 text-xs text-amber-200">
                      Store this seed offline. Without it, this wallet cannot be recovered.
                    </p>
                  {:else}
                    <p class="mt-3 text-sm text-text-muted">
                      Keep this phrase private. You'll need it if you ever reinstall the app or move wallets.
                    </p>
                    <p class="mt-2 text-xs text-amber-200">
                      There is no remote backup. Reveal and record your seed before clearing this wallet.
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
              </div>
            {:else if activeWalletPanel === 'deposit'}
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
            {:else if activeWalletPanel === 'withdraw'}
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
            {:else if activeWalletPanel === 'history'}
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
          </div>
        {/if}
      </div>

    {:else if activeTab === 'lightning'}
      <div class="max-w-3xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-lg font-semibold text-text-soft">Lightning Network</h4>
            <p class="text-sm text-text-muted mt-1">
              {$nwcConnected ? 'Wallet connected' : 'Connect a Lightning wallet to send zaps'}
            </p>
          </div>
        </div>

        {#if !$nwcConnected}
          {#if hasLockedLightning}
            <div class="surface-card space-y-4 p-6">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <h5 class="text-base font-semibold text-text-soft">Wallet Locked</h5>
                  <p class="text-sm text-text-muted mt-1 break-all font-mono text-xs">
                    {$nwcSnapshot?.walletPubkey.slice(0, 16)}...
                  </p>
                </div>
                <button
                  type="button"
                  on:click={handleDisconnectNWC}
                  class="shrink-0 rounded-full border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10"
                >
                  Disconnect
                </button>
              </div>

              <p class="text-sm text-text-muted">
                Enter your wallet PIN when prompted to unlock Lightning zaps. Your wallet stays locked until you choose to unlock it.
              </p>

              {#if nwcUnlockError}
                <div class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                  {nwcUnlockError}
                </div>
              {/if}

              <button
                type="button"
                on:click={handleUnlockNWC}
                disabled={nwcUnlocking}
                class="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-dark shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
              >
                {nwcUnlocking ? 'Unlocking...' : 'Unlock Wallet'}
              </button>
            </div>
          {:else}
          <div class="surface-card space-y-4 p-6">
            <div>
              <h5 class="text-base font-semibold text-text-soft mb-2">Connect Wallet</h5>
              <p class="text-sm text-text-muted mb-4">
                Use Nostr Wallet Connect (NWC) to connect your Lightning wallet. Get a connection string from wallets like Alby, Mutiny, or Cashu.
              </p>
            </div>

            <div class="space-y-3">
              <div>
                <label for="nwc-uri" class="block text-sm font-medium text-text-soft mb-2">
                  NWC Connection String
                </label>
                <input
                  id="nwc-uri"
                  type="password"
                  placeholder="nostr+walletconnect://..."
                  bind:value={nwcUri}
                  class="w-full rounded-lg border border-dark-border bg-dark/50 px-4 py-2.5 text-sm text-text-soft placeholder-text-muted/50 outline-none focus:border-primary/60"
                  disabled={nwcConnecting}
                />
                <p class="mt-2 text-xs text-text-muted">
                  Paste your nostr+walletconnect:// connection string here
                </p>
              </div>

              <button
                type="button"
                on:click={handleConnectNWC}
                disabled={nwcConnecting || !nwcUri.trim()}
                class="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-dark shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
              >
                {nwcConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>

            {#if nwcError}
              <div class="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                {nwcError}
              </div>
            {/if}

            {#if nwcSuccess}
              <div class="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">
                {nwcSuccess}
              </div>
            {/if}
          </div>

          <div class="surface-card p-6">
            <h5 class="text-base font-semibold text-text-soft mb-3">How to get NWC</h5>
            <ul class="space-y-2 text-sm text-text-muted">
              <li class="flex gap-2">
                <span class="text-primary">•</span>
                <span><strong class="text-text-soft">Alby:</strong> Go to alby.com, create wallet, find NWC in settings</span>
              </li>
              <li class="flex gap-2">
                <span class="text-primary">•</span>
                <span><strong class="text-text-soft">Mutiny:</strong> Open mutiny.plus, go to Settings → Nostr Wallet Connect</span>
              </li>
              <li class="flex gap-2">
                <span class="text-primary">•</span>
                <span><strong class="text-text-soft">Cashu:</strong> Use a Cashu wallet that supports NWC</span>
              </li>
            </ul>
          </div>
          {/if}

        {:else}
          <div class="surface-card space-y-6 p-6">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <h5 class="text-base font-semibold text-text-soft">Wallet Connected</h5>
                <p class="text-sm text-text-muted mt-1 break-all font-mono text-xs">
                  {$nwcConnection?.walletPubkey.slice(0, 16)}...
                </p>
              </div>
              <button
                type="button"
                on:click={handleDisconnectNWC}
                class="shrink-0 rounded-full border border-rose-500/40 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:border-rose-500/60 hover:bg-rose-500/10"
              >
                Disconnect
              </button>
            </div>

            {#if loadingNWCData}
              <div class="flex items-center justify-center py-4">
                <p class="text-sm text-text-muted">Loading wallet info...</p>
              </div>
            {:else}
              {#if nwcBalance !== null}
                <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
                  <p class="text-xs uppercase tracking-[0.3em] text-text-muted">Balance</p>
                  <p class="mt-2 text-3xl font-bold text-primary">
                    {nwcBalance.toLocaleString()} sats
                  </p>
                </div>
              {/if}

              {#if nwcInfo}
                <div class="rounded-xl border border-dark-border/60 bg-dark/50 p-4">
                  <p class="text-xs uppercase tracking-[0.3em] text-text-muted mb-3">Wallet Info</p>
                  <div class="space-y-2 text-sm">
                    {#each Object.entries(nwcInfo) as [key, value]}
                      <div class="flex flex-col gap-1">
                        <span class="text-text-muted">{key}:</span>
                        <span class="text-text-soft font-mono text-xs break-all">{String(value)}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}

            <div class="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p class="text-sm text-text-soft">
                ⚡ You can now send zaps by clicking the zap button on any post!
              </p>
            </div>

            {#if nwcSuccess}
              <div class="rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-200">
                {nwcSuccess}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {:else if activeTab === 'mute'}
      <div class="mx-auto max-w-2xl space-y-6">
        <div class="space-y-2">
          <h2 class="text-2xl font-bold text-text-soft">Muted Content</h2>
          <p class="text-sm text-text-muted">
            Manage users, words, hashtags, and threads you've muted. Muted content won't appear in your feed.
          </p>
        </div>

        <div class="space-y-4">
          <!-- Muted Users Section -->
          <div class="rounded-xl border border-dark-border/60 bg-dark-light/40 p-6">
            <h3 class="text-lg font-semibold text-text-soft mb-4">Muted Users ({$mutedPubkeys.size})</h3>
            {#if $mutedPubkeys.size === 0}
              <p class="text-sm text-text-muted">No muted users</p>
            {:else}
              <div class="space-y-2">
                {#each Array.from($mutedPubkeys) as pubkey (pubkey)}
                  {@const metadata = $metadataCache.get(pubkey)}
                  {@const displayName = getDisplayName(pubkey, metadata)}
                  {@const avatarUrl = getAvatarUrl(metadata)}
                  {@const displayLabel = displayName || pubkey.slice(0, 8)}
                  <div class="flex items-center gap-3 rounded-lg bg-dark/40 p-3">
                    <!-- Avatar -->
                    <div class="flex-shrink-0">
                      {#if avatarUrl}
                        <img src={avatarUrl} alt={displayLabel} class="h-10 w-10 rounded-full object-cover" />
                      {:else}
                        <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                          {displayLabel.slice(0, 2).toUpperCase()}
                        </div>
                      {/if}
                    </div>
                    <!-- Name -->
                    <div class="flex-1 min-w-0">
                      <p class="font-semibold text-text-soft truncate">{displayLabel}</p>
                      <p class="text-xs text-text-muted font-mono truncate">{pubkey.slice(0, 16)}...{pubkey.slice(-8)}</p>
                    </div>
                    <!-- Unmute button -->
                    <button
                      type="button"
                      class="flex-shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-dark hover:bg-primary/90 transition-colors"
                      on:click={() => unmuteUser(pubkey)}
                    >
                      Unmute
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Muted Words Section -->
          <div class="rounded-xl border border-dark-border/60 bg-dark-light/40 p-6">
            <h3 class="text-lg font-semibold text-text-soft mb-4">Muted Words & Phrases ({$mutedWords.size})</h3>
            {#if $mutedWords.size === 0}
              <p class="text-sm text-text-muted">No muted words</p>
            {:else}
              <div class="space-y-2">
                {#each Array.from($mutedWords) as word (word)}
                  <div class="flex items-center justify-between rounded-lg bg-dark/40 p-3">
                    <span class="text-sm text-text-soft">"{word}"</span>
                    <button
                      type="button"
                      class="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-dark hover:bg-primary/90 transition-colors"
                      on:click={() => unmuteWord(word)}
                    >
                      Unmute
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Muted Hashtags Section -->
          <div class="rounded-xl border border-dark-border/60 bg-dark-light/40 p-6">
            <h3 class="text-lg font-semibold text-text-soft mb-4">Muted Hashtags ({$mutedHashtags.size})</h3>
            {#if $mutedHashtags.size === 0}
              <p class="text-sm text-text-muted">No muted hashtags</p>
            {:else}
              <div class="space-y-2">
                {#each Array.from($mutedHashtags) as hashtag (hashtag)}
                  <div class="flex items-center justify-between rounded-lg bg-dark/40 p-3">
                    <span class="text-sm text-text-soft">#{hashtag}</span>
                    <button
                      type="button"
                      class="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-dark hover:bg-primary/90 transition-colors"
                      on:click={async () => {
                        try {
                          const { unmuteWord } = await import('$lib/mute')
                          await unmuteWord(hashtag)
                        } catch (err) {
                          console.error('Failed to unmute hashtag:', err)
                        }
                      }}
                    >
                      Unmute
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Muted Threads Section -->
          <div class="rounded-xl border border-dark-border/60 bg-dark-light/40 p-6">
            <h3 class="text-lg font-semibold text-text-soft mb-4">Muted Threads ({$mutedEvents.size})</h3>
            {#if $mutedEvents.size === 0}
              <p class="text-sm text-text-muted">No muted threads</p>
            {:else}
              <div class="space-y-2">
                {#each Array.from($mutedEvents) as eventId (eventId)}
                  <div class="flex items-center justify-between rounded-lg bg-dark/40 p-3">
                    <span class="font-mono text-sm text-text-soft">{eventId.slice(0, 16)}...{eventId.slice(-8)}</span>
                    <button
                      type="button"
                      class="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-dark hover:bg-primary/90 transition-colors"
                      on:click={async () => {
                        try {
                          const { mutedEvents } = await import('$lib/mute')
                          const current = new Set(Array.from(mutedEvents.subscribe(s => s)()))
                          current.delete(eventId)
                          mutedEvents.set(current)
                        } catch (err) {
                          console.error('Failed to unmute thread:', err)
                        }
                      }}
                    >
                      Unmute
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
