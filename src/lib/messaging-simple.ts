import { get } from 'svelte/store'
import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import { NDKEvent, type NDKFilter, type NDKSubscription } from '@nostr-dev-kit/ndk'
import {
  conversations,
  conversationMetadata,
  conversationMessages,
  activeConversation,
  messagesLoading,
  messagesError,
  unreadCounts,
  setDmPermissionError,
} from '$stores/messages'
import { fetchUserMetadata } from '$lib/metadata'
import type { DirectMessage } from '$types/dm'
import type { NostrEvent } from '$types/nostr'
import {
  encryptForPubkey,
  preferredSchemeFor,
  rememberScheme,
  type DmEncryptionScheme,
} from '$lib/dm-crypto'
import { normalizeEvent } from '$lib/event-validation'
import { queueDecrypt, getCachedDecryptedMessage, cacheDecryptedMessage, nip46Ready, resetNip46Ready } from '$lib/signer-queue'
import { publishToConfiguredRelays } from './relay-publisher'
import { logDebug } from '$stores/debug'

const NIP04_KIND = 4
const NIP44_KIND = 44
const DM_KINDS = [NIP04_KIND, NIP44_KIND]
const FAILED_PLACEHOLDER = '[Failed to decrypt]'
const MAX_TRACKED_DM_EVENTS = 2000
const DM_DEBUG = true

const dmSubscriptions = new Set<NDKSubscription>()
const processedDmEvents = new Set<string>()
let subscriptionOwner: string | null = null
let processedOwner: string | null = null
let conversationsLoadedFor: string | null = null  // Guard against multiple loads
const RELAY_TIMEOUT_MS = 5000
const INITIAL_DECRYPT_LIMIT = 50   // Can be higher now with proper queuing and cache

type DecryptResult = { partner: string; message: DirectMessage }

async function fetchEventsWithTimeout(
  ndk: ReturnType<typeof getNDK>,
  filter: NDKFilter,
  timeoutMs = RELAY_TIMEOUT_MS
): Promise<Set<NDKEvent>> {
  const fetchPromise = ndk.fetchEvents(filter, { closeOnEose: true })
  const timeoutPromise = new Promise<Set<NDKEvent>>(resolve => {
    setTimeout(() => resolve(new Set()), timeoutMs)
  })
  return await Promise.race([fetchPromise, timeoutPromise])
}

async function decryptEventsWithLimit(events: NostrEvent[], mePubkey: string): Promise<DecryptResult[]> {
  if (events.length === 0) {
    return []
  }

  const results: DecryptResult[] = []

  for (const event of events) {
    try {
      markEventProcessed(event.id)
      const partner = getPartner(event, mePubkey)
      if (!partner) continue

      const message = await decryptEvent(event, mePubkey, partner)
      results.push({ partner, message })
    } catch (err) {
      console.warn('[DM] Decrypt failed for event', event.id?.slice(0, 8), ':', err)
    }
  }

  return results
}

function applyDecryptedResults(
  convMap: Map<string, DirectMessage[]>,
  results: DecryptResult[]
): void {
  if (results.length === 0) return

  const touched = new Set<string>()
  for (const { partner, message } of results) {
    if (!convMap.has(partner)) convMap.set(partner, [])
    convMap.get(partner)!.push(message)
    touched.add(partner)
  }

  for (const partner of touched) {
    const list = convMap.get(partner)
    if (!list) continue
    list.sort((a, b) => a.createdAt - b.createdAt)
    setConversationEntry(partner, list)
    void fetchUserMetadata(partner)
  }

  const active = get(activeConversation)
  if (active) {
    const current = convMap.get(active)
    if (current) {
      conversationMessages.set([...current])
    }
  }

  messagesLoading.set(false)
}

async function processEventChunks(
  events: NostrEvent[],
  convMap: Map<string, DirectMessage[]>,
  mePubkey: string
): Promise<void> {
  if (events.length === 0) return

  const BATCH_SIZE = 100
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE)
    const results = await decryptEventsWithLimit(batch, mePubkey)
    applyDecryptedResults(convMap, results)
  }
}

