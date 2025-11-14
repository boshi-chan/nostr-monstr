import { getNDK } from '$lib/ndk'

export type DmEncryptionScheme = 'nip04' | 'nip44'

const PREF_KEY = 'monstr.dm-scheme.v1'
const schemePrefs = new Map<string, DmEncryptionScheme>()
let prefsLoaded = false

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

function loadPrefs(): void {
  if (!isBrowser() || prefsLoaded) return
  prefsLoaded = true
  try {
    const raw = window.localStorage.getItem(PREF_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    Object.entries(parsed).forEach(([pubkey, scheme]) => {
      if (scheme === 'nip04' || scheme === 'nip44') {
        schemePrefs.set(pubkey, scheme)
      }
    })
  } catch (err) {
    logger.warn('[DM] Failed to load encryption preferences:', err)
  }
}

function persistPrefs(): void {
  if (!isBrowser()) return
  const payload: Record<string, DmEncryptionScheme> = {}
  schemePrefs.forEach((scheme, pubkey) => {
    payload[pubkey] = scheme
  })
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify(payload))
  } catch (err) {
    logger.warn('[DM] Failed to persist encryption preferences:', err)
  }
}

export function rememberScheme(pubkey: string, scheme: DmEncryptionScheme): void {
  loadPrefs()
  if (!pubkey) return
  const current = schemePrefs.get(pubkey)
  if (current === scheme) return
  schemePrefs.set(pubkey, scheme)
  persistPrefs()
}

export function getStoredScheme(pubkey: string): DmEncryptionScheme | undefined {
  loadPrefs()
  return schemePrefs.get(pubkey)
}

export function hasLocalNip44Support(): boolean {
  if (!isBrowser()) return false
  if (
    typeof window.nostr?.nip44?.encrypt === 'function' &&
    typeof window.nostr?.nip44?.decrypt === 'function'
  ) {
    return true
  }
  try {
    const signer = getNDK().signer as any
    if (!signer) return false
    if (typeof signer.nip44?.encrypt === 'function' && typeof signer.nip44?.decrypt === 'function') {
      return true
    }
    if (typeof signer.encrypt === 'function') {
      // NDK signers expose generic encrypt/decrypt that accept scheme name
      return true
    }
  } catch {
    return false
  }
  return false
}

export function preferredSchemeFor(pubkey: string | null | undefined): DmEncryptionScheme {
  loadPrefs()
  if (!pubkey) {
    return hasLocalNip44Support() ? 'nip44' : 'nip04'
  }
  const stored = schemePrefs.get(pubkey)
  if (stored) {
    if (stored === 'nip44' && !hasLocalNip44Support()) {
      return 'nip04'
    }
    return stored
  }
  return hasLocalNip44Support() ? 'nip44' : 'nip04'
}

export async function encryptForPubkey(
  pubkey: string,
  content: string,
  scheme: DmEncryptionScheme
): Promise<string> {
  const ndk = getNDK()
  const signer = ndk.signer as any

  if (scheme === 'nip44') {
    if (signer?.nip44?.encrypt) {
      const counterpart = ndk.getUser({ pubkey })
      return signer.nip44.encrypt(counterpart, content)
    }
    if (typeof signer?.encrypt === 'function') {
      const counterpart = ndk.getUser({ pubkey })
      return signer.encrypt(counterpart, content, 'nip44')
    }
    if (isBrowser() && window.nostr?.nip44?.encrypt) {
      return window.nostr.nip44.encrypt(pubkey, content)
    }
    throw new Error('NIP-44 encryption is not supported by your signer yet.')
  }

  if (signer?.nip04?.encrypt) {
    const counterpart = ndk.getUser({ pubkey })
    return signer.nip04.encrypt(counterpart, content)
  }
  if (typeof signer?.encrypt === 'function') {
    const counterpart = ndk.getUser({ pubkey })
    return signer.encrypt(counterpart, content, 'nip04')
  }
  if (isBrowser() && window.nostr?.nip04?.encrypt) {
    return window.nostr.nip04.encrypt(pubkey, content)
  }
  throw new Error('Unable to encrypt direct message (no NIP-04 support).')
}

export async function decryptFromPubkey(
  pubkey: string,
  ciphertext: string,
  scheme: DmEncryptionScheme
): Promise<string> {
  const ndk = getNDK()
  const signer = ndk.signer as any

  if (scheme === 'nip44') {
    if (signer?.nip44?.decrypt) {
      const counterpart = ndk.getUser({ pubkey })
      return signer.nip44.decrypt(counterpart, ciphertext)
    }
    if (typeof signer?.decrypt === 'function') {
      const counterpart = ndk.getUser({ pubkey })
      return signer.decrypt(counterpart, ciphertext, 'nip44')
    }
    if (isBrowser() && window.nostr?.nip44?.decrypt) {
      return window.nostr.nip44.decrypt(pubkey, ciphertext)
    }
    throw new Error('NIP-44 decryption is not supported by your signer yet.')
  }

  if (signer?.nip04?.decrypt) {
    const counterpart = ndk.getUser({ pubkey })
    return signer.nip04.decrypt(counterpart, ciphertext)
  }
  if (typeof signer?.decrypt === 'function') {
    const counterpart = ndk.getUser({ pubkey })
    return signer.decrypt(counterpart, ciphertext, 'nip04')
  }
  if (isBrowser() && window.nostr?.nip04?.decrypt) {
    return window.nostr.nip04.decrypt(pubkey, ciphertext)
  }
  throw new Error('Unable to decrypt direct message (no NIP-04 support).')
}

