/**
 * Follow/Unfollow functionality for Nostr
 * Handles NIP-03 contacts list management
 * CRITICAL: Never publishes empty contact list!
 */

import { getNDK, getCurrentNDKUser } from './ndk'
import { following } from '$stores/feed'
import { get } from 'svelte/store'

/**
 * Get current contacts (follows) from NIP-03 (kind 3)
 */
export async function getFollowingList(): Promise<Set<string>> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      throw new Error('Not authenticated')
    }

    const ndk = getNDK()
    const event = await ndk.fetchEvent(
      {
        authors: [user.pubkey],
        kinds: [3],
      },
      { closeOnEose: true }
    )

    if (!event) {
      return new Set()
    }

    const follows = new Set<string>()
    for (const tag of event.tags) {
      if (tag[0] === 'p' && tag[1]) {
        follows.add(tag[1])
      }
    }

    return follows
  } catch (err) {
    logger.error('Failed to fetch following list:', err)
    return new Set()
  }
}

/**
 * Publish contacts list to NIP-03 (kind 3)
 * CRITICAL: This NEVER publishes an empty contacts list!
 */
async function publishContactsList(contacts: Set<string>): Promise<void> {
  try {
    const user = getCurrentNDKUser()
    if (!user?.pubkey) {
      throw new Error('Not authenticated')
    }

    // CRITICAL: Never publish empty contact list!
    if (!contacts || contacts.size === 0) {
      throw new Error(
        'Cannot publish empty contact list! This would nuke your follows. ' +
        'You must have at least one follow before publishing.'
      )
    }

    const ndk = getNDK()
    if (!ndk.signer) {
      throw new Error('No signer available')
    }

    const event = new (await import('@nostr-dev-kit/ndk')).NDKEvent(ndk, {
      kind: 3,
      content: '',
      tags: Array.from(contacts).map(pubkey => ['p', pubkey]),
    })

    await event.sign(ndk.signer)
    await event.publish()

    logger.info('✓ Contacts list published successfully')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to publish contacts:', errorMsg)
    throw new Error(`Failed to publish contacts: ${errorMsg}`)
  }
}

/**
 * Follow a user
 */
export async function followUser(pubkey: string): Promise<void> {
  try {
    if (!pubkey || pubkey.length !== 64) {
      throw new Error('Invalid pubkey')
    }

    // CRITICAL: Ensure following list is loaded from relays if empty
    let currentFollowing = get(following)
    
    if (currentFollowing.size === 0) {
      logger.info('Following list empty, fetching from relays...')
      currentFollowing = await getFollowingList()
      following.set(currentFollowing)
      logger.info(`✓ Loaded ${currentFollowing.size} existing follows from relays`)
    }

    if (currentFollowing.has(pubkey)) {
      logger.info('Already following this user')
      return
    }

    // CRITICAL: Validate before publishing - prevent empty list publish
    if (currentFollowing.size === 0) {
      throw new Error(
        'Cannot follow: your contacts list could not be loaded. ' +
        'Please try again or check your relay connections.'
      )
    }

    // Create new set with the new follow
    const newFollowing = new Set<string>(currentFollowing)
    newFollowing.add(pubkey)

    // Publish the updated list
    await publishContactsList(newFollowing)

    // Update store
    following.set(newFollowing)

    logger.info(`✓ Now following ${pubkey.slice(0, 8)}... (total: ${newFollowing.size})`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to follow user:', errorMsg)
    throw new Error(`Failed to follow user: ${errorMsg}`)
  }
}

/**
 * Unfollow a user
 */
export async function unfollowUser(pubkey: string): Promise<void> {
  try {
    if (!pubkey || pubkey.length !== 64) {
      throw new Error('Invalid pubkey')
    }

    // CRITICAL: Ensure following list is loaded from relays if empty
    let currentFollowing = get(following)
    
    if (currentFollowing.size === 0) {
      logger.info('Following list empty, fetching from relays...')
      currentFollowing = await getFollowingList()
      following.set(currentFollowing)
      logger.info(`✓ Loaded ${currentFollowing.size} existing follows from relays`)
    }

    if (!currentFollowing.has(pubkey)) {
      logger.info('Not following this user')
      return
    }

    // Create new set without the user
    const newFollowing = new Set<string>(currentFollowing)
    newFollowing.delete(pubkey)

    // CRITICAL: Check if list would be empty
    if (newFollowing.size === 0) {
      throw new Error(
        'Cannot unfollow - this would result in an empty contacts list. ' +
        'You must keep at least one follow.'
      )
    }

    // Publish the updated list
    await publishContactsList(newFollowing)

    // Update store
    following.set(newFollowing)

    logger.info(`✓ Unfollowed ${pubkey.slice(0, 8)}... (total: ${newFollowing.size})`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Failed to unfollow user:', errorMsg)
    throw new Error(`Failed to unfollow user: ${errorMsg}`)
  }
}

/**
 * Check if following a user
 */
export function isFollowing(pubkey: string): boolean {
  const currentFollowing = get(following)
  return currentFollowing.has(pubkey)
}

/**
 * Get follow count
 */
export function getFollowCount(): number {
  const currentFollowing = get(following)
  return currentFollowing.size
}