export async function warmupMessagingPermissions(): Promise<void> {
  const user = getCurrentNDKUser()
  const ndk = getNDK()
  if (!user?.pubkey || !ndk.signer) return

  try {
    const me = ndk.getUser({ pubkey: user.pubkey })
    const probe = await ndk.signer.encrypt(me, '__probe__', 'nip04')
    await ndk.signer.decrypt(me, probe, 'nip04')
    setDmPermissionError(null)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Approve DM permissions in your signer.'
    setDmPermissionError(msg)
  }
}

export async function loadConversations(): Promise<void> {
  console.log('[DM] loadConversations called')
  const user = getCurrentNDKUser()
  if (!user?.pubkey) {
    console.warn('[DM] loadConversations: no user pubkey, returning early')
    return
  }

  // Guard against multiple loads for the same user
  if (conversationsLoadedFor === user.pubkey) {
    console.log('[DM] loadConversations: already loaded for this user, skipping')
    return
  }
  conversationsLoadedFor = user.pubkey
  console.log('[DM] loadConversations: user pubkey found:', user.pubkey)

  // Wait for NIP-46 signer to be ready before any decrypt operations
  await nip46Ready()

  if (processedOwner !== user.pubkey) {
    processedDmEvents.clear()
    processedOwner = user.pubkey
  }

  stopDmSubscriptions()

  messagesLoading.set(true)
  messagesError.set(null)

  try {
    const ndk = getNDK()
    if (!ndk.signer) throw new Error('No signer available')
    console.log('[DM] signer available, fetching events...')

    // Reduced from 500 to 200 per direction for faster initial load
    const receivedFilter: NDKFilter = { kinds: DM_KINDS, '#p': [user.pubkey], limit: 200 }
    const sentFilter: NDKFilter = { kinds: DM_KINDS, authors: [user.pubkey], limit: 200 }

    // Use timeouts so a single slow relay doesn't block the entire DM view
    console.log('[DM] fetching received and sent DMs...')
    const [received, sent] = await Promise.all([
      fetchEventsWithTimeout(ndk, receivedFilter),
      fetchEventsWithTimeout(ndk, sentFilter),
    ])
    console.log('[DM] fetched', received.size, 'received,', sent.size, 'sent events')

    const convMap = new Map<string, DirectMessage[]>()

    const allEvents: NostrEvent[] = []
    for (const event of [...received, ...sent]) {
      const raw = normalizeEvent(event as NDKEvent | NostrEvent)
      if (raw) allEvents.push(raw)
    }

    const sorted = allEvents.sort(
      (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)
    )

    const initialStart = Math.max(0, sorted.length - INITIAL_DECRYPT_LIMIT)
    const initialEvents = sorted.slice(initialStart)
    const remainingEvents = sorted.slice(0, initialStart)

    console.log('[DM] decrypting', initialEvents.length, 'initial events...')
    await processEventChunks(initialEvents, convMap, user.pubkey)
    console.log('[DM] decrypt complete, conversations:', convMap.size)

    if (remainingEvents.length > 0) {
      void processEventChunks(remainingEvents, convMap, user.pubkey).catch(err => {
        logger.warn('[DM] Background decrypt failed:', err)
      })
    }

    void subscribeToDmEvents(user.pubkey)
  } catch (err) {
    logger.error('[DM] Failed to load conversations:', err)
    messagesError.set(err instanceof Error ? err.message : 'Failed to load conversations')
  } finally {
    messagesLoading.set(false)
  }
}

