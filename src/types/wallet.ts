export type WalletBackupStatus = 'idle' | 'syncing' | 'ok' | 'error'

export interface WalletState {
  isLocked: boolean
  hasWallet: boolean
  balance: number
  unlockedBalance: number
  address: string | null
  isLoading: boolean
  isSyncing: boolean
  selectedNode: string | null
  lastSyncedAt: number | null
  lastBackupAt: number | null
  remoteBackupAvailable: boolean
  backupStatus: WalletBackupStatus
  restoreHeight: number | null
  shareAddress: boolean
}

export interface WalletConfig {
  pin: string
  seed?: string
}

export interface WalletBackupPayload {
  seed: string
  mnemonic: string
  address: string
  createdAt: number
  network: 'mainnet' | 'testnet' | 'stagenet'
  restoreHeight: number
  nodeId: string
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
