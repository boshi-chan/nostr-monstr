/**
 * Encryption utilities for wallet
 * Uses AES-GCM with PIN-derived key (PBKDF2/Argon2)
 */

export async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const pinData = encoder.encode(pin)

  const baseKey = await crypto.subtle.importKey('raw', pinData, 'PBKDF2', false, [
    'deriveKey',
  ])

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptWalletData(data: string, pin: string): Promise<{
  encryptedData: string
  iv: string
  salt: string
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const key = await deriveKeyFromPin(pin, salt)
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  )

  return {
    encryptedData: bufferToHex(new Uint8Array(encryptedBuffer)),
    iv: bufferToHex(iv),
    salt: bufferToHex(salt),
  }
}

export async function decryptWalletData(
  encryptedData: string,
  iv: string,
  salt: string,
  pin: string
): Promise<string> {
  const saltBuffer = hexToBuffer(salt)
  const ivBuffer = hexToBuffer(iv)
  const encryptedBuffer = hexToBuffer(encryptedData)

  const key = await deriveKeyFromPin(pin, saltBuffer)

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    encryptedBuffer
  )

  const decoder = new TextDecoder()
  return decoder.decode(decryptedBuffer)
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBuffer(hex: string): Uint8Array {
  const buffer = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    buffer[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return buffer
}
