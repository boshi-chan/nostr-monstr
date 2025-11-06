/**
 * Monero wallet integration powered by monero-ts.
 * Keys are generated client-side and encrypted with a user-provided PIN.
 */

import { walletState } from '$stores/wallet'
import { encryptWalletData, decryptWalletData } from '$lib/crypto'
import { getSetting, saveSetting } from '$lib/db'
import type moneroTs from 'monero-ts'
import type { MoneroNode } from './nodes'
import { DEFAULT_NODES, getNodeById } from './nodes'

export interface WalletInfo {
  seed: string
  mnemonic: string
  address: string
  balance: number
}

type StoredWalletSecrets = {
  seed: string
  mnemonic: string
}

type WalletMetaInfo = {
  address: string
  network: 'mainnet' | 'testnet' | 'stagenet'
  createdAt: number
}

const WALLET_SECRETS_KEY = 'walletEncrypted'
const WALLET_META_KEY = 'walletMetaInfo'
const WALLET_NODE_KEY = 'walletActiveNode'

let monero: typeof moneroTs | null = null
let cachedSecrets: StoredWalletSecrets | null = null
let activeNode: MoneroNode = DEFAULT_NODES[0]

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

async function loadMonero(): Promise<typeof moneroTs> {
  if (!isBrowser()) {
    throw new Error('Monero wallet functionality is only available in the browser.')
  }

  if (monero) return monero

  const module = (await import('monero-ts')).default

  // Configure worker loading so Vite bundles the worker asset correctly.
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
  await saveSetting(WALLET_META_KEY, meta)
}

async function loadMeta(): Promise<WalletMetaInfo | null> {
  return (await getSetting(WALLET_META_KEY)) ?? null
}

function setWalletState(partial: Partial<Parameters<typeof walletState.set>[0]>): void {
  walletState.update(state => ({
    ...state,
    ...partial,
  }))
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
  setWalletState({ selectedNode: node.id })
}

/**
 * Hydrate the wallet store from persisted settings (to be called at app startup).
 */
export async function hydrateWalletState(): Promise<void> {
  const [encrypted, meta, savedNodeId] = await Promise.all([
    loadEncryptedSecrets(),
    loadMeta(),
    getSetting(WALLET_NODE_KEY),
  ])

  if (savedNodeId) {
    const node = getNodeById(savedNodeId)
    if (node) {
      activeNode = node
    }
  }

  setWalletState({
    hasWallet: Boolean(encrypted),
    isLocked: Boolean(encrypted),
    address: meta?.address ?? null,
    selectedNode: activeNode.id,
  })
}

/**
 * Create a new wallet or import from mnemonic seed.
 */
export async function initWallet(pin: string, mnemonic?: string): Promise<WalletInfo> {
  if (!pin || pin.trim().length < 4) {
    throw new Error('PIN must be at least 4 characters long.')
  }

  const moneroLib = await loadMonero()

  const walletKeys = await moneroLib.createWalletKeys({
    password: pin,
    networkType: moneroLib.MoneroNetworkType.MAINNET,
    seed: mnemonic,
    language: 'English',
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

  await persistSecrets(pin, cachedSecrets)
  await persistMeta({
    address,
    network: 'mainnet',
    createdAt: Date.now(),
  })

  setWalletState({
    hasWallet: true,
    isLocked: false,
    address,
    balance: 0,
    selectedNode: activeNode.id,
    isLoading: false,
  })

  return {
    seed: walletSeed,
    mnemonic: walletMnemonic,
    address,
    balance: 0,
  }
}

/**
 * Unlock wallet secrets with the user's PIN.
 */
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

    setWalletState({
      hasWallet: true,
      isLocked: false,
      address: meta.address,
      selectedNode: activeNode.id,
    })

    return {
      seed: secrets.seed,
      mnemonic: secrets.mnemonic,
      address: meta.address,
      balance: 0,
    }
  } catch (err) {
    console.error('Failed to unlock wallet:', err)
    return null
  }
}

export function lockWallet(): void {
  cachedSecrets = null
  setWalletState({ isLocked: true })
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

/**
 * Placeholder for sending Monero tips.
 * TODO: Implement MoneroWalletFull integration and transaction flow.
 */
export async function sendMonero(): Promise<never> {
  throw new Error('Monero tipping is not implemented yet.')
}
