/**
 * Monstr Messaging (nos2x-friendly)
 * Supports:
 *  - NIP-04 (legacy)  kind: 4
 *  - NIP-17 giftwrap  kinds: 1059 (giftwrap), 13 (seal), 14 (rumor)
 * No NIP-44 (nos2x doesn't support it).
 * No group-chat code (kept scope minimal/stable).
 */

import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import {
  activeConversation,
  conversationMessages,
  conversationMetadata,
  giftwrapSupport,
  messagesLoading,
  messagesError,
  setDmPermissionError,
  dmCacheHydratedFor,
} from '$stores/messages'
import { metadataCache } from '$stores/feed'
import type { DirectMessage, Conversation } from '$types/dm'
import type { NostrEvent } from '$types/nostr'
import type { UserMetadata } from '$types/user'
import { get } from 'svelte/store'
import { NDKEvent, type NDKSubscription } from '@nostr-dev-kit/ndk'

// --------------------------------- CONSTANTS ---------------------------------



const DIRECT_MESSAGE_KIND = 4           // NIP-04 (legacy)
const SEAL_KIND = 13                    // NIP-17 middle
const RUMOR_KIND = 14                   // NIP-17 inner
const GIFTWRAP_KIND = 1059              // NIP-17 outer

// nos2x = legacy + giftwrap only
const DM_KINDS = [DIRECT_MESSAGE_KIND, GIFTWRAP_KIND, SEAL_KIND, RUMOR_KIND]



export const FAILED_DECRYPT_PLACEHOLDER = '[Failed to decrypt]'

// ---------------------------------- CACHING ----------------------------------

const messageCache = new Map<string, DirectMessage>()
const rawEventCache = new Map<string, NostrEvent>()

function cacheMessage(m: DirectMessage) {
  if (!m?.id) return
  messageCache.set(m.id, m)
}
function getCachedMessage(id: string) {
  return messageCache.get(id) ?? null
}

// -------- localStorage conversation snapshot (for fast boot; optional) -------

const DM_STORAGE_PREFIX = 'monstr.dm.'
const MAX_CACHED_MESSAGES = 200

type ConversationCacheRecord = { messages: DirectMessage[]; lastUpdated: number }
type ConversationCache = Record<string, ConversationCacheRecord>

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}
function cacheKey(userPk: string) {
  return `${DM_STORAGE_PREFIX}${userPk}`
}
function readConversationCache(userPk: string): ConversationCache {
  if (!isBrowser()) return {}
  try {
    const raw = window.localStorage.getItem(cacheKey(userPk))
    return raw ? (JSON.parse(raw) as ConversationCache) : {}
  } catch {
    return {}
  }
}
function writeConversationCache(userPk: string, data: ConversationCache) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(cacheKey(userPk), JSON.stringify(data))
  } catch {}
}
function appendMessageToCache(userPk: string, otherPk: string, m: DirectMessage) {
  if (!userPk || !otherPk) return
  const store = readConversationCache(userPk)
  const prev = store[otherPk]?.messages ?? []
  if (prev.some(x => x.id === m.id)) return
  const updated = [...prev, m].slice(-MAX_CACHED_MESSAGES)
  store[otherPk] = { messages: updated, lastUpdated: updated.at(-1)?.createdAt ?? m.createdAt }
  writeConversationCache(userPk, store)
}

export function hydrateConversationCache(userPubkey: string) {
  if (!userPubkey || !isBrowser()) return
  if (get(dmCacheHydratedFor) === userPubkey) return

  const snap = readConversationCache(userPubkey)
  const entries = Object.entries(snap)
  if (!entries.length) {
    dmCacheHydratedFor.set(userPubkey)
    return
  }

  const metaMap = new Map<string, Conversation>()
  const meta = get(metadataCache)
  const active = get(activeConversation)
  const missing: string[] = []

  for (const [other, rec] of entries) {
    if (!rec?.messages?.length) continue
    const last = rec.messages.at(-1)!
    const m = meta.get(other)
    if (!m) missing.push(other)

    metaMap.set(other, {
      id: other,
      type: 'direct',
      participantPubkey: other,
      participantName: m?.name || other.slice(0, 8),
      participantAvatar: m?.picture,
      lastMessage: last,
      lastMessagePreview: formatConversationPreview(last.content),
      unreadCount: 0,
      lastUpdated: rec.lastUpdated ?? last.createdAt,
    })

    if (active === other) conversationMessages.set(rec.messages)
  }

  if (metaMap.size) conversationMetadata.set(metaMap)
  dmCacheHydratedFor.set(userPubkey)
  if (missing.length) void ensureMetadataForPubkeys(missing)
}