export async function loadConversation(pubkey: string): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) return

  messagesLoading.set(true)
  messagesError.set(null)

  try {
    const ndk = getNDK()
    if (!ndk.signer) throw new Error('No signer available')

    const filters: NDKFilter[] = [
      { kinds: DM_KINDS, authors: [user.pubkey], '#p': [pubkey], limit: 200 },
      { kinds: DM_KINDS, authors: [pubkey], '#p': [user.pubkey], limit: 200 },
    ]

    // Use timeouts per relay filter to avoid hanging when one relay never responds
    const results = await Promise.all(filters.map(f => fetchEventsWithTimeout(ndk, f)))
    const map = new Map<string, NostrEvent>()
    for (const set of results) {
      for (const event of set) {
        const raw = normalizeEvent(event as NDKEvent | NostrEvent)
        if (!raw) continue
        map.set(raw.id, raw)
      }
    }

    const events = Array.from(map.values()).sort(
      (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)
    )

    const decrypted = await decryptEventsWithLimit(events, user.pubkey)
    const messages = decrypted
      .filter(result => result.partner === pubkey)
      .map(result => result.message)

    setConversationEntry(pubkey, messages)
    conversationMessages.set(messages)
    unreadCounts.update(map => {
      const next = new Map(map)
      next.set(pubkey, 0)
      return next
    })
  } catch (err) {
    logger.error('[DM] Failed to load conversation:', err)
    messagesError.set(err instanceof Error ? err.message : 'Failed to load conversation')
  } finally {
    messagesLoading.set(false)
  }
}

export async function sendDirectMessage(recipientPubkey: string, content: string): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not logged in')

  const ndk = getNDK()
  const signer = ndk.signer
  if (!signer) throw new Error('No signer available')

  const trimmed = content.trim()
  if (!trimmed) return

  try {
    let scheme: DmEncryptionScheme = preferredSchemeFor(recipientPubkey)
    let ciphertext: string
    let kind: number

    try {
      ciphertext = await encryptForPubkey(recipientPubkey, trimmed, scheme)
      kind = scheme === 'nip44' ? NIP44_KIND : NIP04_KIND
    } catch (err) {
      if (scheme === 'nip44') {
        logger.warn('[DM] NIP-44 send failed, falling back to NIP-04:', err)
        scheme = 'nip04'
        ciphertext = await encryptForPubkey(recipientPubkey, trimmed, scheme)
        kind = NIP04_KIND
      } else {
        throw err
      }
    }

    const event = new NDKEvent(ndk)
    event.kind = kind
    event.content = ciphertext
    event.tags = [['p', recipientPubkey]]
    await event.sign(signer)
    if (event.id) {
      markEventProcessed(event.id)
    }
    const published = await publishToConfiguredRelays(event)
    if (DM_DEBUG) {
      logDebug('[DM] sent', [{ to: recipientPubkey, kind, relays: published, id: event.id }])
    }

    rememberScheme(recipientPubkey, scheme)

    const message: DirectMessage = {
      id: event.id!,
      senderPubkey: user.pubkey,
      recipientPubkey,
      content: trimmed,
      createdAt: event.created_at || Math.floor(Date.now() / 1000),
      isEncrypted: true,
      encryptionType: scheme === 'nip44' ? 'nip44' : 'nip4',
    }

    appendMessageToConversation(recipientPubkey, message)

    if (get(activeConversation) === recipientPubkey) {
      const current = get(conversationMessages)
      conversationMessages.set([...current, message])
    }

    // Kick subscriptions and opportunistic fetch to surface the DM immediately
    subscribeToDmEvents(user.pubkey)
    try {
      const since = (event.created_at ?? Math.floor(Date.now() / 1000)) - 120
      const filters: NDKFilter[] = [
        { kinds: DM_KINDS, '#p': [user.pubkey], authors: [recipientPubkey], since, limit: 20 },
        { kinds: DM_KINDS, '#p': [recipientPubkey], authors: [user.pubkey], since, limit: 20 },
      ]
      const results = await Promise.all(filters.map(f => fetchEventsWithTimeout(ndk, f, 3000)))
      const mergedEvents: NostrEvent[] = []
      for (const set of results) {
        for (const ev of set) {
          const raw = normalizeEvent(ev)
          if (raw) mergedEvents.push(raw)
        }
      }
      const decrypted = await decryptEventsWithLimit(mergedEvents, user.pubkey)
      const convMap = new Map(get(conversations))
      applyDecryptedResults(convMap, decrypted)
    } catch (err) {
      logger.warn('[DM] Post-send fetch failed (non-fatal):', err)
      if (DM_DEBUG) {
        logDebug('[DM] post-send fetch failed', [String(err)])
      }
    }
  } catch (err) {
    logger.error('[DM] Failed to send message:', err)
    if (DM_DEBUG) {
      logDebug('[DM] send failed', [String(err)])
    }
    throw err
  }
}

