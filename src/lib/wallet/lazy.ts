/**
 * Lazy loading wrapper for wallet functionality
 * This ensures the large monero-ts library is only loaded when actually needed
 */

import { getSetting } from '$lib/db'

let walletModulePromise: Promise<typeof import('./index')> | null = null
let walletModule: typeof import('./index') | null = null
let walletExistsCache: boolean | null = null

/**
 * Lazy load the wallet module
 */
function loadWalletModule() {
  if (!walletModulePromise) {
    logger.info('📦 Lazy loading wallet module (monero-ts)...')
    walletModulePromise = import('./index').then(mod => {
      walletModule = mod
      return mod
    })
  }
  return walletModulePromise
}

/**
 * Check if wallet exists without loading the full wallet module
 * This is fast and doesn't load monero-ts
 */
export async function checkWalletExists(): Promise<boolean> {
  if (walletExistsCache !== null) {
    return walletExistsCache
  }

  const [hasWalletSecrets, hasWalletMeta] = await Promise.all([
    getSetting('walletEncrypted'),
    getSetting('walletMetaInfo')
  ])

  walletExistsCache = Boolean(hasWalletSecrets && hasWalletMeta)
  return walletExistsCache
}

/**
 * Hydrate wallet state (lazy loaded)
 * Only loads the wallet module if there's actually a wallet to hydrate
 */
export async function hydrateWalletStateLazy(): Promise<void> {
  const walletExists = await checkWalletExists()

  const wallet = await loadWalletModule()
  await wallet.hydrateWalletState()
  walletExistsCache = walletExists
  logger.info(walletExists ? '🔥 Wallet hydrated and ready for auto-sync' : '🚫 No wallet found - wallet state reset')
}


/**
 * Invalidate wallet exists cache (call when creating/deleting wallet)
 */
export function invalidateWalletCache() {
  walletExistsCache = null
}

/**
 * Initialize wallet lifecycle (lazy loaded)
 */
export async function initWalletLifecycleLazy(): Promise<void> {
  const lifecycle = await import('./lifecycle')
  lifecycle.initWalletLifecycle()
}

/**
 * Export wallet functions that require lazy loading
 * These wrap the actual wallet functions and load monero-ts only when called
 */

export async function initWallet(mnemonic?: string, options?: { createdAt?: number; restoreHeight?: number }) {
  invalidateWalletCache() // Wallet will exist after this
  const wallet = await loadWalletModule()
  return wallet.initWallet(mnemonic, options)
}

export async function deleteWallet() {
  const wallet = await loadWalletModule()
  const result = await wallet.deleteWallet()
  invalidateWalletCache() // Wallet no longer exists
  return result
}

export async function unlockWallet() {
  const wallet = await loadWalletModule()
  return wallet.unlockWalletWithPin()
}

export async function lockWallet() {
  const wallet = await loadWalletModule()
  return wallet.lockWallet()
}

export async function refreshWallet() {
  const wallet = await loadWalletModule()
  return wallet.refreshWallet()
}

export async function sendMonero(options: any) {
  const wallet = await loadWalletModule()
  return wallet.sendMonero(options)
}

export async function withdrawAll(address: string) {
  const wallet = await loadWalletModule()
  return wallet.withdrawAll(address)
}

export async function getTransactionHistory() {
  const wallet = await loadWalletModule()
  return wallet.getTransactionHistory()
}

export async function setWalletSharePreference(enabled: boolean) {
  const wallet = await loadWalletModule()
  return wallet.setWalletSharePreference(enabled)
}

export async function setActiveNode(nodeId: string) {
  const wallet = await loadWalletModule()
  return wallet.setActiveNode(nodeId)
}

export async function saveCustomNode(config: { label?: string; uri: string }) {
  const wallet = await loadWalletModule()
  return wallet.saveCustomNode(config)
}

export async function clearCustomNode() {
  const wallet = await loadWalletModule()
  return wallet.clearCustomNode()
}

export async function getAvailableNodes() {
  const wallet = await loadWalletModule()
  return wallet.getAvailableNodes()
}

export async function getActiveNode() {
  const wallet = await loadWalletModule()
  return wallet.getActiveNode()
}

export async function hasStoredWallet() {
  const wallet = await loadWalletModule()
  return wallet.hasStoredWallet()
}

export function getCachedMnemonic(): string | null {
  return walletModule?.getCachedMnemonic() ?? null
}

export function getCachedSeed(): string | null {
  return walletModule?.getCachedSeed() ?? null
}

export async function requireWalletMasterKey(): Promise<string> {
  const wallet = await loadWalletModule()
  return wallet.requireWalletMasterKey()
}

export async function readWalletMasterKey(options: { allowCancel?: boolean } = {}): Promise<string | null> {
  const wallet = await loadWalletModule()
  return wallet.readWalletMasterKey(options)
}

// Better approach: Export a function that loads these on demand
export async function loadCachedMnemonic(): Promise<string | null> {
  const wallet = await loadWalletModule()
  return wallet.getCachedMnemonic()
}

export async function loadCachedSeed(): Promise<string | null> {
  const wallet = await loadWalletModule()
  return wallet.getCachedSeed()
}