// --------------------------- METADATA (display names) ------------------------

async function ensureMetadataForPubkeys(pubkeys: string[]) {
  const cache = get(metadataCache)
  const missing = pubkeys.filter(pk => pk && !cache.has(pk))
  if (!missing.length) return

  const ndk = getNDK()
  await Promise.allSettled(
    missing.map(async pubkey => {
      try {
        const user = ndk.getUser({ pubkey })
        const profile = await user.fetchProfile()
        const content =
          (profile && typeof profile.content === 'string' && profile.content) ||
          (typeof user.profile?.content === 'string' ? user.profile.content : '')
        if (!content) return
        const md = JSON.parse(content) as UserMetadata
        metadataCache.update(old => {
          const next = new Map(old)
          next.set(pubkey, md)
          return next
        })
      } catch {}
    })
  )
}

// ------------------------------ PERMISSIONS WARMUP --------------------------

export async function warmupMessagingPermissions() {
  // Minimal prime for nos2x: trigger a nip04 roundtrip & a sign
  const user = getCurrentNDKUser()
  const ndk = getNDK()
  if (!user?.pubkey || !ndk.signer) return
  try {
    const counterpart = ndk.getUser({ pubkey: user.pubkey })
    // encrypt+decrypt to self (grants perms in many signers)
    const probe = await ndk.signer.encrypt(counterpart, '__probe__')
    await ndk.signer.decrypt(counterpart, probe)

    const evt = new NDKEvent(ndk)
    evt.kind = DIRECT_MESSAGE_KIND
    evt.content = ''
    evt.tags = [['p', user.pubkey]]
    evt.created_at = Math.floor(Date.now() / 1000)
    await evt.sign(ndk.signer)
    setDmPermissionError(null)
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Please approve messaging permissions in your signer.'
    setDmPermissionError(m)
  }
}

// ------------------------------ DECRYPT HELPERS -----------------------------

function isEncryptedMessage(ev: NostrEvent) {
  return ev.kind === DIRECT_MESSAGE_KIND || ev.kind === GIFTWRAP_KIND
}

/**
 * Decrypts NIP-04 and NIP-17 giftwrap.
 * Returns: { content, realSenderPubkey } or null on failure.
 */
async function decryptMessageWithMetadataStrict(ev: NostrEvent): Promise<{ content: string; realSenderPubkey: string } | null> {
  const ndk = getNDK()
  const signer = ndk.signer
  const meUser = getCurrentNDKUser()
  if (!signer || !meUser?.pubkey) return null

  // NIP-04
  if (ev.kind === DIRECT_MESSAGE_KIND) {
    const pTag = ev.tags.find(t => t[0] === 'p')?.[1]
    const other = ev.pubkey === meUser.pubkey ? pTag : ev.pubkey
    if (!other) return null
    try {
      const counterpart = ndk.getUser({ pubkey: other })
      const plain = await signer.decrypt(counterpart, ev.content)
      return { content: plain, realSenderPubkey: ev.pubkey }
    } catch {
      return null
    }
  }

  // NIP-17 giftwrap
  if (ev.kind === GIFTWRAP_KIND) {
    const taggedRecipient = ev.tags.find(t => t[0] === 'p')?.[1]
    if (!taggedRecipient || taggedRecipient !== meUser.pubkey) return null

    try {
      // Outer: encrypted TO ME. Use MY pubkey as "counterparty".
      const meAsUser = ndk.getUser({ pubkey: meUser.pubkey })
      const sealJson = await signer.decrypt(meAsUser, ev.content)
      const seal = JSON.parse(sealJson) as NostrEvent

      // Expected NIP-17: SEAL kind 13 signed by real sender; content = enc(rumor)
      if (seal.kind === SEAL_KIND) {
        const realSender = ndk.getUser({ pubkey: seal.pubkey })
        const rumorJson = await signer.decrypt(realSender, seal.content)
        const rumor = JSON.parse(rumorJson) as Partial<NostrEvent>
        const content = typeof rumor.content === 'string' ? rumor.content : ''
        // mark support
        if (seal.pubkey !== meUser.pubkey) {
          giftwrapSupport.update(m => new Map(m).set(seal.pubkey, 'supported'))
        }
        return { content, realSenderPubkey: seal.pubkey }
      }

      // If not a proper seal, fallback: use whatever we have (NIP-59-ish)
      const fallbackContent =
        (typeof (seal as any)?.content === 'string' && (seal as any).content) || sealJson
      return { content: fallbackContent, realSenderPubkey: ev.pubkey } // sender looks ephemeral
    } catch {
      return null
    }
  }

  return null
}

