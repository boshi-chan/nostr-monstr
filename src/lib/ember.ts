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

/**
 * Generate a Monero payment URI for external wallet apps
 * Format: monero:ADDRESS?tx_amount=AMOUNT&tx_description=DESCRIPTION
 */
export function generateMoneroPaymentURI(
  address: string,
  amount: number,
  description?: string
): string {
  const params = new URLSearchParams()
  params.set('tx_amount', amount.toString())
  if (description) {
    params.set('tx_description', description)
  }
  return `monero:${address}?${params.toString()}`
}

/**
 * Validate Monero transaction hash format
 * Standard Monero TX hash is 64 hex characters
 */
export function isValidMoneroTxHash(hash: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(hash)
}
