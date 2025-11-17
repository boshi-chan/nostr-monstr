/**
 * Authentication utilities
 * Uses NDK for proper Nostr authentication with reactivity
 */

import { currentUser } from '$stores/auth'
import {
  likedEvents,
  repostedEvents,
  zappedEvents,
  metadataCache,
  userEventIds,
  following,
  circles,
} from '$stores/feed'
import {
  conversations,
  conversationMetadata,
  conversationMessages,
  activeConversation,
  unreadCounts,
  messagesLoading,
  messagesError,
} from '$stores/messages'
import { getSetting, saveSetting } from './db'
import { loginWithNIP07, logoutNDK, createNostrConnectSigner, completeNostrConnectLogin, loadUserRelaysAndConnect } from './ndk'
import type { User } from '$types/user'
import type { NDKUser, NDKNip46Signer } from '@nostr-dev-kit/ndk'
import { warmupMessagingPermissions, resetMessagingState } from '$lib/messaging-simple'
import { stopAllSubscriptions, clearFeed } from './feed-ndk'
import { stopNotificationListener } from '$lib/notifications'

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
 * Start Nostr Connect login flow (NIP-46)
 * Creates a connection URI that should be displayed as QR code for mobile signers
 * @returns Object with signer instance and URI to display
 */
export async function startNostrConnectLogin(): Promise<{
  signer: NDKNip46Signer
  uri: string
}> {
  const result = await createNostrConnectSigner()
  logger.info('Nostr Connect flow started, URI generated')
  return result
}

/**
 * Complete Nostr Connect login
 * Waits for the mobile signer to approve and complete the connection
 * @param signer The signer instance from startNostrConnectLogin
 * @returns The authenticated user
 */
export async function finishNostrConnectLogin(signer: NDKNip46Signer): Promise<User> {
  try {
    // Wait for connection handshake
    const ndkUser = await completeNostrConnectLogin(signer)

    // Fetch profile metadata
    await ndkUser.fetchProfile()

    const user = ndkUserToUser(ndkUser)

    // Save to store and persistence
    await saveSetting('currentUser', user)
    await saveSetting('authMethod', 'nostrconnect')
    await saveSetting('lastLogin', new Date().toISOString())

    // Serialize signer for session restore
    const signerPayload = signer.toPayload()
    await saveSetting('nostrConnectSigner', signerPayload)

    currentUser.set(user)
    void warmupMessagingPermissions()

    // Load user's custom relays from NIP-65 and connect to them
    void loadUserRelaysAndConnect()

    return user
  } catch (err) {
    throw new Error(`Nostr Connect login failed: ${err}`)
  }
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
    void warmupMessagingPermissions()

    // Load user's custom relays from NIP-65 and connect to them
    void loadUserRelaysAndConnect()

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
          void warmupMessagingPermissions()
          void loadUserRelaysAndConnect()
          return savedUser
        }
      } catch (err) {
        logger.warn('Failed to restore extension session:', err)
      }
    }

    // If they used Nostr Connect, try to restore signer
    if (authMethod === 'nostrconnect') {
      try {
        const signerPayload = await getSetting('nostrConnectSigner')
        if (signerPayload) {
          // Restore signer from serialized payload
          const { getNDK } = await import('./ndk')
          const { NDKNip46Signer } = await import('@nostr-dev-kit/ndk')
          const ndk = getNDK()
          const signer = await NDKNip46Signer.fromPayload(signerPayload, ndk)

          // Set as active signer
          ndk.signer = signer

          // Verify it's the same user
          const user = await signer.user()
          if (user.pubkey === savedUser.pubkey) {
            currentUser.set(savedUser)
            void warmupMessagingPermissions()
            void loadUserRelaysAndConnect()
            return savedUser
          }
        }
      } catch (err) {
        logger.warn('Failed to restore Nostr Connect session:', err)
      }
    }

    // Fallback: Load user without signer (read-only mode)
    currentUser.set(savedUser)
    void warmupMessagingPermissions()
    void loadUserRelaysAndConnect()
    return savedUser
  } catch (err) {
    logger.error('Failed to restore session:', err)
    return null
  }
}

/**
 * Logout - properly cleanup NDK and stores
 */
export async function logout(): Promise<void> {
  logger.info('logout() called - starting cleanup')

  // Clear NDK signer
  logger.info('Clearing NDK signer')
  logoutNDK()

  // Stop all feed subscriptions and clear feed
  logger.info('Stopping subscriptions and clearing feed')
  stopAllSubscriptions()
  clearFeed()
  resetMessagingState()

  // Clear all feed state stores
  logger.info('Clearing all feed state')
  likedEvents.set(new Set())
  repostedEvents.set(new Set())
  zappedEvents.set(new Map())
  metadataCache.set(new Map())
  userEventIds.set(new Set())
  following.set(new Set())
  circles.set(new Set())

  conversations.set(new Map())
  conversationMetadata.set(new Map())
  conversationMessages.set([])
  activeConversation.set(null)
  unreadCounts.set(new Map())
  messagesLoading.set(false)
  messagesError.set(null)

  // Stop notifications
  logger.info('Stopping notifications')
  stopNotificationListener()

  // Clear storage
  logger.info('Clearing storage')
  await saveSetting('currentUser', null)
  await saveSetting('authMethod', null)
  await saveSetting('nostrConnectSigner', null)

  // Clear store - this triggers reactive updates
  logger.info('Setting currentUser to null (should trigger isAuthenticated = false)')
  currentUser.set(null)
  logger.info('Logout complete - currentUser.set(null) called')
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
      logger.error('Failed to save profile updates:', err)
    })

    return updated
  })

  // TODO: Publish profile event to relays using NDK
}

