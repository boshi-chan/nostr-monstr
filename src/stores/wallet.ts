import { writable } from 'svelte/store'
import type { EmberDraft, WalletState } from '$types/wallet'

function createInitialState(shareAddress = true): WalletState {
  return {
    isReady: false,
    hasWallet: false,
    locked: false,
    balance: 0,
    unlockedBalance: 0,
    address: null,
    isLoading: false,
    isSyncing: false,
    syncProgress: null,
    selectedNode: null,
    customNodeUri: null,
    customNodeLabel: null,
    lastSyncedAt: null,
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
