export interface WalletState {
  isLocked: boolean
  hasWallet: boolean
  balance: number
  address: string | null
  isLoading: boolean
  selectedNode: string | null
}

export interface WalletConfig {
  pin: string
  seed?: string
}

export interface EmberTip {
  recipientPubkey: string
  amount: number // piconero
  noteId?: string
  txHash?: string
}
