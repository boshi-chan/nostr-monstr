import { writable } from 'svelte/store'
import type { EmberDraft, WalletState } from '$types/wallet'

function createInitialState(shareAddress = true): WalletState {
  return {
    isLocked: true,
    hasWallet: false,
    balance: 0,
    unlockedBalance: 0,
    address: null,
    isLoading: false,
    isSyncing: false,
    selectedNode: null,
    lastSyncedAt: null,
    lastBackupAt: null,
    remoteBackupAvailable: false,
    backupStatus: 'idle',
    restoreHeight: null,
    shareAddress,
  }
}

export const walletState = writable<WalletState>(createInitialState())
export const showWallet = writable(false)
export const showEmberModal = writable(false)
export const emberTarget = writable<EmberDraft | null>(null)

let currentSharePreference = true

export function setSharePreferenceInStore(value: boolean): void {
  currentSharePreference = value
  walletState.update(state => ({ ...state, shareAddress: value }))
}

export function resetWalletStore(): void {
  walletState.set(createInitialState(currentSharePreference))
}
