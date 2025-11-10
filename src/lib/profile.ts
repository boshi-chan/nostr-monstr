import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import { metadataCache } from '$stores/feed'
import { getUserMetadata } from '$lib/metadata'
import type { UserMetadata } from '$types/user'
import { get } from 'svelte/store'

async function fetchExistingMetadata(): Promise<UserMetadata> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  // Try 1: Check the dedicated metadata cache (has proper TTL management)
  let metadata = getUserMetadata(user.pubkey)
  if (metadata && Object.keys(metadata).length > 0) {
    console.log('✓ Using cached metadata from metadata service:', Object.keys(metadata))
    return metadata
  }

  // Try 2: Check metadataCache store
  const cached = get(metadataCache).get(user.pubkey)
  if (cached && Object.keys(cached).length > 0) {
    console.log('✓ Using store cache for profile update:', Object.keys(cached))
    return cached
  }

  // Try 3: Fetch directly from NDK with timeout (CRITICAL for wallet sync - prevents metadata wipe!)
  console.log('📡 Metadata cache empty, fetching from relays with 5s timeout...')
  const ndk = getNDK()
  try {
    // Use Promise.race with timeout to ensure we don't wait forever
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Metadata fetch timeout after 5 seconds')), 5000)
    )

    const fetchPromise = (async () => {
      const events = await ndk.fetchEvents({
        kinds: [0],
        authors: [user.pubkey],
        limit: 1
      })
      return events
    })()

    const events = await Promise.race([fetchPromise, timeoutPromise]) as Set<any>

    if (events.size > 0) {
      const event = Array.from(events)[0]
      if (event.content) {
        const parsed = JSON.parse(event.content) as UserMetadata
        if (Object.keys(parsed).length > 0) {
          console.log('✓ Fetched metadata from relay:', Object.keys(parsed))
          // Update both caches
          metadataCache.update(cache => {
            const next = new Map(cache)
            next.set(user.pubkey, parsed)
            return next
          })
          return parsed
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Failed to fetch metadata from relay:', err instanceof Error ? err.message : err)
  }

  // Try 4: User profile as fallback
  try {
    if (user.profile && Object.keys(user.profile).length > 0) {
      console.log('✓ Using NDK user profile as fallback:', Object.keys(user.profile))
      return user.profile as UserMetadata
    }
  } catch (err) {
    console.warn('Failed to access user profile:', err)
  }

  // CRITICAL: NEVER return empty object - this would wipe the profile!
  console.error('❌ CRITICAL: No existing metadata found!')
  console.error('❌ This would wipe your entire profile (name, bio, avatar, etc.)')
  console.error('❌ Aborting profile update to prevent data loss')
  throw new Error(
    'CRITICAL: Cannot update profile - no existing metadata found. ' +
    'This would wipe your profile. Please refresh the page and try again.'
  )
}

export async function setEmberAddressMetadata(address: string | null): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const ndk = getNDK()
  if (!ndk.signer) {
    throw new Error('No signer available')
  }

  console.log('📝 Fetching existing metadata before updating...')
  const existing = await fetchExistingMetadata()

  console.log('📊 Current metadata fields:', Object.keys(existing))
  console.log('📊 Current metadata:', existing)

  // CRITICAL: Validate we actually have metadata
  if (Object.keys(existing).length === 0) {
    throw new Error('CRITICAL: fetchExistingMetadata returned empty object. This should never happen.')
  }

  // CRITICAL: Ensure we have at least one important field to preserve
  const hasName = !!existing.name
  const hasAbout = !!existing.about
  const hasPicture = !!existing.picture
  const hasNip05 = !!existing.nip05
  
  console.log('📋 Profile preservation check:', {
    hasName,
    hasAbout,
    hasPicture,
    hasNip05,
    totalFields: Object.keys(existing).length
  })

  // Modify metadata
  if (address) {
    existing.monero_address = address
    console.log('✓ Added monero_address to metadata')
  } else {
    delete existing.monero_address
    console.log('✓ Removed monero_address from metadata')
  }

  // FINAL SAFETY CHECK: Ensure we're not publishing empty or incomplete metadata
  const finalKeys = Object.keys(existing)
  const finalHasName = !!existing.name
  const finalHasAbout = !!existing.about
  const finalHasPicture = !!existing.picture
  const finalHasMonero = !!existing.monero_address

  console.log('📋 Final metadata to publish:', {
    keys: finalKeys,
    hasName: finalHasName,
    hasAbout: finalHasAbout,
    hasPicture: finalHasPicture,
    hasMonero: finalHasMonero,
    totalFields: finalKeys.length
  })

  // CRITICAL: Abort if we would publish incomplete profile
  if (finalKeys.length === 1 && finalHasMonero && !finalHasName && !finalHasAbout && !finalHasPicture) {
    throw new Error(
      'CRITICAL: Refusing to publish metadata with ONLY monero_address. ' +
      'This would wipe your profile (name, bio, avatar). Aborting.'
    )
  }

  if (finalKeys.length === 0) {
    throw new Error('CRITICAL: Refusing to publish empty metadata. This would wipe your profile.')
  }

  console.log('✅ Safety checks passed. Publishing metadata update...')

  const event = new NDKEvent(ndk)
  event.kind = 0
  event.content = JSON.stringify(existing)

  console.log('📤 Publishing kind 0 event:', event.content)

  await event.sign()
  await event.publish()

  console.log('✅ Metadata published successfully')

  metadataCache.update(cache => {
    const next = new Map(cache)
    next.set(user.pubkey, existing)
    return next
  })
}
