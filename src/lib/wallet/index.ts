/**
 * Monero Wallet Module
 * Lazy-loaded WASM module for client-side wallet management
 * Keys never leave the device
 */

import { walletState } from '$stores/wallet'
import { encryptWalletData, decryptWalletData } from '$lib/crypto'
import { getSetting, saveSetting } from '$lib/db'

export interface WalletInfo {
  seed: string
  address: string
  balance: number
}

let walletModule: any = null

/**
 * Lazy load wallet module
 */
async function loadWalletModule(): Promise<any> {
  if (walletModule) return walletModule

  try {
    // In production, this would lazy-load a WASM module
    // For now, we'll stub it
    walletModule = {
      generateSeed: () => generateMnemonicSeed(),
      createAddress: (seed: string) => deriveAddressFromSeed(seed),
    }
    return walletModule
  } catch (err) {
    console.error('Failed to load wallet module:', err)
    throw err
  }
}

/**
 * Initialize wallet (create new or restore)
 */
export async function initWallet(pin: string, seed?: string): Promise<WalletInfo> {
  const module = await loadWalletModule()

  const walletSeed = seed ?? module.generateSeed()

  const address = module.createAddress(walletSeed)

  // Encrypt and store seed
  const encrypted = await encryptWalletData(walletSeed, pin)
  await saveSetting('walletEncrypted', encrypted)

  walletState.update((state) => ({
    ...state,
    hasWallet: true,
    address,
    isLocked: true,
  }))

  return {
    seed: walletSeed,
    address,
    balance: 0,
  }
}

/**
 * Unlock wallet with PIN
 */
export async function unlockWallet(pin: string): Promise<boolean> {
  try {
    const encrypted = await getSetting('walletEncrypted')
    if (!encrypted) return false

    await decryptWalletData(
      encrypted.encryptedData,
      encrypted.iv,
      encrypted.salt,
      pin
    )

    walletState.update((state) => ({
      ...state,
      isLocked: false,
    }))

    return true
  } catch (err) {
    console.error('Failed to unlock wallet:', err)
    return false
  }
}

/**
 * Lock wallet (clear plaintext from memory)
 */
export function lockWallet(): void {
  walletState.update((state) => ({
    ...state,
    isLocked: true,
  }))
}

/**
 * Generate BIP39 mnemonic seed (stub)
 */
function generateMnemonicSeed(): string {
  // In production, use proper BIP39 implementation
  const words = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
    'academy', 'accept', 'access', 'accident', 'account', 'accuse', 'achieve',
  ]
  return Array(12).fill(0).map(() => words[Math.floor(Math.random() * words.length)]).join(' ')
}

/**
 * Derive Monero address from seed (stub)
 */
function deriveAddressFromSeed(seed: string): string {
  // In production, use proper Monero derivation
  const normalized = seed.replace(/[^a-f0-9]/gi, '').toLowerCase()
  const padded = (normalized + 'a'.repeat(94)).slice(0, 94)
  return `4${padded}`
}

/**
 * Send Monero (stub)
 */
export async function sendMonero(
  address: string,
  amount: number,
  pin: string
): Promise<{ txHash: string }> {
  if (!(await unlockWallet(pin))) {
    throw new Error('Invalid PIN')
  }

  console.info('[wallet] sendMonero stub', { address, amount })

  // In production, create actual transaction
  const txHash = 'tx_' + Math.random().toString(36).substring(7)

  lockWallet()

  return { txHash }
}
