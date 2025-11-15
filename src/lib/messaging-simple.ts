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
  decryptFromPubkey,
  preferredSchemeFor,
  rememberScheme,
  type DmEncryptionScheme,
} from '$lib/dm-crypto'
import { normalizeEvent } from '$lib/event-validation'

const NIP04_KIND = 4
const NIP44_KIND = 44
const DM_KINDS = [NIP04_KIND, NIP44_KIND]
const FAILED_PLACEHOLDER = '[Failed to decrypt]'
const MAX_TRACKED_DM_EVENTS = 2000

const dmSubscriptions = new Set<NDKSubscription>()
const processedDmEvents = new Set<string>()
let subscriptionOwner: string | null = null
let processedOwner: string | null = null

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
  const user = getCurrentNDKUser()
  if (!user?.pubkey) return

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

    const receivedFilter: NDKFilter = { kinds: DM_KINDS, '#p': [user.pubkey], limit: 500 }
    const sentFilter: NDKFilter = { kinds: DM_KINDS, authors: [user.pubkey], limit: 500 }

    const [received, sent] = await Promise.all([
      ndk.fetchEvents(receivedFilter),
      ndk.fetchEvents(sentFilter),
    ])

    const map = new Map<string, NostrEvent>()
    for (const event of [...received, ...sent]) {
      const raw = normalizeEvent(event as NDKEvent | NostrEvent)
      if (!raw) continue
      map.set(raw.id, raw)
    }

    const sorted = Array.from(map.values()).sort(
      (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)
    )

    const convMap = new Map<string, DirectMessage[]>()
    for (const event of sorted) {
      markEventProcessed(event.id)
      const partner = getPartner(event, user.pubkey)
      if (!partner) continue
      const message = await decryptEvent(event, user.pubkey, partner)
      if (!convMap.has(partner)) convMap.set(partner, [])
      convMap.get(partner)!.push(message)
    }

    convMap.forEach((list, partner) => {
      list.sort((a, b) => a.createdAt - b.createdAt)
      setConversationEntry(partner, list)
      void fetchUserMetadata(partner)
    })

    const active = get(activeConversation)
    if (active) {
      conversationMessages.set([...(convMap.get(active) ?? [])])
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

    const results = await Promise.all(filters.map(f => ndk.fetchEvents(f)))
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

    const messages: DirectMessage[] = []
    for (const event of events) {
      markEventProcessed(event.id)
      messages.push(await decryptEvent(event, user.pubkey, pubkey))
    }

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
    await event.publish()

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
  } catch (err) {
    logger.error('[DM] Failed to send message:', err)
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

  try {
    let plaintext = await decryptFromPubkey(counterpart, event.content, scheme)
    plaintext = plaintext.replace(/^\[\/\/\]: # \(nip\d+\)\s*/gm, '').trim()
    rememberScheme(partnerPubkey, scheme)
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
}

