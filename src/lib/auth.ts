/**
 * Authentication utilities
 * Uses NDK for proper Nostr authentication with reactivity
 */

import { currentUser } from '$stores/auth'
import { getSetting, saveSetting } from './db'
import { loginWithNIP07, logoutNDK } from './ndk'
import type { User } from '$types/user'
import type { NDKUser } from '@nostr-dev-kit/ndk'

/**
 * Convert NDK user to our User type
 */
function ndkUserToUser(ndkUser: NDKUser): User {
  return {
    pubkey: ndkUser.pubkey,
    name: ndkUser.profile?.name,
    picture: ndkUser.profile?.image,
    about: ndkUser.profile?.about,
    nip05: ndkUser.profile?.nip05,
  }
}

/**
 * Generate Nostr Connect URL (NIP-46)
 * Creates a connection URL that can be shared with wallets or displayed as QR
 */
export async function loginWithNostrConnect(): Promise<string> {
  // Generate a random token for this session
  const token = Array(32)
    .fill(0)
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('')

  // Generate relay URL for NIP-46
  const relayUrl = 'wss://relay.damus.io' // Could be customizable

  // Create NIP-46 connection string
  // Format: nostr+walletconnect://pubkey?relay=relayUrl&token=token
  const connectUrl = `nostr+walletconnect://${token}?relay=${encodeURIComponent(relayUrl)}`

  // Store connection info for later use
  await saveSetting('nostrConnectToken', token)
  await saveSetting('nostrConnectRelay', relayUrl)

  return connectUrl
}

/**
 * Handle Nostr Connect callback
 * Called when wallet responds with user's public key
 */
export async function handleNostrConnectCallback(pubkey: string): Promise<User> {
  const user: User = {
    pubkey,
    // No privateKey stored - all signing happens in the wallet
  }

  // Store user info (public data only)
  await saveSetting('currentUser', user)
  await saveSetting('lastLogin', new Date().toISOString())

  currentUser.set(user)
  return user
}

/**
 * Check if NIP-07 (browser extension) is available
 */
export function hasNostrExtension(): boolean {
  return typeof window !== 'undefined' && (window as any).nostr !== undefined
}

/**
 * Login with browser extension (NIP-07)
 * Uses NDK for proper signer management
 */
export async function loginWithExtension(): Promise<User> {
  if (!hasNostrExtension()) {
    throw new Error('No Nostr extension detected')
  }

  try {
    const ndkUser = await loginWithNIP07()

    // Fetch profile metadata
    await ndkUser.fetchProfile()

    const user = ndkUserToUser(ndkUser)

    // Save to store and persistence
    await saveSetting('currentUser', user)
    await saveSetting('authMethod', 'extension')
    await saveSetting('lastLogin', new Date().toISOString())

    currentUser.set(user)

    return user
  } catch (err) {
    throw new Error(`Extension login failed: ${err}`)
  }
}

/**
 * Restore session from storage
 */
export async function restoreSession(): Promise<User | null> {
  try {
    const savedUser = await getSetting('currentUser')
    const authMethod = await getSetting('authMethod')

    if (!savedUser || !authMethod) {
      return null
    }

    // If they used extension, try to restore signer
    if (authMethod === 'extension' && hasNostrExtension()) {
      try {
        // Re-authenticate with extension
        const ndkUser = await loginWithNIP07()

        // Verify it's the same user
        if (ndkUser.pubkey === savedUser.pubkey) {
          currentUser.set(savedUser)
          return savedUser
        }
      } catch (err) {
        console.warn('Failed to restore extension session:', err)
      }
    }

    // Fallback: Load user without signer (read-only mode)
    currentUser.set(savedUser)
    return savedUser
  } catch (err) {
    console.error('Failed to restore session:', err)
    return null
  }
}

/**
 * Logout - properly cleanup NDK and stores
 */
export async function logout(): Promise<void> {
  console.log('🚪 logout() called - starting cleanup')

  // Clear NDK signer
  console.log('🚪 Clearing NDK signer')
  logoutNDK()

  // Stop all feed subscriptions and clear feed
  console.log('🚪 Stopping subscriptions and clearing feed')
  const { stopAllSubscriptions, clearFeed } = await import('./feed-ndk')
  stopAllSubscriptions()
  clearFeed()

  // Clear all feed state stores
  console.log('🚪 Clearing all feed state')
  try {
    const {
      likedEvents,
      repostedEvents,
      zappedEvents,
      metadataCache,
      userEventIds,
      following,
      circles,
    } = await import('$stores/feed')

    likedEvents.set(new Set())
    repostedEvents.set(new Set())
    zappedEvents.set(new Map())
    metadataCache.set(new Map())
    userEventIds.set(new Set())
    following.set(new Set())
    circles.set(new Set())
  } catch (err) {
    console.warn('Failed to clear feed stores:', err)
  }

  // Stop notifications
  console.log('🚪 Stopping notifications')
  try {
    const { stopNotificationListener } = await import('$lib/notifications')
    stopNotificationListener()
  } catch (err) {
    console.warn('Failed to stop notifications:', err)
  }

  // Clear storage
  console.log('🚪 Clearing storage')
  await saveSetting('currentUser', null)
  await saveSetting('authMethod', null)
  await saveSetting('nostrConnectToken', null)

  // Clear store - this triggers reactive updates
  console.log('🚪 Setting currentUser to null (should trigger isAuthenticated = false)')
  currentUser.set(null)
  console.log('🚪 Logout complete - currentUser.set(null) called')
}

/**
 * Get auth method used
 */
export async function getAuthMethod(): Promise<string | null> {
  return await getSetting('authMethod')
}

/**
 * Update user profile
 */
export async function updateProfile(updates: Partial<User>): Promise<void> {
  currentUser.update((user) => {
    if (!user) return user
    const updated = { ...user, ...updates }

    // Persist to storage
    saveSetting('currentUser', updated).catch(err => {
      console.error('Failed to save profile updates:', err)
    })

    return updated
  })

  // TODO: Publish profile event to relays using NDK
}