export async function startConversation(pubkey: string): Promise<void> {
  await fetchUserMetadata(pubkey)
  activeConversation.set(pubkey)
  conversationMessages.set([])

  const convos = new Map(get(conversations))
  if (!convos.has(pubkey)) {
    convos.set(pubkey, [])
    conversations.set(convos)
  }

  conversationMetadata.update(existing => {
    const next = new Map(existing)
    if (!next.has(pubkey)) {
      next.set(pubkey, {
        id: pubkey,
        type: 'direct',
        participantPubkey: pubkey,
        lastMessageAt: 0,
        lastUpdated: 0,
        unreadCount: 0,
      })
    }
    return next
  })
}

function getPartner(event: NostrEvent, me: string): string | null {
  if (event.pubkey === me) {
    const tag = event.tags.find(t => t[0] === 'p')
    return tag?.[1] ?? null
  }
  return event.pubkey
}

function markEventProcessed(id?: string): void {
  if (!id) return
  processedDmEvents.add(id)
  if (processedDmEvents.size > MAX_TRACKED_DM_EVENTS) {
    const first = processedDmEvents.keys().next().value
    if (first) {
      processedDmEvents.delete(first)
    }
  }
}

function hasProcessedEvent(id?: string): boolean {
  if (!id) return false
  return processedDmEvents.has(id)
}