// ------------------------------ PARSING EVENTS ------------------------------

function parseDirectMessage(
  ev: NostrEvent,
  currentUserPubkey: string,
  recipientOverride?: string,
  encOverride?: 'nip4' | 'nip17'
): DirectMessage | null {
  if (!ev?.id) return null
  let recipient = recipientOverride
  if (!recipient) {
    const p = ev.tags.find(t => t[0] === 'p')?.[1]
    recipient = p ?? (ev.kind === GIFTWRAP_KIND ? currentUserPubkey : undefined)
  }
  if (!recipient) return null

  const enc: 'nip4' | 'nip17' = encOverride ?? (ev.kind === GIFTWRAP_KIND ? 'nip17' : 'nip4')

  return {
    id: ev.id,
    senderPubkey: ev.pubkey,
    recipientPubkey: recipient,
    content: ev.content || '',
    createdAt: ev.created_at || 0,
    isEncrypted: true,
    giftwrapped: ev.kind === GIFTWRAP_KIND,
    encryptionType: enc,
  }
}

// --------------------------------- UPDATERS ---------------------------------

function updateConversation(otherPk: string, m: DirectMessage) {
  cacheMessage(m)

  conversationMetadata.update(convs => {
    const next = new Map(convs)
    const meta = get(metadataCache).get(otherPk)
    const existing = next.get(otherPk)
    if (existing) {
      existing.lastMessage = m
      existing.lastMessagePreview = formatConversationPreview(m.content)
      existing.lastUpdated = m.createdAt
      next.set(otherPk, existing)
    } else {
      next.set(otherPk, {
        id: otherPk,
        type: 'direct',
        participantPubkey: otherPk,
        participantName: meta?.name || otherPk.slice(0, 8),
        participantAvatar: meta?.picture,
        lastMessage: m,
        lastMessagePreview: formatConversationPreview(m.content),
        unreadCount: 0,
        lastUpdated: m.createdAt,
      })
    }
    return next
  })

  const activeId = get(activeConversation)
  if (activeId !== otherPk) return

  conversationMessages.update(list => {
    if (list.some(x => x.id === m.id)) return list
    return [...list, m].sort((a, b) => a.createdAt - b.createdAt)
  })
}

// ------------------------------ LIVE SUBSCRIPTIONS --------------------------

let inboxSubscription: NDKSubscription | null = null
let sentSubscription: NDKSubscription | null = null

function tearDown(sub: NDKSubscription | null) {
  if (!sub) return
  try {
    // NDK v2
    if (typeof sub.stop === 'function') sub.stop()
    // Older shape
    else if (typeof (sub as any).unsubscribe === 'function') (sub as any).unsubscribe()
  } catch {}
}

export function stopDmSubscriptions() {
  tearDown(inboxSubscription)
  tearDown(sentSubscription)
  inboxSubscription = null
  sentSubscription = null
}

export function startDmSubscriptions(me: string) {
  if (!me) return
  const ndk = getNDK()
  stopDmSubscriptions()

  const base = { closeOnEose: false }

  inboxSubscription = ndk.subscribe({ kinds: DM_KINDS, '#p': [me] }, base)
  sentSubscription = ndk.subscribe({ kinds: DM_KINDS, authors: [me] }, base)

  const handler = async (evt: NDKEvent) => {
    const raw = evt.rawEvent() as NostrEvent
    try {
      await processIncomingEvent(raw, me)
    } catch (err) {
      console.error('DM live event failed:', err)
    }
  }

  inboxSubscription.on('event', handler)
  sentSubscription.on('event', handler)
}

