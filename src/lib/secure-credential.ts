/**
 * Secure credential storage using Android Keystore and Biometric authentication
 * Stores encrypted private keys that can only be decrypted with biometric auth
 */

import { Capacitor, registerPlugin } from '@capacitor/core'

export interface SecureCredentialPlugin {
  /**
   * Check if biometric authentication is available
   */
  canAuthenticate(): Promise<{
    available: boolean
    hasEnrolled: boolean
    status: 'available' | 'no_hardware' | 'hw_unavailable' | 'none_enrolled' | 'security_update_required' | 'unknown'
  }>

  /**
   * Store a private key securely (encrypted with Keystore)
   */
  storePrivateKey(options: { privateKey: string }): Promise<{ success: boolean }>

  /**
   * Retrieve private key with biometric authentication
   */
  retrievePrivateKey(): Promise<{ privateKey: string }>

  /**
   * Check if a private key is stored
   */
  hasStoredKey(): Promise<{ hasKey: boolean }>

  /**
   * Delete stored private key
   */
  deletePrivateKey(): Promise<{ success: boolean }>
}

const SecureCredential = registerPlugin<SecureCredentialPlugin>('SecureCredential')

/**
 * Check if secure credential storage is available (Android only)
 */
export function isSecureStorageAvailable(): boolean {
  return Capacitor.getPlatform() === 'android'
}

/**
 * Check if biometric authentication is available on this device
 */
export async function canUseBiometricAuth(): Promise<boolean> {
  if (!isSecureStorageAvailable()) {
    return false
  }

  try {
    const result = await SecureCredential.canAuthenticate()
    return result.available && result.status === 'available'
  } catch (err) {
    console.warn('[SecureCredential] Failed to check biometric availability:', err)
    return false
  }
}

/**
 * Securely store a Nostr private key (encrypted with Android Keystore)
 * The key can only be retrieved with biometric authentication
 */
export async function storePrivateKeySecurely(privateKey: string): Promise<void> {
  if (!isSecureStorageAvailable()) {
    throw new Error('Secure storage is only available on Android')
  }

  try {
    const result = await SecureCredential.storePrivateKey({ privateKey })
    if (!result.success) {
      throw new Error('Failed to store private key')
    }
    console.log('[SecureCredential] Private key stored securely')
  } catch (err) {
    console.error('[SecureCredential] Error storing private key:', err)
    throw new Error(`Failed to store private key: ${err}`)
  }
}

/**
 * Retrieve the stored private key with biometric authentication
 * This will prompt the user for fingerprint/face/PIN
 */
export async function retrievePrivateKeySecurely(): Promise<string> {
  if (!isSecureStorageAvailable()) {
    throw new Error('Secure storage is only available on Android')
  }

  try {
    const result = await SecureCredential.retrievePrivateKey()
    console.log('[SecureCredential] Private key retrieved successfully')
    return result.privateKey
  } catch (err) {
    console.error('[SecureCredential] Error retrieving private key:', err)
    throw new Error(`Failed to retrieve private key: ${err}`)
  }
}

/**
 * Check if a private key is stored securely
 */
export async function hasStoredPrivateKey(): Promise<boolean> {
  if (!isSecureStorageAvailable()) {
    return false
  }

  try {
    const result = await SecureCredential.hasStoredKey()
    return result.hasKey
  } catch (err) {
    console.warn('[SecureCredential] Error checking stored key:', err)
    return false
  }
}

/**
 * Delete the stored private key
 */
export async function deleteStoredPrivateKey(): Promise<void> {
  if (!isSecureStorageAvailable()) {
    return
  }

  try {
    await SecureCredential.deletePrivateKey()
    console.log('[SecureCredential] Private key deleted')
  } catch (err) {
    console.error('[SecureCredential] Error deleting private key:', err)
    throw new Error(`Failed to delete private key: ${err}`)
  }
}
