/**
 * Monero wallet integration powered by monero-ts.
 * Keys are generated client-side and stored encrypted with a local master key.
 * Adds remote backups via Nostr (NIP-04) and Ember tipping helpers.
 */

import { walletState, resetWalletStore, setSharePreferenceInStore } from '$stores/wallet'
import { requestPinModal } from '$stores/pinPrompt'
import { encryptWalletData, decryptWalletData } from '$lib/crypto'
import { getSetting, saveSetting } from '$lib/db'
import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import type moneroTs from 'monero-ts'
import { NDKEvent, type NDKFilter, type NDKSubscriptionOptions } from '@nostr-dev-kit/ndk'
import type { MoneroNode } from './nodes'
import { CUSTOM_NODE_ID, DEFAULT_NODES, getNodeById } from './nodes'
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
const WALLET_CUSTOM_NODE_KEY = 'walletCustomNode'
const WALLET_SHARE_KEY = 'walletShareAddress'
const WALLET_MASTER_KEY = 'walletMasterKey'
const HOT_WALLET_WARNING_KEY = 'walletHotWalletWarning'
const PIN_CANCELLED_ERROR = 'WALLET_PIN_CANCELLED'
const WALLET_BACKUP_KIND = 30078
const WALLET_BACKUP_D_TAG = 'monstr-wallet'
const BLOCK_TIME_SECONDS = 120
const REFERENCE_HEIGHT = 3350000 // Fallback reference: December 2024
const REFERENCE_TIMESTAMP = Date.UTC(2024, 11, 15) // Fallback reference: December 15, 2024
const RESTORE_LOOKBACK_SECONDS = 7 * 24 * 60 * 60 // Lookback period: 7 days for fast sync (enough for new wallets)

let monero: MoneroLib | null = null
let walletInstance: MoneroWalletFullInstance | null = null
let walletSyncPromise: Promise<void> | null = null
let walletKey: string | null = null
let cachedSecrets: StoredWalletSecrets | null = null
let cachedMeta: WalletMetaInfo | null = null
let activeNode: MoneroNode = DEFAULT_NODES[0]
let customNode: MoneroNode | null = null
let shareAddressPreference = true
let masterKeyCache: string | null = null

type StoredCustomNode = {
  label?: string
  uri: string
  username?: string
  password?: string
}

type EncryptedMasterKeyPayload = {
  encryptedData: string
  iv: string
  salt: string
}

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function createRandomHexKey(bytes = 32): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('')
}

