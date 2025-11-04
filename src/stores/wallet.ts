import { writable } from 'svelte/store'
import type { WalletState } from '$types/wallet'

const initialState: WalletState = {
  isLocked: true,
  hasWallet: false,
  balance: 0,
  address: null,
  isLoading: false,
}

export const walletState = writable<WalletState>(initialState)
export const showWallet = writable(false)
