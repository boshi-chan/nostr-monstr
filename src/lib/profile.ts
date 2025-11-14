import { NDKEvent } from '@nostr-dev-kit/ndk'
import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import { metadataCache } from '$stores/feed'
import { getUserMetadata } from '$lib/metadata'
import type { UserMetadata } from '$types/user'
import { get } from 'svelte/store'

export interface EditableProfileFields {
  name?: string
  display_name?: string
  about?: string
  picture?: string
  banner?: string
  website?: string
  nip05?: string
  lud16?: string
  lud06?: string
  monero_address?: string
}

const IDENTITY_FIELDS: (keyof EditableProfileFields)[] = [
  'name',
  'display_name',
  'about',
  'picture',
  'banner',
  'website',
  'nip05'
]

async function fetchExistingMetadata(): Promise<UserMetadata> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const cached = getUserMetadata(user.pubkey)
  if (cached && Object.keys(cached).length > 0) {
    return cached
  }

  const storeCache = get(metadataCache).get(user.pubkey)
  if (storeCache && Object.keys(storeCache).length > 0) {
    return storeCache
  }

  const ndk = getNDK()
  try {
    const timeout = new Promise<never>((_, reject) =>
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

    const events = await Promise.race([fetchPromise, timeout]) as Set<any>
    if (events.size > 0) {
      const event = Array.from(events)[0]
      if (event.content) {
        const parsed = JSON.parse(event.content) as UserMetadata
        if (Object.keys(parsed).length > 0) {
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
    logger.warn('Failed to fetch metadata from relay:', err instanceof Error ? err.message : err)
  }

  try {
    if (user.profile && Object.keys(user.profile).length > 0) {
      return user.profile as UserMetadata
    }
  } catch (err) {
    logger.warn('Failed to access NDK user profile cache:', err)
  }

  throw new Error(
    'Cannot update profile - no existing metadata found. Refresh and try again.'
  )
}

function applyProfileUpdates(existing: UserMetadata, updates: EditableProfileFields): UserMetadata {
  const next: UserMetadata = { ...existing }
  const entries = Object.entries(updates) as [keyof EditableProfileFields, string | undefined][]

  for (const [field, value] of entries) {
    if (typeof value === 'undefined') continue
    const trimmed = typeof value === 'string' ? value.trim() : value

    if (typeof trimmed === 'string' && trimmed.length === 0) {
      delete next[field]
      continue
    }

    next[field] = field === 'about' && typeof value === 'string' ? value.trim() : trimmed
  }

  return next
}

function validateMetadataBeforePublish(metadata: UserMetadata): void {
  const keys = Object.keys(metadata)
  if (keys.length === 0) {
    throw new Error('Refusing to publish empty metadata. This would wipe your profile.')
  }

  const hasIdentityField = IDENTITY_FIELDS.some(field => {
    const value = metadata[field]
    return typeof value === 'string' && value.trim().length > 0
  })

  if (!hasIdentityField) {
    throw new Error(
      'Profile updates must retain at least one identity field (name, display name, bio, avatar, banner, website, or NIP-05).'
    )
  }
}

function metadataChanged(previous: UserMetadata, next: UserMetadata): boolean {
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(next)])
  for (const key of allKeys) {
    if (previous[key] !== next[key]) {
      return true
    }
  }
  return false
}

async function publishMetadata(metadata: UserMetadata): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) {
    throw new Error('Not authenticated')
  }

  const ndk = getNDK()
  if (!ndk.signer) {
    throw new Error('No signer available')
  }

  const event = new NDKEvent(ndk)
  event.kind = 0
  event.content = JSON.stringify(metadata)

  await event.sign()
  await event.publish()

  metadataCache.update(cache => {
    const next = new Map(cache)
    next.set(user.pubkey, metadata)
    return next
  })
}

export async function setEmberAddressMetadata(address: string | null): Promise<void> {
  const existing = await fetchExistingMetadata()
  const updated: UserMetadata = { ...existing }
  const trimmedAddress = address?.trim()

  if (trimmedAddress) {
    updated.monero_address = trimmedAddress
  } else {
    delete updated.monero_address
  }

  validateMetadataBeforePublish(updated)

  if (!metadataChanged(existing, updated)) {
    return
  }

  await publishMetadata(updated)
}

export async function updateProfileMetadata(updates: EditableProfileFields): Promise<void> {
  const existing = await fetchExistingMetadata()
  const next = applyProfileUpdates(existing, updates)

  validateMetadataBeforePublish(next)

  if (!metadataChanged(existing, next)) {
    throw new Error('No profile changes to save')
  }

  await publishMetadata(next)
}