async function decryptEvent(
  event: NostrEvent,
  mePubkey: string,
  partnerPubkey: string
): Promise<DirectMessage> {
  const scheme: DmEncryptionScheme = event.kind === NIP44_KIND ? 'nip44' : 'nip04'
  const sender = event.pubkey
  const recipient = sender === mePubkey ? partnerPubkey : mePubkey
  const counterpart = sender === mePubkey ? partnerPubkey : sender

  // Check cache first
  console.log('[DM] checking cache for event:', event.id?.slice(0, 8))
  const cached = await getCachedDecryptedMessage(event.id)
  if (cached) {
    console.log('[DM] cache hit for event:', event.id?.slice(0, 8))
    return {
      id: event.id,
      senderPubkey: sender,
      recipientPubkey: recipient,
      content: cached,
      createdAt: event.created_at || Math.floor(Date.now() / 1000),
      isEncrypted: true,
      encryptionType: scheme === 'nip44' ? 'nip44' : 'nip4',
    }
  }

  try {
    // Use queue for decryption (prevents rate limiting)
    const ndk = getNDK()
    const counterpartUser = ndk.getUser({ pubkey: counterpart })
    console.log('[DM] decryptEvent calling queueDecrypt for event:', event.id?.slice(0, 8))
    let plaintext = await queueDecrypt(counterpartUser, event.content, scheme)
    console.log('[DM] decryptEvent got result:', plaintext ? 'success' : 'null')

    if (!plaintext) {
      throw new Error('Decrypt returned null')
    }

    plaintext = plaintext.replace(/^\[\/\/\]: # \(nip\d+\)\s*/gm, '').trim()
    rememberScheme(partnerPubkey, scheme)

    // Cache the decrypted message
    await cacheDecryptedMessage(event.id, plaintext)

    return {
      id: event.id,
      senderPubkey: sender,
      recipientPubkey: recipient,
      content: plaintext,
      createdAt: event.created_at || Math.floor(Date.now() / 1000),
      isEncrypted: true,
      encryptionType: scheme === 'nip44' ? 'nip44' : 'nip4',
    }
  } catch (err) {
    if (scheme === 'nip44') {
      logger.warn('[DM] Failed to decrypt NIP-44 message, marking partner as legacy:', err)
      rememberScheme(partnerPubkey, 'nip04')
    } else {
      logger.warn('[DM] Failed to decrypt NIP-04 message:', err)
    }
    return {
      id: event.id,
      senderPubkey: sender,
      recipientPubkey: recipient,
      content: FAILED_PLACEHOLDER,
      createdAt: event.created_at || Math.floor(Date.now() / 1000),
      isEncrypted: true,
      encryptionType: scheme === 'nip44' ? 'nip44' : 'nip4',
      failed: true,
    }
  }
}

function setConversationEntry(pubkey: string, messages: DirectMessage[]): void {
  const convos = new Map(get(conversations))
  convos.set(pubkey, messages)
  conversations.set(convos)
  updateConversationMetadata(pubkey, messages)
}

function appendMessageToConversation(pubkey: string, message: DirectMessage): void {
  const convos = new Map(get(conversations))
  const existing = [...(convos.get(pubkey) || [])]
  existing.push(message)
  convos.set(pubkey, existing)
  conversations.set(convos)
  updateConversationMetadata(pubkey, existing)
}

function updateConversationMetadata(pubkey: string, messages: DirectMessage[]): void {
  const last = messages.at(-1)
  const unreadMap = get(unreadCounts)
  conversationMetadata.update(meta => {
    const next = new Map(meta)
    const base = next.get(pubkey) ?? {
      id: pubkey,
      type: 'direct' as const,
      participantPubkey: pubkey,
      unreadCount: unreadMap.get(pubkey) ?? 0,
      lastMessageAt: 0,
      lastUpdated: 0,
    }

    const entry = {
      ...base,
      participantPubkey: pubkey,
      lastMessage: last ?? base.lastMessage,
      lastMessagePreview: last?.content ?? base.lastMessagePreview,
      lastMessageAt: last?.createdAt ?? base.lastMessageAt ?? 0,
      lastUpdated: last?.createdAt ?? base.lastUpdated ?? 0,
      unreadCount: unreadMap.get(pubkey) ?? base.unreadCount ?? 0,
    }

    next.set(pubkey, entry)
    return next
  })
}

function subscribeToDmEvents(mePubkey: string): void {
  const ndk = getNDK()
  if (!ndk.signer) return

  if (subscriptionOwner === mePubkey && dmSubscriptions.size > 0) {
    return
  }

  stopDmSubscriptions()
  subscriptionOwner = mePubkey

  const since = Math.floor(Date.now() / 1000) - 60
  const filters: NDKFilter[] = [
    { kinds: DM_KINDS, '#p': [mePubkey], since, limit: 0 },
    { kinds: DM_KINDS, authors: [mePubkey], since, limit: 0 },
  ]

  for (const filter of filters) {
    const sub = ndk.subscribe(filter, { closeOnEose: false })
    sub.on('event', event => {
      void handleLiveDmEvent(event as NDKEvent, mePubkey)
    })
    dmSubscriptions.add(sub)
  }
}

async function handleLiveDmEvent(event: NDKEvent, mePubkey: string): Promise<void> {
  const raw = normalizeEvent(event)
  if (!raw || hasProcessedEvent(raw.id)) {
    return
  }

  const partner = getPartner(raw, mePubkey)
  if (!partner) return

  try {
    const message = await decryptEvent(raw, mePubkey, partner)
    markEventProcessed(raw.id)
    appendMessageToConversation(partner, message)
    void fetchUserMetadata(partner)
    if (DM_DEBUG) {
      logDebug('[DM] live', [{ from: raw.pubkey, to: mePubkey, id: raw.id?.slice(0, 8), kind: raw.kind }])
    }

    if (get(activeConversation) === partner) {
      conversationMessages.update(existing => [...existing, message])
      unreadCounts.update(map => {
        const next = new Map(map)
        next.set(partner, 0)
        return next
      })
    } else {
      unreadCounts.update(map => {
        const next = new Map(map)
        next.set(partner, (next.get(partner) ?? 0) + 1)
        return next
      })
    }
  } catch (err) {
    logger.error('[DM] Failed to handle live DM event:', err)
  }
}

export function stopDmSubscriptions(): void {
  for (const sub of dmSubscriptions) {
    try {
      sub.stop()
    } catch (err) {
      logger.warn('Failed to stop DM subscription:', err)
    }
  }
  dmSubscriptions.clear()
  subscriptionOwner = null
}

export function resetMessagingState(): void {
  stopDmSubscriptions()
  processedDmEvents.clear()
  subscriptionOwner = null
  processedOwner = null
  conversationsLoadedFor = null
  resetNip46Ready()
}
