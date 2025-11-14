/**
 * Encryption utilities for wallet
 * Uses AES-GCM with Argon2id-derived key (falls back to PBKDF2 if Argon2 unavailable)
 */

import { argon2idAsync } from '@noble/hashes/argon2.js'
import { utf8ToBytes } from '@noble/hashes/utils.js'

const ARGON2_MEM_KIB = 64 * 1024 // 64 MB in kibibytes
const ARGON2_TIME = 3
const ARGON2_PARALLELISM = 2
const ARGON2_HASH_LEN = 32

export async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  try {
    const hashBytes = await argon2idAsync(utf8ToBytes(pin), salt, {
      m: ARGON2_MEM_KIB,
      t: ARGON2_TIME,
      p: ARGON2_PARALLELISM,
      dkLen: ARGON2_HASH_LEN,
    })
    const keyBytes = Uint8Array.from(hashBytes)
    return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ])
  } catch (err) {
    // Fallback to PBKDF2 if Argon2 is unavailable (should be rare)
    logger.warn('Argon2 derivation failed, falling back to PBKDF2:', err)
    const encoder = new TextEncoder()
    const pinData = encoder.encode(pin)

    const baseKey = await crypto.subtle.importKey('raw', pinData, 'PBKDF2', false, [
      'deriveKey',
    ])

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer.slice(0) as ArrayBuffer,
        iterations: 600000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }
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
    { name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
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
  const encryptedBytes = hexToBuffer(encryptedData)

  const key = await deriveKeyFromPin(pin, saltBuffer)

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer.buffer.slice(0) as ArrayBuffer },
    key,
    encryptedBytes.buffer.slice(0) as ArrayBuffer
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

