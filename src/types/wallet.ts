export interface WalletState {
  isReady: boolean
  hasWallet: boolean
  locked: boolean
  balance: number
  unlockedBalance: number
  address: string | null
  isLoading: boolean
  isSyncing: boolean
  syncProgress: number | null
  selectedNode: string | null
  customNodeUri: string | null
  customNodeLabel: string | null
  lastSyncedAt: number | null
  restoreHeight: number | null
  shareAddress: boolean
}

export interface WalletConfig {
  seed?: string
}

export interface EmberTip {
  recipientPubkey: string
  amount: number // piconero
  noteId?: string
  txHash?: string
  address?: string
}

export interface SendMoneroOptions {
  address: string
  amount: number // XMR
  note?: string
  recipientPubkey?: string
  noteId?: string
  priority?: 'low' | 'normal' | 'high'
  subtractFeeFromAmount?: boolean
}

export interface SendMoneroResult {
  txHash: string
  fee: number
  amount: number
  timestamp: number
  noteId?: string
  recipientPubkey?: string
}

export interface EmberDraft {
  recipientPubkey?: string
  address?: string | null
  noteId?: string | null
  amountHint?: number
}