function parseEncryptedMasterKey(raw: string): EncryptedMasterKeyPayload | null {
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.encryptedData === 'string' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.salt === 'string'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

function showHotWalletWarning(): void {
  if (!isBrowser()) return
  if (window.localStorage.getItem(HOT_WALLET_WARNING_KEY) === '1') return
  window.alert(
    'Security warning: The embedded Ember wallet is a hot wallet. Only keep small balances on this device and never reuse this PIN elsewhere.'
  )
  window.localStorage.setItem(HOT_WALLET_WARNING_KEY, '1')
}

async function requestPin(promptText: string, allowCancel: boolean): Promise<string | null> {
  if (!isBrowser()) return null
  let message = promptText
  while (true) {
    const input = await requestPinModal(`${message}\n(Use 4-32 digits)`, allowCancel)
    if (input === null) {
      return null
    }
    const trimmed = input.trim()
    if (!/^\d{4,32}$/.test(trimmed)) {
      message = 'PIN must be 4-32 digits.'
      continue
    }
    return trimmed
  }
}

async function requestNewPin(): Promise<string> {
  let promptMessage = 'Create a wallet PIN'
  while (true) {
    const first = await requestPin(promptMessage, false)
    if (!first) {
      promptMessage = 'PIN must be 4-32 digits. Create a wallet PIN'
      continue
    }
    const confirmPin = await requestPin('Confirm your wallet PIN', false)
    if (!confirmPin) {
      promptMessage = 'PIN must be 4-32 digits. Create a wallet PIN'
      continue
    }
    if (first !== confirmPin) {
      promptMessage = 'PINs did not match. Create a wallet PIN'
      continue
    }
    return first
  }
}

async function storeEncryptedMasterKey(masterKey: string, pin: string): Promise<void> {
  const encrypted = await encryptWalletData(masterKey, pin)
  try {
    window.localStorage.setItem(WALLET_MASTER_KEY, JSON.stringify(encrypted))
  } catch (err) {
    console.warn('Failed to persist encrypted wallet key', err)
  }
}

async function unlockEncryptedMasterKeyFromStorage(
  raw: string,
  allowCancel: boolean
): Promise<string | null> {
  const payload = parseEncryptedMasterKey(raw)
  if (!payload) {
    const masterKey = raw
    const pin = await requestNewPin()
    await storeEncryptedMasterKey(masterKey, pin)
    showHotWalletWarning()
    return masterKey
  }

  const attempts = 5
  let promptText = allowCancel
    ? 'Enter your wallet PIN (Cancel to skip unlock)'
    : 'Enter your wallet PIN'
  for (let i = 0; i < attempts; i++) {
    const pin = await requestPin(promptText, allowCancel)
    if (!pin) {
      if (allowCancel) {
        return null
      }
      promptText = 'Wallet PIN is required. Enter your wallet PIN'
      continue
    }

    try {
      const masterKey = await decryptWalletData(
        payload.encryptedData,
        payload.iv,
        payload.salt,
        pin
      )
      showHotWalletWarning()
      return masterKey
    } catch (err) {
      console.warn('Failed to decrypt wallet master key', err)
      promptText = 'Incorrect PIN. Enter your wallet PIN'
    }
  }

  if (allowCancel) {
    window.alert('Wallet unlock cancelled.')
    return null
  }

  throw new Error('Failed to unlock wallet after multiple attempts.')
}

async function ensureMasterKey(): Promise<string> {
  if (masterKeyCache) return masterKeyCache
  if (!isBrowser()) {
    throw new Error('Wallet key unavailable outside of browser')
  }
  const existing = window.localStorage.getItem(WALLET_MASTER_KEY)
  if (existing) {
    const unlocked = await unlockEncryptedMasterKeyFromStorage(existing, false)
    if (!unlocked) {
      throw new Error('Wallet PIN is required to continue')
    }
    masterKeyCache = unlocked
    return unlocked
  }
  const pin = await requestNewPin()
  const generated = createRandomHexKey()
  await storeEncryptedMasterKey(generated, pin)
  showHotWalletWarning()
  masterKeyCache = generated
  return generated
}

async function readMasterKey(options: { allowCancel?: boolean } = {}): Promise<string | null> {
  if (masterKeyCache) return masterKeyCache
  if (!isBrowser()) return null
  const stored = window.localStorage.getItem(WALLET_MASTER_KEY)
  if (!stored) return null
  try {
    const unlocked = await unlockEncryptedMasterKeyFromStorage(
      stored,
      options.allowCancel !== false
    )
    if (!unlocked) {
      return null
    }
    masterKeyCache = unlocked
    return unlocked
  } catch (err) {
    if (
      options.allowCancel !== false &&
      err instanceof Error &&
      err.message === PIN_CANCELLED_ERROR
    ) {
      return null
    }
    throw err
  }
}

function clearMasterKey(): void {
  masterKeyCache = null
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(WALLET_MASTER_KEY)
    window.localStorage.removeItem(HOT_WALLET_WARNING_KEY)
  } catch (err) {
    console.warn('Failed to clear wallet key', err)
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

async function persistSecrets(key: string, secrets: StoredWalletSecrets): Promise<void> {
  const encrypted = await encryptWalletData(JSON.stringify(secrets), key)
  await saveSetting(WALLET_SECRETS_KEY, encrypted)
}

async function loadEncryptedSecrets(): Promise<any> {
  return await getSetting(WALLET_SECRETS_KEY)
}

async function tryDecodeSecrets(
  encrypted: Awaited<ReturnType<typeof loadEncryptedSecrets>>,
  key: string
): Promise<StoredWalletSecrets | null> {
  if (!encrypted) return null
  try {
    const serialized = await decryptWalletData(
      encrypted.encryptedData,
      encrypted.iv,
      encrypted.salt,
      key
    )
    return JSON.parse(serialized) as StoredWalletSecrets
  } catch (err) {
    console.warn('Failed to decode wallet secrets with provided key', err)
    return null
  }
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
  const restoreHeight = typeof meta.restoreHeight === 'number' ? meta.restoreHeight : estimateRestoreHeightFallback(createdAt)
  const nodeId = typeof meta.nodeId === 'string' ? meta.nodeId : activeNode.id
  const normalizedNode = resolveNode(nodeId) ?? activeNode
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

function buildCustomNode(config: StoredCustomNode): MoneroNode {
  let inputUri = (config.uri ?? '').trim()
  if (!inputUri) {
    throw new Error('Node URL is required.')
  }
  if (!/^https?:\/\//i.test(inputUri)) {
    inputUri = `https://${inputUri}`
  }
  let parsed: URL
  try {
    parsed = new URL(inputUri)
  } catch {
    throw new Error('Enter a valid HTTPS URL for the node.')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Wallet nodes must use HTTPS to run inside the PWA.')
  }
  if (!parsed.port) {
    throw new Error('Node URL must include a port, e.g. :443 or :18089.')
  }

  const username = config.username ?? (parsed.username ? decodeURIComponent(parsed.username) : undefined)
  const password = config.password ?? (parsed.password ? decodeURIComponent(parsed.password) : undefined)

  parsed.username = ''
  parsed.password = ''
  parsed.pathname = ''
  parsed.search = ''
  parsed.hash = ''

  const uri = parsed.toString().replace(/\/$/, '')
  const label = config.label?.trim() || parsed.hostname || 'Custom node'

  return {
    id: CUSTOM_NODE_ID,
    label,
    uri,
    username: username || undefined,
    password: password || undefined,
  }
}

function parseStoredCustomNode(value: any): MoneroNode | null {
  if (!value) return null
  try {
    return buildCustomNode(value)
  } catch (err) {
    console.warn('Ignoring invalid custom node config:', err)
    return null
  }
}

function assignCustomNode(node: MoneroNode | null): void {
  customNode = node
  setWalletState({
    customNodeLabel: node?.label ?? null,
    customNodeUri: node?.uri ?? null,
  })
}

async function persistCustomNode(node: MoneroNode | null): Promise<void> {
  assignCustomNode(node)
  await saveSetting(
    WALLET_CUSTOM_NODE_KEY,
    node
      ? {
          label: node.label,
          uri: node.uri,
          username: node.username,
          password: node.password,
        }
      : null
  )
}

function resolveNode(nodeId?: string | null): MoneroNode | null {
  if (!nodeId) return null
  if (nodeId === CUSTOM_NODE_ID) {
    return customNode
  }
  return getNodeById(nodeId) ?? null
}

async function applyActiveNode(node: MoneroNode): Promise<void> {
  activeNode = node
  await saveSetting(WALLET_NODE_KEY, node.id)
  if (cachedMeta) {
    await persistMeta({ ...cachedMeta, nodeId: node.id })
  }
  await disposeWalletInstance(false)
  setWalletState({ selectedNode: node.id })
  if (cachedSecrets && walletKey) {
    void refreshWalletInternal()
  }
}

/**
 * Fetch current blockchain height from daemon
 */
async function fetchCurrentHeight(): Promise<number> {
  try {
    const moneroLib = await loadMonero()
    const connection = new moneroLib.MoneroRpcConnection({
      uri: activeNode.uri,
      username: activeNode.username,
      password: activeNode.password,
    })

    // Type assertion needed because getHeight exists at runtime but not in type definitions
    const daemonHeight = await (connection as any).getHeight()
    return daemonHeight
  } catch (err) {
    console.warn('Failed to fetch daemon height, using fallback estimation:', err)
    // Fallback to estimation if daemon fetch fails
    return estimateRestoreHeightFallback(Date.now())
  }
}

/**
 * Fallback: estimate restore height based on time (used if daemon is unreachable)
 */
function estimateRestoreHeightFallback(createdAt: number): number {
  const lookbackMillis = RESTORE_LOOKBACK_SECONDS * 1000
  const adjustedTimestamp = Math.max(REFERENCE_TIMESTAMP, createdAt - lookbackMillis)
  const deltaSeconds = Math.max(0, Math.floor((adjustedTimestamp - REFERENCE_TIMESTAMP) / 1000))
  const deltaBlocks = Math.floor(deltaSeconds / BLOCK_TIME_SECONDS)
  const estimatedHeight = Math.max(0, REFERENCE_HEIGHT + deltaBlocks)

  // Safety cap: Don't go more than 90 days ahead of reference to prevent sync failures
  const maxSafeBlocks = Math.floor((90 * 24 * 60 * 60) / BLOCK_TIME_SECONDS)
  const cappedHeight = Math.min(estimatedHeight, REFERENCE_HEIGHT + maxSafeBlocks)

  return cappedHeight
}

/**
 * Calculate restore height with lookback period
 */
async function calculateRestoreHeight(): Promise<number> {
  const currentHeight = await fetchCurrentHeight()

  // Calculate lookback blocks (30 days)
  const lookbackBlocks = Math.floor(RESTORE_LOOKBACK_SECONDS / BLOCK_TIME_SECONDS)

  // Restore from current height minus lookback, ensuring we don't go negative
  const restoreHeight = Math.max(0, currentHeight - lookbackBlocks)

  return restoreHeight
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

function requireReady(): void {
  if (!cachedSecrets || !walletKey) {
    throw new Error('Wallet is not ready. Create or restore it first.')
  }
}

async function ensureWalletInstance(): Promise<MoneroWalletFullInstance> {
  if (walletInstance) {
    return walletInstance
  }

  requireReady()
  const password = walletKey!

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
      password,
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
      password,
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
      setWalletState({ isSyncing: true, syncProgress: 0 })
      const moneroLib = await loadMonero()
      const wallet = await ensureWalletInstance()
      await wallet.setDaemonConnection({
        uri: activeNode.uri,
        proxyToWorker: true,
        ...(activeNode.username ? { username: activeNode.username } : {}),
        ...(activeNode.password ? { password: activeNode.password } : {}),
      } as any)
      let listener: any = null
      if (moneroLib.MoneroWalletListener) {
        listener = new moneroLib.MoneroWalletListener()
        listener.onSyncProgress = async (
          _height: number,
          _startHeight: number,
          _endHeight: number,
          percentDone: number
        ) => {
          const percent =
            typeof percentDone === 'number' && Number.isFinite(percentDone)
              ? Math.max(0, Math.min(100, Math.round(percentDone * 100)))
              : null
          setWalletState({ syncProgress: percent })
        }
      }

      if (listener) {
        await wallet.sync(listener)
      } else {
        await wallet.sync()
      }

      const balanceAtomic = await wallet.getBalance()
      const unlockedAtomic = await wallet.getUnlockedBalance()
      const balance = moneroLib.MoneroUtils.atomicUnitsToXmr(balanceAtomic)
      const unlockedBalance = moneroLib.MoneroUtils.atomicUnitsToXmr(unlockedAtomic)
      setWalletState({
        balance,
        unlockedBalance,
        isSyncing: false,
        syncProgress: 100,
        lastSyncedAt: Date.now(),
      })
    } catch (err) {
      console.error('Wallet sync failed:', err)
      setWalletState({ isSyncing: false, syncProgress: null })
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
  return customNode ? [...DEFAULT_NODES, customNode] : [...DEFAULT_NODES]
}

export function getActiveNode(): MoneroNode {
  return activeNode
}

export async function setActiveNode(nodeId: string): Promise<void> {
  const node = resolveNode(nodeId)
  if (!node) {
    throw new Error(
      nodeId === CUSTOM_NODE_ID ? 'Set up a custom node before selecting it.' : `Unknown node id: ${nodeId}`
    )
  }
  await applyActiveNode(node)
}

export async function saveCustomNode(config: { label?: string; uri: string }): Promise<void> {
  const node = buildCustomNode(config)
  await persistCustomNode(node)
  await applyActiveNode(node)
}

export async function clearCustomNode(): Promise<void> {
  const wasActive = activeNode.id === CUSTOM_NODE_ID
  await persistCustomNode(null)
  if (wasActive) {
    const fallback = DEFAULT_NODES[0]
    if (!fallback) {
      throw new Error('No fallback nodes are available after removing the custom node.')
    }
    await applyActiveNode(fallback)
  }
}

export async function hydrateWalletState(): Promise<void> {
  const [encrypted, meta, savedNodeId, savedSharePref, savedCustomNode] = await Promise.all([
    loadEncryptedSecrets(),
    loadMeta(),
    getSetting(WALLET_NODE_KEY),
    getSetting(WALLET_SHARE_KEY),
    getSetting(WALLET_CUSTOM_NODE_KEY),
  ])

  shareAddressPreference =
    savedSharePref === undefined || savedSharePref === null ? true : Boolean(savedSharePref)
  setSharePreferenceInStore(shareAddressPreference)

  assignCustomNode(parseStoredCustomNode(savedCustomNode))

  const savedNode = resolveNode(savedNodeId)
  const metaNode = resolveNode(meta?.nodeId)
  const fallbackNode = savedNode ?? metaNode ?? customNode ?? DEFAULT_NODES[0]

  if (!fallbackNode) {
    throw new Error('No Monero RPC nodes are configured. Please add a custom node.')
  }

  activeNode = fallbackNode

  const hasWallet = Boolean(encrypted && meta)
  let isReady = false
  let locked = hasWallet

  if (hasWallet && meta) {
    const key = await readMasterKey()
    if (key) {
      const secrets = await tryDecodeSecrets(encrypted, key)
      if (secrets) {
        cachedSecrets = secrets
        walletKey = key
        isReady = true
        locked = false
        // CRITICAL FIX: Don't sync profile address immediately during hydration!
        // The metadata cache is empty at this point, which would wipe the profile.
        // Instead, sync will happen later when the app is fully initialized and metadata is loaded.
        // See: syncProfileAddressWhenReady() in App.svelte
        console.log('⏳ Wallet hydrated. Profile address sync will happen when metadata is ready.')
        void refreshWalletInternal()
      } else {
        locked = true
      }
    } else {
      locked = true
    }
  } else {
    cachedSecrets = null
    walletKey = null
    locked = false
  }

  setWalletState({
    hasWallet,
    isReady,
    locked,
    address: meta?.address ?? null,
    selectedNode: activeNode.id,
    customNodeLabel: customNode?.label ?? null,
    customNodeUri: customNode?.uri ?? null,
    balance: 0,
    unlockedBalance: 0,
    lastSyncedAt: null,
    restoreHeight: meta?.restoreHeight ?? null,
    shareAddress: shareAddressPreference,
  })
}

export async function initWallet(
  mnemonic?: string,
  options?: { createdAt?: number; restoreHeight?: number }
): Promise<WalletInfo> {
  const masterKey = await ensureMasterKey()
  const moneroLib = await loadMonero()

  const walletKeys = await moneroLib.createWalletKeys({
    password: masterKey,
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
  walletKey = masterKey

  await persistSecrets(masterKey, cachedSecrets)
  const createdAt = options?.createdAt ?? Date.now()
  const restoreHeight = options?.restoreHeight ?? (await calculateRestoreHeight())
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
    isReady: true,
    locked: false,
    address,
    balance: 0,
    unlockedBalance: 0,
    selectedNode: activeNode.id,
    customNodeLabel: customNode?.label ?? null,
    customNodeUri: customNode?.uri ?? null,
    isLoading: false,
    restoreHeight,
    shareAddress: shareAddressPreference,
  })

  void publishWalletBackup()
  void refreshWalletInternal()

  // Sync address to profile metadata if sharing is enabled
  if (shareAddressPreference) {
    console.log('📝 Syncing Monero address to profile metadata...')
    try {
      await syncProfileAddress(address)
      console.log('✅ Monero address published to profile')
    } catch (err) {
      console.warn('⚠️ Failed to sync address to profile (non-fatal):', err)
    }
  }

  return {
    seed: walletSeed,
    mnemonic: walletMnemonic,
    address,
    balance: 0,
    unlockedBalance: 0,
  }
}

export async function unlockWalletWithPin(): Promise<void> {
  const encrypted = await loadEncryptedSecrets()
  if (!encrypted) {
    throw new Error('No encrypted wallet found on this device.')
  }

  masterKeyCache = null
  const masterKey = await readMasterKey({ allowCancel: false })
  if (!masterKey) {
    throw new Error(PIN_CANCELLED_ERROR)
  }

  const secrets = await tryDecodeSecrets(encrypted, masterKey)
  if (!secrets) {
    throw new Error('Incorrect PIN or wallet data is corrupted.')
  }

  cachedSecrets = secrets
  walletKey = masterKey
  setWalletState({ isReady: true, locked: false })
  await refreshWalletInternal()
}

export async function lockWallet(): Promise<void> {
  cachedSecrets = null
  walletKey = null
  masterKeyCache = null
  await disposeWalletInstance(false)
  setWalletState({ isReady: false, locked: true })
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
  requireReady()
  await refreshWalletInternal()
}

export async function getTransactionHistory(): Promise<any[]> {
  requireReady()
  const wallet = await ensureWalletInstance()

  try {
    // Fetch all transactions (incoming and outgoing)
    const txs = await wallet.getTxs()
    console.log('🔍 Raw txs from wallet.getTxs():', txs)
    console.log('🔍 Number of transactions:', txs?.length || 0)

    if (!txs || txs.length === 0) {
      console.warn('⚠️ No transactions found in wallet')
      return []
    }

    // Log first transaction to inspect available methods
    if (txs.length > 0) {
      console.log('🔍 First transaction methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(txs[0])))
      console.log('🔍 First transaction sample:', {
        hash: txs[0].getHash?.(),
        height: txs[0].getHeight?.(),
        timestamp: (txs[0] as any).getTimestamp?.(),
        block: txs[0].getBlock?.(),
        isConfirmed: txs[0].getIsConfirmed?.(),
      })
    }

    // Sort by timestamp (most recent first)
    // Try different timestamp methods
    const sorted = Array.from(txs).sort((a, b) => {
      let timeA = 0
      let timeB = 0

      // Try getTimestamp first (use type assertion as method exists at runtime)
      if (typeof (a as any).getTimestamp === 'function') {
        timeA = (a as any).getTimestamp() || 0
      } else if (a.getBlock?.()?.getTimestamp) {
        // Try getting timestamp from block
        timeA = a.getBlock().getTimestamp() || 0
      }

      if (typeof (b as any).getTimestamp === 'function') {
        timeB = (b as any).getTimestamp() || 0
      } else if (b.getBlock?.()?.getTimestamp) {
        timeB = b.getBlock().getTimestamp() || 0
      }

      return timeB - timeA
    })

    console.log('✅ Returning', sorted.length, 'sorted transactions')
    return sorted
  } catch (err) {
    console.error('❌ Failed to fetch transaction history:', err)
    return []
  }
}

export async function restoreWalletFromNostr(): Promise<WalletInfo> {
  const record = await fetchWalletBackupRecord()
  if (!record) {
    throw new Error('No wallet backup found for this Nostr login yet.')
  }
  return await initWallet(record.payload.mnemonic, {
    createdAt: record.payload.createdAt,
    restoreHeight: record.payload.restoreHeight,
  })
}

export async function sendMonero(options: SendMoneroOptions): Promise<SendMoneroResult> {
  requireReady()
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

  // PERFORMANCE OPTIMIZATION: Run wallet refresh and receipt publishing in background
  // This allows the UI to close the "Sending..." modal immediately after transaction is sent
  // instead of waiting 45-60 seconds for wallet sync and Nostr event publishing
  void (async () => {
    try {
      await refreshWalletInternal()
      void publishWalletBackup()
      await publishEmberReceipt(options.amount, txHash ?? '', options)
    } catch (err) {
      console.warn('Background post-send operations failed:', err)
    }
  })()

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
  requireReady()
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
      try {
        await syncProfileAddress(cachedMeta.address)
      } catch (err) {
        console.warn('Failed to sync address to profile:', err)
      }
    }
  } else {
    try {
      await syncProfileAddress(null)
    } catch (err) {
      console.warn('Failed to remove address from profile:', err)
    }
  }
}

export async function deleteWallet(): Promise<void> {
  await disposeWalletInstance(false)
  if (shareAddressPreference) {
    try {
      await syncProfileAddress(null)
    } catch (err) {
      console.warn('Failed to remove address from profile:', err)
    }
  }
  cachedSecrets = null
  cachedMeta = null
  walletKey = null
  clearMasterKey()
  walletSyncPromise = null
  await saveSetting(WALLET_SECRETS_KEY, null)
  await saveSetting(WALLET_META_KEY, null)
  await saveSetting(WALLET_NODE_KEY, null)
  await resetBrowserFs()
  resetWalletStore()
  setWalletState({
    selectedNode: activeNode.id,
    customNodeLabel: customNode?.label ?? null,
    customNodeUri: customNode?.uri ?? null,
    shareAddress: shareAddressPreference,
  })
}