async function processIncomingEvent(ev: NostrEvent, me: string) {
  const parsed = await parseEventToMessage(ev, me)
  if (!parsed) return
  const other = parsed.senderPubkey === me ? parsed.recipientPubkey : parsed.senderPubkey
  if (!other) return
  updateConversation(other, parsed)
  appendMessageToCache(me, other, parsed)
}

async function parseEventToMessage(ev: NostrEvent, me: string): Promise<DirectMessage | null> {
  const cached = getCachedMessage(ev.id)
  if (cached) return cached

  let content = ev.content
  let sender = ev.pubkey
  let recipient: string | undefined
  let enc: 'nip4' | 'nip17' = ev.kind === GIFTWRAP_KIND ? 'nip17' : 'nip4'

  if (isEncryptedMessage(ev)) {
    try {
      const dec = await decryptMessageWithMetadataStrict(ev)
      if (dec) {

        // -----------------------
        // debugging -- shows real sender mapping
        console.log("💬 REAL SENDER MAP", {
          event_id: ev.id.slice(0,8),
          original_sender: ev.pubkey.slice(0,8),
          real_sender: dec.realSenderPubkey?.slice(0,8)
        })
        // -----------------------

        content = dec.content
        sender = dec.realSenderPubkey ?? sender
        if (ev.kind === GIFTWRAP_KIND && sender !== me) {
          giftwrapSupport.update(m => new Map(m).set(sender, 'supported'))
        }
      } else {
        content = FAILED_DECRYPT_PLACEHOLDER
      }
    } catch {
      content = FAILED_DECRYPT_PLACEHOLDER
    }
  }

  if (ev.kind === GIFTWRAP_KIND) {
    recipient = sender === me ? ev.tags.find(t => t[0] === 'p')?.[1] : me
  } else {
    recipient = ev.tags.find(t => t[0] === 'p')?.[1]
  }

  const parsed = parseDirectMessage({ ...ev, pubkey: sender, content }, me, recipient, enc)
  if (!parsed) return null

  if (content !== FAILED_DECRYPT_PLACEHOLDER) cacheMessage(parsed)
  rawEventCache.set(ev.id, ev)
  return parsed
}


// ---------------------------------- LOADING ---------------------------------

