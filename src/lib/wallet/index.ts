/**
 * Monero wallet integration powered by monero-ts.
 * Keys are generated client-side and encrypted with a user-provided PIN.
 * Adds remote backups via Nostr (NIP-04) and Ember tipping helpers.
 */

import { get } from 'svelte/store'
import { walletState, resetWalletStore, setSharePreferenceInStore } from '$stores/wallet'
import { encryptWalletData, decryptWalletData } from '$lib/crypto'
import { getSetting, saveSetting } from '$lib/db'
import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import type moneroTs from 'monero-ts'
import { NDKEvent, type NDKFilter, type NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'
import type { MoneroNode } from './nodes'
import { DEFAULT_NODES, getNodeById } from './nodes'
import { getBrowserFs, resetBrowserFs } from './browser-fs'
import type { WalletBackupPayload, SendMoneroOptions, SendMoneroResult } from '$types/wallet'
import { EMBER_EVENT_KIND, EMBER_TAG, encodeEmberPayload } from '$lib/ember'
import { setEmberAddressMetadata } from '$lib/profile'

export interface WalletInfo {
  seed: string
  mnemonic: string
  address: string
  balance: number
  unlockedBalance: number
}

type StoredWalletSecrets = {
  seed: string
  mnemonic: string
}

type WalletMetaInfo = {
  address: string
  network: 'mainnet' | 'testnet' | 'stagenet'
  createdAt: number
  restoreHeight: number
  nodeId: string
}

type MoneroLib = typeof moneroTs
type MoneroWalletFullInstance = Awaited<ReturnType<MoneroLib['createWalletFull']>>

const WALLET_SECRETS_KEY = 'walletEncrypted'
const WALLET_META_KEY = 'walletMetaInfo'
const WALLET_NODE_KEY = 'walletActiveNode'
const WALLET_SHARE_KEY = 'walletShareAddress'
const SESSION_PIN_KEY = 'walletSessionPin'
const WALLET_BACKUP_KIND = 30078
const WALLET_BACKUP_D_TAG = 'monstr-wallet'
const BLOCK_TIME_SECONDS = 120
const REFERENCE_HEIGHT = 3100000
const REFERENCE_TIMESTAMP = Date.UTC(2023, 0, 1)
const RESTORE_LOOKBACK_SECONDS = 7 * 24 * 60 * 60 // rewind a week to capture early deposits

let monero: MoneroLib | null = null
let walletInstance: MoneroWalletFullInstance | null = null
let walletSyncPromise: Promise<void> | null = null
let currentPin: string | null = null
let cachedSecrets: StoredWalletSecrets | null = null
let cachedMeta: WalletMetaInfo | null = null
let activeNode: MoneroNode = DEFAULT_NODES[0]
let shareAddressPreference = true
let sessionPinCache: string | null = null

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function rememberSessionPin(pin: string): void {
  sessionPinCache = pin
  if (!isBrowser()) {
    return
  }
  try {
    window.sessionStorage.setItem(SESSION_PIN_KEY, window.btoa(pin))
  } catch (err) {
    console.warn('Failed to cache wallet PIN for this session', err)
  }
}

function readSessionPin(): string | null {
  if (sessionPinCache) {
    return sessionPinCache
  }
  if (!isBrowser()) {
    return null
  }
  const encoded = window.sessionStorage.getItem(SESSION_PIN_KEY)
  if (!encoded) {
    return null
  }
  try {
    const decoded = window.atob(encoded)
    sessionPinCache = decoded
    return decoded
  } catch (err) {
    console.warn('Failed to decode cached wallet PIN', err)
    window.sessionStorage.removeItem(SESSION_PIN_KEY)
    return null
  }
}

function clearSessionPinCache(): void {
  sessionPinCache = null
  if (!isBrowser()) {
    return
  }
  try {
    window.sessionStorage.removeItem(SESSION_PIN_KEY)
  } catch (err) {
    console.warn('Failed to clear cached wallet PIN', err)
  }
}

async function loadMonero(): Promise<MoneroLib> {
  if (!isBrowser()) {
    throw new Error('Monero wallet functionality is only available in the browser.')
  }

  if (monero) return monero

  const module = (await import('monero-ts')).default
  const workerUrl = new URL('monero-ts/dist/monero.worker.js', import.meta.url)
  module.LibraryUtils.setWorkerLoader(() => new Worker(workerUrl, { name: 'monero-ts-worker' }))
  await module.LibraryUtils.loadWasmModule()
  monero = module
  return module
}

async function persistSecrets(pin: string, secrets: StoredWalletSecrets): Promise<void> {
  const encrypted = await encryptWalletData(JSON.stringify(secrets), pin)
  await saveSetting(WALLET_SECRETS_KEY, encrypted)
}

async function loadEncryptedSecrets(): Promise<any> {
  return await getSetting(WALLET_SECRETS_KEY)
}

async function persistMeta(meta: WalletMetaInfo): Promise<void> {
  cachedMeta = meta
  await saveSetting(WALLET_META_KEY, meta)
}

async function loadMeta(): Promise<WalletMetaInfo | null> {
  const raw = await getSetting(WALLET_META_KEY)
  if (!raw) {
    cachedMeta = null
    return null
  }
  const normalized = normalizeMeta(raw)
  cachedMeta = normalized
  if (normalized && (raw.restoreHeight !== normalized.restoreHeight || raw.nodeId !== normalized.nodeId)) {
    await saveSetting(WALLET_META_KEY, normalized)
  }
  return normalized
}

function normalizeMeta(meta: any): WalletMetaInfo | null {
  if (!meta?.address) {
    return null
  }
  const createdAt = typeof meta.createdAt === 'number' ? meta.createdAt : Date.now()
  const restoreHeight = typeof meta.restoreHeight === 'number' ? meta.restoreHeight : estimateRestoreHeight(createdAt)
  const nodeId = typeof meta.nodeId === 'string' ? meta.nodeId : activeNode.id
  const normalizedNode = getNodeById(nodeId) ?? activeNode
  return {
    address: meta.address,
    network: meta.network ?? 'mainnet',
    createdAt,
    restoreHeight,
    nodeId: normalizedNode.id,
  }
}

function setWalletState(partial: Partial<Parameters<typeof walletState.set>[0]>): void {
  walletState.update(state => ({
    ...state,
    ...partial,
  }))
}

function estimateRestoreHeight(createdAt: number): number {
  const lookbackMillis = RESTORE_LOOKBACK_SECONDS * 1000
  const adjustedTimestamp = Math.max(REFERENCE_TIMESTAMP, createdAt - lookbackMillis)
  const deltaSeconds = Math.max(0, Math.floor((adjustedTimestamp - REFERENCE_TIMESTAMP) / 1000))
  const deltaBlocks = Math.floor(deltaSeconds / BLOCK_TIME_SECONDS)
  return Math.max(0, REFERENCE_HEIGHT + deltaBlocks)
}

function resolveNetworkType(lib: MoneroLib, network: WalletMetaInfo['network']) {
  switch (network) {
    case 'testnet':
      return lib.MoneroNetworkType.TESTNET
    case 'stagenet':
      return lib.MoneroNetworkType.STAGENET
    default:
      return lib.MoneroNetworkType.MAINNET
  }
}

function requireUnlocked(): void {
  if (!cachedSecrets) {
    throw new Error('Wallet is locked. Unlock it with your PIN first.')
  }
}

async function ensureWalletInstance(pin?: string): Promise<MoneroWalletFullInstance> {
  if (walletInstance) {
    return walletInstance
  }

  requireUnlocked()

  if (pin) {
    currentPin = pin
  }

  if (!currentPin) {
    throw new Error('PIN is required to initialize the wallet.')
  }

  const moneroLib = await loadMonero()
  const meta = cachedMeta ?? (await loadMeta())
  if (!meta) {
    throw new Error('Wallet metadata missing.')
  }

  const walletPath = `monstr-wallet-${meta.address.slice(-8)}`

  const fs = getBrowserFs()
  const walletExists = await moneroLib.MoneroWalletFull.walletExists(walletPath, fs)

  if (walletExists) {
    walletInstance = await moneroLib.openWalletFull({
      path: walletPath,
      password: currentPin,
      networkType: resolveNetworkType(moneroLib, meta.network),
      server: {
        uri: activeNode.uri,
        username: activeNode.username,
        password: activeNode.password,
      },
      proxyToWorker: true,
      fs,
    })
  } else {
    walletInstance = await moneroLib.createWalletFull({
      path: walletPath,
      password: currentPin,
      networkType: resolveNetworkType(moneroLib, meta.network),
      seed: cachedSecrets!.mnemonic,
      restoreHeight: meta.restoreHeight,
      server: {
        uri: activeNode.uri,
        username: activeNode.username,
        password: activeNode.password,
      },
      proxyToWorker: true,
      fs,
    })
  }

  const connection = new moneroLib.MoneroRpcConnection({
    uri: activeNode.uri,
    username: activeNode.username,
    password: activeNode.password,
  })
  await walletInstance.setDaemonConnection(connection)

  return walletInstance
}

async function disposeWalletInstance(save = true): Promise<void> {
  if (!walletInstance) return
  try {
    await walletInstance.close(save)
  } catch (err) {
    console.warn('Failed to close wallet instance', err)
  } finally {
    walletInstance = null
  }
}

async function refreshWalletInternal(): Promise<void> {
  if (walletSyncPromise) {
    return walletSyncPromise
  }

  walletSyncPromise = (async () => {
    try {
      setWalletState({ isSyncing: true })
      const moneroLib = await loadMonero()
      const wallet = await ensureWalletInstance()
      await wallet.setDaemonConnection(activeNode.uri)
      await wallet.sync()
      const balanceAtomic = await wallet.getBalance()
      const unlockedAtomic = await wallet.getUnlockedBalance()
      const balance = moneroLib.MoneroUtils.atomicUnitsToXmr(balanceAtomic)
      const unlockedBalance = moneroLib.MoneroUtils.atomicUnitsToXmr(unlockedAtomic)
      setWalletState({
        balance,
        unlockedBalance,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      })
    } catch (err) {
      setWalletState({ isSyncing: false })
      throw err
    } finally {
      walletSyncPromise = null
    }
  })()

  return walletSyncPromise
}

async function publishWalletBackup(): Promise<void> {
  if (!isBrowser() || !window.nostr?.nip04 || !cachedSecrets || !cachedMeta) {
    return
  }

  let ndk
  try {
    ndk = getNDK()
  } catch (err) {
    console.warn('NDK unavailable, skipping wallet backup', err)
    return
  }

  const user = getCurrentNDKUser()
  if (!user?.pubkey || !ndk.signer) {
    console.warn('No authenticated Nostr user; cannot back up wallet remotely')
    return
  }

  try {
    setWalletState({ backupStatus: 'syncing' })
    const payload: WalletBackupPayload = {
      seed: cachedSecrets.seed,
      mnemonic: cachedSecrets.mnemonic,
      address: cachedMeta.address,
      createdAt: cachedMeta.createdAt,
      network: cachedMeta.network,
      restoreHeight: cachedMeta.restoreHeight,
      nodeId: activeNode.id,
    }

    const ciphertext = await window.nostr.nip04.encrypt(user.pubkey, JSON.stringify(payload))
    const event = new NDKEvent(ndk)
    event.kind = WALLET_BACKUP_KIND
    event.content = ciphertext
    event.tags = [
      ['d', WALLET_BACKUP_D_TAG],
      ['client', 'monstr'],
      ['node', activeNode.id],
    ]
    event.created_at = Math.floor(Date.now() / 1000)
    await event.sign()
    await event.publish()
    setWalletState({
      backupStatus: 'ok',
      remoteBackupAvailable: true,
      lastBackupAt: Date.now(),
    })
  } catch (err) {
    console.error('Failed to publish wallet backup:', err)
    setWalletState({ backupStatus: 'error' })
  }
}

async function fetchWalletBackupRecord(): Promise<{ payload: WalletBackupPayload; updatedAt: number } | null> {
  if (!isBrowser() || !window.nostr?.nip04) {
    throw new Error('Nostr extension with NIP-04 support is required to restore.')
  }

  const user = getCurrentNDKUser()
  if (!user?.pubkey) {
    throw new Error('Log in with your Nostr key to restore wallet data.')
  }

  const ndk = getNDK()
  const filter: NDKFilter = {
    authors: [user.pubkey],
    kinds: [WALLET_BACKUP_KIND],
    '#d': [WALLET_BACKUP_D_TAG],
    limit: 1,
  }

  const events = await ndk.fetchEvents(filter, { closeOnEose: true } as NDKSubscriptionOptions)
  let latest: ReturnType<NDKEvent['rawEvent']> | null = null
  for (const ev of events as Set<NDKEvent>) {
    const raw = ev.rawEvent()
    if (!latest || raw.created_at > latest.created_at) {
      latest = raw
    }
  }

  if (!latest) {
    return null
  }

  const ciphertext = latest.content
  const plaintext = await window.nostr.nip04.decrypt(user.pubkey, ciphertext)
  const payload = JSON.parse(plaintext) as WalletBackupPayload
  setWalletState({ remoteBackupAvailable: true, lastBackupAt: latest.created_at * 1000 })
  return {
    payload,
    updatedAt: latest.created_at * 1000,
  }
}

async function publishEmberReceipt(
  amountXmr: number,
  txHash: string,
  options: Pick<SendMoneroOptions, 'recipientPubkey' | 'noteId' | 'note'>
): Promise<void> {
  if (!options.recipientPubkey) return

  try {
    const ndk = getNDK()
    const user = getCurrentNDKUser()
    if (!user?.pubkey || !ndk.signer) return
    const moneroLib = await loadMonero()
    const ndkEvent = new NDKEvent(ndk)
    ndkEvent.kind = EMBER_EVENT_KIND
    ndkEvent.content = options.note ?? ''
    const atomic = moneroLib.MoneroUtils.xmrToAtomicUnits(amountXmr)
    ndkEvent.tags = [
      [EMBER_TAG, atomic.toString(), 'XMR'],
      ['p', options.recipientPubkey],
    ]
    if (options.noteId) ndkEvent.tags.push(['e', options.noteId])
    if (txHash) ndkEvent.tags.push(['tx', txHash])
    if (cachedMeta?.address) ndkEvent.tags.push(['addr', cachedMeta.address])
    const payload = encodeEmberPayload({
      senderPubkey: user.pubkey,
      senderAddress: cachedMeta?.address,
      recipientPubkey: options.recipientPubkey,
      noteId: options.noteId,
      txHash: txHash || undefined,
      amountAtomic: atomic.toString(),
      createdAt: Math.floor(Date.now() / 1000),
    })
    if (payload) {
      ndkEvent.tags.push(['payload', payload])
    }
    ndkEvent.created_at = Math.floor(Date.now() / 1000)
    await ndkEvent.sign()
    await ndkEvent.publish()
  } catch (err) {
    console.warn('Failed to publish Ember receipt:', err)
  }
}

async function syncProfileAddress(address: string | null): Promise<void> {
  try {
    await setEmberAddressMetadata(address)
  } catch (err) {
    console.warn('Failed to sync Ember address:', err)
  }
}

function priorityFromInput(priority: SendMoneroOptions['priority'], moneroLib: MoneroLib): number {
  switch (priority) {
    case 'low':
      return moneroLib.MoneroTxPriority.UNIMPORTANT
    case 'high':
      return moneroLib.MoneroTxPriority.ELEVATED
    default:
      return moneroLib.MoneroTxPriority.NORMAL
  }
}

export function getAvailableNodes(): MoneroNode[] {
  return [...DEFAULT_NODES]
}

export function getActiveNode(): MoneroNode {
  return activeNode
}

export async function setActiveNode(nodeId: string): Promise<void> {
  const node = getNodeById(nodeId)
  if (!node) {
    throw new Error(`Unknown node id: ${nodeId}`)
  }
  activeNode = node
  await saveSetting(WALLET_NODE_KEY, node.id)
  if (cachedMeta) {
    await persistMeta({ ...cachedMeta, nodeId: node.id })
  }
  await disposeWalletInstance(false)
  setWalletState({ selectedNode: node.id })
  if (cachedSecrets && currentPin) {
    void refreshWalletInternal()
  }
}

export async function hydrateWalletState(): Promise<void> {
  const [encrypted, meta, savedNodeId, savedSharePref] = await Promise.all([
    loadEncryptedSecrets(),
    loadMeta(),
    getSetting(WALLET_NODE_KEY),
    getSetting(WALLET_SHARE_KEY),
  ])

  shareAddressPreference =
    savedSharePref === undefined || savedSharePref === null ? true : Boolean(savedSharePref)
  setSharePreferenceInStore(shareAddressPreference)

  if (savedNodeId) {
    const node = getNodeById(savedNodeId)
    if (node) {
      activeNode = node
    }
  } else if (meta?.nodeId) {
    const node = getNodeById(meta.nodeId)
    if (node) {
      activeNode = node
    }
  }

  setWalletState({
    hasWallet: Boolean(encrypted),
    isLocked: Boolean(encrypted),
    address: meta?.address ?? null,
    selectedNode: activeNode.id,
    balance: 0,
    unlockedBalance: 0,
    lastSyncedAt: null,
    restoreHeight: meta?.restoreHeight ?? null,
    shareAddress: shareAddressPreference,
  })
}

export async function initWallet(
  pin: string,
  mnemonic?: string,
  options?: { createdAt?: number; restoreHeight?: number }
): Promise<WalletInfo> {
  if (!pin || pin.trim().length < 4) {
    throw new Error('PIN must be at least 4 characters long.')
  }

  const moneroLib = await loadMonero()

  const walletKeys = await moneroLib.createWalletKeys({
    password: pin,
    networkType: moneroLib.MoneroNetworkType.MAINNET,
    seed: mnemonic,
    proxyToWorker: true,
  })

  const walletSeed = await walletKeys.getSeed()
  const walletMnemonic = mnemonic ?? walletSeed
  const address = await walletKeys.getPrimaryAddress()
  await walletKeys.close()

  cachedSecrets = {
    seed: walletSeed,
    mnemonic: walletMnemonic,
  }
  currentPin = pin
  rememberSessionPin(pin)

  await persistSecrets(pin, cachedSecrets)
  const createdAt = options?.createdAt ?? Date.now()
  const restoreHeight = options?.restoreHeight ?? estimateRestoreHeight(createdAt)
  const meta: WalletMetaInfo = {
    address,
    network: 'mainnet',
    createdAt,
    restoreHeight,
    nodeId: activeNode.id,
  }
  await persistMeta(meta)

  setWalletState({
    hasWallet: true,
    isLocked: false,
    address,
    balance: 0,
    unlockedBalance: 0,
    selectedNode: activeNode.id,
    isLoading: false,
    restoreHeight,
    shareAddress: shareAddressPreference,
  })

  void publishWalletBackup()
  void refreshWalletInternal()
  if (shareAddressPreference) {
    void syncProfileAddress(address)
  }

  return {
    seed: walletSeed,
    mnemonic: walletMnemonic,
    address,
    balance: 0,
    unlockedBalance: 0,
  }
}

export async function unlockWallet(pin: string): Promise<WalletInfo | null> {
  const encrypted = await loadEncryptedSecrets()
  const meta = await loadMeta()
  if (!encrypted || !meta) {
    return null
  }

  try {
    const serialized = await decryptWalletData(
      encrypted.encryptedData,
      encrypted.iv,
      encrypted.salt,
      pin
    )

    const secrets = JSON.parse(serialized) as StoredWalletSecrets
    cachedSecrets = secrets
    currentPin = pin
    rememberSessionPin(pin)

    setWalletState({
      hasWallet: true,
      isLocked: false,
      address: meta.address,
      selectedNode: activeNode.id,
      restoreHeight: meta.restoreHeight,
      shareAddress: shareAddressPreference,
    })

    await refreshWalletInternal()
    if (shareAddressPreference) {
      void syncProfileAddress(meta.address)
    }

    const state = get(walletState)
    return {
      seed: secrets.seed,
      mnemonic: secrets.mnemonic,
      address: meta.address,
      balance: state.balance,
      unlockedBalance: state.unlockedBalance,
    }
  } catch (err) {
    console.error('Failed to unlock wallet:', err)
    return null
  }
}

export function lockWallet(): void {
  cachedSecrets = null
  currentPin = null
  clearSessionPinCache()
  cachedMeta = cachedMeta ? { ...cachedMeta } : null
  void disposeWalletInstance(false)
  setWalletState({
    isLocked: true,
    balance: 0,
    unlockedBalance: 0,
    isSyncing: false,
  })
}

export async function hasStoredWallet(): Promise<boolean> {
  const encrypted = await loadEncryptedSecrets()
  return Boolean(encrypted)
}

export function getCachedMnemonic(): string | null {
  return cachedSecrets?.mnemonic ?? null
}

export function getCachedSeed(): string | null {
  return cachedSecrets?.seed ?? null
}

export async function refreshWallet(): Promise<void> {
  requireUnlocked()
  await refreshWalletInternal()
}

export async function autoUnlockWithSessionPin(): Promise<boolean> {
  const pin = readSessionPin()
  if (!pin) {
    return false
  }
  const state = get(walletState)
  if (!state.hasWallet || !state.isLocked) {
    return false
  }
  const unlocked = await unlockWallet(pin)
  if (!unlocked) {
    clearSessionPinCache()
    return false
  }
  return true
}

export async function restoreWalletFromNostr(pin: string): Promise<WalletInfo> {
  if (!pin || pin.trim().length < 4) {
    throw new Error('PIN must be at least 4 characters long.')
  }
  const record = await fetchWalletBackupRecord()
  if (!record) {
    throw new Error('No wallet backup found for this Nostr login yet.')
  }
  return await initWallet(pin, record.payload.mnemonic, {
    createdAt: record.payload.createdAt,
    restoreHeight: record.payload.restoreHeight,
  })
}

export async function sendMonero(options: SendMoneroOptions): Promise<SendMoneroResult> {
  requireUnlocked()
  const moneroLib = await loadMonero()
  const wallet = await ensureWalletInstance()

  if (!options.address || !options.address.trim()) {
    throw new Error('Destination address is required.')
  }
  if (!options.amount || options.amount <= 0) {
    throw new Error('Enter a valid amount of XMR to send.')
  }

  const config = new moneroLib.MoneroTxConfig({
    address: options.address.trim(),
    amount: moneroLib.MoneroUtils.xmrToAtomicUnits(options.amount),
    accountIndex: 0,
    relay: true,
    priority: priorityFromInput(options.priority, moneroLib),
  })

  if (options.subtractFeeFromAmount) {
    config.setSubtractFeeFrom([0])
  }

  const tx = await wallet.createTx(config)
  const txHash = tx.getHash()
  const fee = moneroLib.MoneroUtils.atomicUnitsToXmr(tx.getFee())

  await refreshWalletInternal()
  void publishWalletBackup()
  await publishEmberReceipt(options.amount, txHash ?? '', options)

  return {
    txHash: txHash ?? '',
    fee,
    amount: options.amount,
    timestamp: Date.now(),
    noteId: options.noteId,
    recipientPubkey: options.recipientPubkey,
  }
}

export async function withdrawAll(address: string): Promise<SendMoneroResult[]> {
  requireUnlocked()
  const moneroLib = await loadMonero()
  const wallet = await ensureWalletInstance()
  if (!address || !address.trim()) {
    throw new Error('Destination address is required.')
  }
  const sweeps = await wallet.sweepUnlocked({
    address: address.trim(),
    accountIndex: 0,
    relay: true,
  })
  await refreshWalletInternal()
  void publishWalletBackup()
  return sweeps.map(tx => {
    const outgoing = typeof tx.getOutgoingAmount === 'function' ? tx.getOutgoingAmount() : 0n
    return {
      txHash: tx.getHash() ?? '',
      fee: moneroLib.MoneroUtils.atomicUnitsToXmr(tx.getFee()),
      amount: moneroLib.MoneroUtils.atomicUnitsToXmr(outgoing),
      timestamp: Date.now(),
    }
  })
}

export async function setWalletSharePreference(enabled: boolean): Promise<void> {
  shareAddressPreference = enabled
  await saveSetting(WALLET_SHARE_KEY, enabled)
  setSharePreferenceInStore(enabled)
  if (enabled) {
    if (cachedMeta?.address) {
      void syncProfileAddress(cachedMeta.address)
    }
  } else {
    void syncProfileAddress(null)
  }
}

export async function deleteWallet(): Promise<void> {
  await disposeWalletInstance(false)
  if (shareAddressPreference) {
    void syncProfileAddress(null)
  }
  cachedSecrets = null
  cachedMeta = null
  currentPin = null
  clearSessionPinCache()
  walletSyncPromise = null
  await saveSetting(WALLET_SECRETS_KEY, null)
  await saveSetting(WALLET_META_KEY, null)
  await saveSetting(WALLET_NODE_KEY, null)
  await resetBrowserFs()
  resetWalletStore()
}

