export const EMBER_EVENT_KIND = 7375
export const EMBER_TAG = 'emberxmr'
export const EMBER_PRESET_AMOUNTS = [0.0001, 0.001, 0.01]

const AU_PER_XMR = 1_000_000_000_000n

export interface EmberReceiptPayload {
  senderPubkey: string
  senderAddress?: string
  recipientPubkey?: string
  noteId?: string
  txHash?: string
  amountAtomic: string
  createdAt: number
}

export function atomicToXmr(amountAtomic: string): number {
  try {
    const atomic = BigInt(amountAtomic)
    const whole = Number(atomic) / Number(AU_PER_XMR)
    return Number(whole.toFixed(12))
  } catch {
    return 0
  }
}

export function encodeEmberPayload(payload: EmberReceiptPayload): string {
  try {
    const json = JSON.stringify(payload)
    return btoa(unescape(encodeURIComponent(json)))
  } catch {
    return ''
  }
}

export function decodeEmberPayload(serialized?: string | null): EmberReceiptPayload | null {
  if (!serialized) return null
  try {
    const json = decodeURIComponent(escape(atob(serialized)))
    return JSON.parse(json) as EmberReceiptPayload
  } catch {
    return null
  }
}
