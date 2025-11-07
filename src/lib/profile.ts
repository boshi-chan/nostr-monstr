import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import { metadataCache } from '$stores/feed'
import type { UserMetadata } from '$types/user'
import { get } from 'svelte/store'

async function fetchExistingMetadata(): Promise<UserMetadata> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  // Try 1: Check metadataCache first (fastest, most reliable)
  const cached = get(metadataCache).get(user.pubkey)
  if (cached && Object.keys(cached).length > 0) {
    console.log('✓ Using cached metadata for profile update')
    return cached
  }

  // Try 2: Fetch from NDK relay
  try {
    const profileEvent = await user.fetchProfile()
    const content =
      (profileEvent && typeof profileEvent.content === 'string' && profileEvent.content) ||
      (typeof user.profile?.content === 'string' ? user.profile.content : undefined)
    if (content) {
      const parsed = JSON.parse(content) as UserMetadata
      if (Object.keys(parsed).length > 0) {
        console.log('✓ Fetched metadata from relay for profile update')
        return parsed
      }
    }
  } catch (err) {
    console.warn('Failed to fetch profile from relay:', err)
  }

  // Try 3: Check cache again as final fallback
  const cacheFallback = get(metadataCache).get(user.pubkey)
  if (cacheFallback) {
    console.log('✓ Using cache fallback for profile update')
    return cacheFallback
  }

  // CRITICAL: Log warning if returning empty
  console.warn('⚠️ No existing metadata found - will publish with only new fields')
  return {}
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

  const existing = await fetchExistingMetadata()
  
  // CRITICAL: Validate metadata before modifying
  const hadMetadata = Object.keys(existing).length > 0
  const hasImportantFields = !!(existing.name || existing.about || existing.picture)

  if (address) {
    existing.monero_address = address
  } else {
    delete existing.monero_address
  }

  // CRITICAL: Warn if we're about to publish incomplete metadata
  if (hadMetadata && !hasImportantFields && address) {
    console.warn('⚠️ Publishing metadata with only XMR address - profile may appear incomplete')
  }

  const event = new NDKEvent(ndk)
  event.kind = 0
  event.content = JSON.stringify(existing)
  await event.sign()
  await event.publish()

  metadataCache.update(cache => {
    const next = new Map(cache)
    next.set(user.pubkey, existing)
    return next
  })
}