export async function loadConversation(otherPubkey: string) {
  const meUser = getCurrentNDKUser()
  if (!meUser?.pubkey) throw new Error('Not authenticated')
  const ndk = getNDK()

  messagesLoading.set(true)
  messagesError.set(null)

  try {
    const filters = [
      { kinds: DM_KINDS, authors: [meUser.pubkey], '#p': [otherPubkey], limit: 200 },
      { kinds: DM_KINDS, authors: [otherPubkey], '#p': [meUser.pubkey], limit: 200 },
    ]

    const results = await Promise.all(filters.map(f => ndk.fetchEvents(f)))
    const map = new Map<string, NostrEvent>()
    for (const set of results) {
      for (const e of set as Set<NDKEvent>) {
        const raw = e.rawEvent() as NostrEvent
        rawEventCache.set(raw.id, raw)
        map.set(raw.id, raw)
      }
    }

    const rawEvents = Array.from(map.values()).sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
    const msgs: DirectMessage[] = []

    for (const ev of rawEvents) {
      let parsed = getCachedMessage(ev.id)
      if (!parsed) {
        let content = ev.content
        let sender = ev.pubkey

        if (isEncryptedMessage(ev)) {
          const dec = await decryptMessageWithMetadataStrict(ev)
          if (dec) {
            content = dec.content
            sender = dec.realSenderPubkey
          } else {
            content = FAILED_DECRYPT_PLACEHOLDER
          }
        }
        parsed = parseDirectMessage({ ...ev, pubkey: sender, content }, meUser.pubkey)
        if (parsed && content !== FAILED_DECRYPT_PLACEHOLDER) cacheMessage(parsed)
      }
      if (parsed) msgs.push(parsed)
    }

    msgs.sort((a, b) => a.createdAt - b.createdAt)
    conversationMessages.set(msgs)

    const placeholders = msgs.filter(x => x.content === FAILED_DECRYPT_PLACEHOLDER)
    if (placeholders.length) {
      try {
        await retryDecryptConversation(otherPubkey, { silent: true })
      } catch {}
    } else {
      setDmPermissionError(null)
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Failed to load messages'
    messagesError.set(m)
  } finally {
    messagesLoading.set(false)
  }
}

export async function loadConversations() {
  console.log("‼️ loadConversations STARTED")

  const meUser = getCurrentNDKUser()
  if (!meUser?.pubkey) throw new Error('Not authenticated')
  const ndk = getNDK()

  messagesLoading.set(true)
  messagesError.set(null)

  try {
    console.log("building filters…")
    const filters = [
      { kinds: DM_KINDS, '#p': [meUser.pubkey], limit: 1000 },
      { kinds: DM_KINDS, authors: [meUser.pubkey], limit: 1000 },
    ]

    let results;
try {
  results = await Promise.all(filters.map(f => ndk.fetchEvents(f)))
  console.log("✅ FETCH DONE", results)
} catch (e) {
  console.error("❌ fetchEvents ERROR", e)
  return
}


    const map = new Map<string, NostrEvent>()
    console.log("map initialised")

    for (const set of results) {
      for (const e of set as Set<NDKEvent>) {
        const raw = e.rawEvent() as NostrEvent
        rawEventCache.set(raw.id, raw)
        map.set(raw.id, raw)
      }
    }

    console.log("map size =", map.size)  // THIS NUMBER IS IMPORTANT

    const convMap = new Map<string, DirectMessage[]>()

    for (const ev of map.values()) {
      let m = getCachedMessage(ev.id)
      if (!m) {
        let content = ev.content
        let sender = ev.pubkey

        if (isEncryptedMessage(ev)) {
          try {
            const dec = await decryptMessageWithMetadataStrict(ev)
            if (dec) {
              content = dec.content
              sender = dec.realSenderPubkey
            } else {
              content = FAILED_DECRYPT_PLACEHOLDER
            }
          } catch {
            content = FAILED_DECRYPT_PLACEHOLDER
          }
        }

        m = parseDirectMessage({ ...ev, pubkey: sender, content }, meUser.pubkey)
        if (m && content !== FAILED_DECRYPT_PLACEHOLDER) cacheMessage(m)
      }

      if (!m) continue
      const other = m.senderPubkey === meUser.pubkey ? m.recipientPubkey : m.senderPubkey
      if (!other) continue
      if (!convMap.has(other)) convMap.set(other, [])
      convMap.get(other)!.push(m)
    }

    const all = new Set<string>()
    for (const [other, messages] of convMap.entries()) {
      all.add(other)
      for (const msg of messages) {
        all.add(msg.senderPubkey)
        if (msg.recipientPubkey) all.add(msg.recipientPubkey)
      }
    }
    await ensureMetadataForPubkeys(Array.from(all))

    const convList: Conversation[] = []
    const cache = get(metadataCache)

    for (const [other, messages] of convMap.entries()) {
      messages.sort((a, b) => a.createdAt - b.createdAt)
      const last = messages[messages.length - 1]
      const meta = cache.get(other)

      convList.push({
        id: other,
        type: 'direct',
        participantPubkey: other,
        participantName: meta?.name || other.slice(0, 8),
        participantAvatar: meta?.picture,
        lastMessage: last,
        lastMessagePreview: formatConversationPreview(last.content),
        unreadCount: 0,
        lastUpdated: last.createdAt,
      })
    }

    const convMetadata = new Map<string, Conversation>()
    for (const c of convList) convMetadata.set(c.id, c)
    conversationMetadata.set(convMetadata)

  } catch (err) {
    const m = err instanceof Error ? err.message : 'Failed to load conversations'
    console.error('loadConversations failed:', m)
    messagesError.set(m)
  } finally {
    messagesLoading.set(false)
  }
}


// ------------------------------- RETRY DECRYPT ------------------------------

export async function retryDecryptMessage(messageId: string, opts?: { silent?: boolean }) {
  const meUser = getCurrentNDKUser()
  if (!meUser?.pubkey) throw new Error('Not authenticated')
  const ev = rawEventCache.get(messageId)
  if (!ev) {
    if (!opts?.silent) throw new Error('Original message not found for decryption.')
    return false
  }
  try {
    const dec = await decryptMessageWithMetadataStrict(ev)
    if (!dec) {
      if (!opts?.silent) throw new Error('Decryption was cancelled.')
      return false
    }
    const updated: NostrEvent = { ...ev, content: dec.content, pubkey: dec.realSenderPubkey }
    rawEventCache.set(messageId, updated)
    const msg = parseDirectMessage(updated, meUser.pubkey)
    if (!msg) return false
    cacheMessage(msg)
    setDmPermissionError(null)

    // update UI
    conversationMessages.update(list => list.map(x => (x.id === msg.id ? msg : x)))
    const other = msg.senderPubkey === meUser.pubkey ? msg.recipientPubkey : msg.senderPubkey
    if (other) {
      conversationMetadata.update(convs => {
        const next = new Map(convs)
        const c = next.get(other)
        if (c && c.lastMessage?.id === msg.id) {
          c.lastMessage = msg
          c.lastMessagePreview = formatConversationPreview(msg.content)
          c.lastUpdated = msg.createdAt
          next.set(other, c)
        }
        return next
      })
    }
    return true
  } catch (err) {
    if (!opts?.silent) {
      const m = err instanceof Error ? err.message : 'Failed to decrypt message. Check signer permissions.'
      setDmPermissionError(m)
      throw (err instanceof Error ? err : new Error(m))
    }
    return false
  }
}

export async function retryDecryptConversation(otherPubkey: string, opts?: { silent?: boolean }) {
  const meUser = getCurrentNDKUser()
  if (!meUser?.pubkey) throw new Error('Not authenticated')
  const placeholders = get(conversationMessages).filter(m => {
    if (m.content !== FAILED_DECRYPT_PLACEHOLDER) return false
    const other = m.senderPubkey === meUser.pubkey ? m.recipientPubkey : m.senderPubkey
    return other === otherPubkey
  })
  for (const m of placeholders) {
    try {
      await retryDecryptMessage(m.id, opts)
    } catch (e) {
      if (!opts?.silent) throw e
    }
  }
  setDmPermissionError(null)
}

// --------------------------------- HELPERS ----------------------------------

function truncateMessage(content: string, maxLength: number) {
  return content.length <= maxLength ? content : content.slice(0, maxLength) + '...'
}
function formatConversationPreview(content: string, maxLength = 50) {
  if (content === FAILED_DECRYPT_PLACEHOLDER) return 'Encrypted message'
  return truncateMessage(content, maxLength)
}

/* ------------------------------------------------------------------ */
/* SEND MESSAGE (works with legacy NIP-04 + giftwrap NIP-17)          */
/* ------------------------------------------------------------------ */

export async function sendDirectMessage(
  recipientPubkey: string,
  content: string
): Promise<void> {
  const meUser = getCurrentNDKUser()
  if (!meUser?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()

  // decide mode (for now ALWAYS legacy nip04 until grouping confirmed)
  const mode: 'nip4' | 'nip17' = 'nip4'

  let evt: NDKEvent

  if (mode === 'nip4') {
    const counterpart = ndk.getUser({ pubkey: recipientPubkey })
    // Type assertion needed because nip04 exists at runtime but not in type definitions
    const cipher = await (ndk.signer as any).nip04.encrypt(counterpart, content)

    evt = new NDKEvent(ndk, {
      kind: DIRECT_MESSAGE_KIND,
      content: cipher,
      tags: [['p', recipientPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    })

    await evt.sign(ndk.signer!)
    await evt.publish()

  } else {
    // we will re-enable giftwrap later – first we MUST see conversations group
    throw new Error("giftwrap disabled temporarily until grouping working")
  }

  // optimistic update
  const optimistic: DirectMessage = {
    id: evt.id || `temp-${Date.now()}-${Math.random()}`,
    senderPubkey: meUser.pubkey,
    recipientPubkey,
    content,
    createdAt: Math.floor(Date.now() / 1000),
    isEncrypted: true,
    giftwrapped: false,
    encryptionType: 'nip4',
  }

  updateConversation(recipientPubkey, optimistic)
}

/**
 * Search for users by name or pubkey (stub implementation)
 * TODO: Implement proper user search functionality
 */
export async function searchUsers(query: string): Promise<any[]> {
  // Stub implementation - to be properly implemented later
  console.warn('searchUsers not yet implemented:', query)
  return []
}

/**
 * Create a group chat (stub implementation)
 * TODO: Implement group chat functionality
 */
export async function createGroupChat(name: string, members: string[]): Promise<string> {
  // Stub implementation - to be properly implemented later
  console.warn('createGroupChat not yet implemented:', name, members)
  // Return a temporary group ID until proper implementation
  return `group-${Date.now()}`
}
