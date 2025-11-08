/**
 * Direct Messaging Service
 * Handles NIP-04 (legacy), NIP-44 (modern), and NIP-59 (giftwrap) encryption
 * Supports both 1-to-1 DMs and group chats
 * 
 * Messages are automatically decrypted when user is authenticated
 */

import { getNDK, getCurrentNDKUser } from '$lib/ndk'
import { decryptMessageCached, isEncryptedMessage } from '$lib/message-decryption'
import {
  conversations,
  conversationMessages,
  groups,
  messagesLoading,
  messagesError,
  getConversationEncryptionMode,
  setDmPermissionError,
} from '$stores/messages'
import { metadataCache } from '$stores/feed'
import type { DirectMessage, Conversation, ConversationGroup } from '$types/dm'
import type { NostrEvent } from '$types/nostr'
import { get } from 'svelte/store'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import type { UserMetadata } from '$types/user'

const DIRECT_MESSAGE_KIND = 4 // NIP-04 (legacy)
const GIFTWRAP_KIND = 1059 // NIP-59 (giftwrap)
export const FAILED_DECRYPT_PLACEHOLDER = '[Failed to decrypt]'

const messageCache = new Map<string, DirectMessage>()
const rawEventCache = new Map<string, NostrEvent>()
let permissionsPrimed = false
let permissionsWarmupPromise: Promise<void> | null = null

function cacheMessage(message: DirectMessage): void {
  if (!message?.id) return
  messageCache.set(message.id, message)
}

function getCachedMessage(id: string): DirectMessage | null {
  return messageCache.get(id) ?? null
}

async function ensureMetadataForPubkeys(pubkeys: string[]): Promise<void> {
  if (!pubkeys.length) return
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
        const metadata = JSON.parse(content) as UserMetadata
        metadataCache.update(existing => {
          const next = new Map(existing)
          next.set(pubkey, metadata)
          return next
        })
      } catch (err) {
        console.warn('Failed to fetch metadata for', pubkey, err)
      }
    })
  )
}

async function primeNip04(pubkey: string): Promise<void> {
  const nostr: any = (window as any).nostr
  if (!nostr?.nip04?.encrypt) return
  const probe = await nostr.nip04.encrypt(pubkey, '__monstr_probe__')
  if (nostr.nip04?.decrypt) {
    await nostr.nip04.decrypt(pubkey, probe)
  }
}

async function primeNip44(pubkey: string): Promise<void> {
  const nostr: any = (window as any).nostr
  if (!nostr?.nip44?.encrypt) return
  const probe = await nostr.nip44.encrypt(pubkey, '__monstr_probe__')
  if (nostr.nip44?.decrypt) {
    await nostr.nip44.decrypt(pubkey, probe)
  }
}

async function primeSign(kind: number, pubkey: string): Promise<void> {
  const ndk = getNDK()
  const evt = new NDKEvent(ndk)
  evt.kind = kind
  evt.content = ''
  evt.tags = [['p', pubkey]]
  evt.created_at = Math.floor(Date.now() / 1000)
  await evt.sign()
}

export async function warmupMessagingPermissions(): Promise<void> {
  if (permissionsPrimed) return
  if (permissionsWarmupPromise) {
    await permissionsWarmupPromise
    return
  }
  permissionsWarmupPromise = (async () => {
    if (typeof window === 'undefined' || !(window as any).nostr) return
    const ndk = getNDK()
    const signer = ndk.signer
    const user = getCurrentNDKUser()
    if (!signer || !user?.pubkey) return
    try {
      await primeNip04(user.pubkey)
      await primeNip44(user.pubkey)
      await primeSign(DIRECT_MESSAGE_KIND, user.pubkey)
      await primeSign(GIFTWRAP_KIND, user.pubkey)
      setDmPermissionError(null)
      permissionsPrimed = true
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Please approve messaging permissions in your signer.'
      setDmPermissionError(message)
      throw err
    } finally {
      permissionsWarmupPromise = null
    }
  })()
  await permissionsWarmupPromise
}

/**
 * Send a direct message using appropriate encryption
 */
export async function sendDirectMessage(
  recipientPubkey: string,
  content: string,
  options?: { isGroupChat?: boolean; encryptionMode?: 'modern' | 'legacy' }
): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()
  if (!ndk.signer) throw new Error('No signer available')

  const isGroupChat = options?.isGroupChat ?? false
  const encryptionMode =
    options?.encryptionMode ?? getConversationEncryptionMode(isGroupChat ? null : recipientPubkey)
  const useLegacy = encryptionMode === 'legacy'

  try {
    messagesLoading.set(true)
    messagesError.set(null)

    // Create message event
    const event = new NDKEvent(ndk, {
      kind: useLegacy ? DIRECT_MESSAGE_KIND : GIFTWRAP_KIND,
      content: content,
      tags: [['p', recipientPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    })

    // Sign and publish
    await event.sign(ndk.signer)
    await event.publish()

    console.log('âœ“ Message sent:', {
      recipient: recipientPubkey.slice(0, 8),
      encryption: useLegacy ? 'NIP-04' : 'NIP-59',
      kind: useLegacy ? DIRECT_MESSAGE_KIND : GIFTWRAP_KIND,
    })

    // Add to local conversation
    const dmMessage: DirectMessage = {
      id: event.id || '',
      senderPubkey: user.pubkey,
      recipientPubkey: recipientPubkey,
      content: content,
      createdAt: Math.floor(Date.now() / 1000),
      isEncrypted: true,
      giftwrapped: !useLegacy,
    encryptionType: useLegacy ? 'nip4' : 'nip59',
  }

  cacheMessage(dmMessage)
  // Update conversation
  updateConversation(recipientPubkey, dmMessage, !isGroupChat)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to send message'
    console.error('âœ— Send message failed:', errorMsg)
    messagesError.set(errorMsg)
    throw err
  } finally {
    messagesLoading.set(false)
  }
}

/**
 * Load messages for a conversation
 * Automatically decrypts encrypted messages
 */
export async function loadConversation(pubkey: string): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()

  try {
    messagesLoading.set(true)
    messagesError.set(null)

    // Fetch both directions explicitly (needed when messaging yourself)
    const filters = [
      {
        kinds: [DIRECT_MESSAGE_KIND, GIFTWRAP_KIND],
        authors: [user.pubkey],
        '#p': [pubkey],
        limit: 100,
      },
      {
        kinds: [DIRECT_MESSAGE_KIND, GIFTWRAP_KIND],
        authors: [pubkey],
        '#p': [user.pubkey],
        limit: 100,
      },
    ]

    const results = await Promise.all(
      filters.map(filter => ndk.fetchEvents(filter))
    )

    const eventMap = new Map<string, NostrEvent>()
    for (const set of results) {
      for (const evt of set as Set<NDKEvent>) {
        const raw = evt.rawEvent() as NostrEvent
        eventMap.set(raw.id, raw)
      }
    }

    const rawEvents = Array.from(eventMap.values())
    
    // Decrypt messages in parallel batches (max 3 at a time to reduce signer prompts)
    const decryptedMessages: DirectMessage[] = []
    const BATCH_SIZE = 3

    for (let i = 0; i < rawEvents.length; i += BATCH_SIZE) {
      const batch = rawEvents.slice(i, i + BATCH_SIZE)
      
      await Promise.all(
        batch.map(async event => {
      try {
        rawEventCache.set(event.id, event)
        let content = event.content

        if (isEncryptedMessage(event) && user?.pubkey) {
          console.log('ðŸ” Decrypting message:', event.id.slice(0, 8))
          const decrypted = await decryptMessageCached(event)
          if (decrypted) {
            content = decrypted
          } else {
            console.warn('âš ï¸  Failed to decrypt message:', event.id.slice(0, 8))
            content = FAILED_DECRYPT_PLACEHOLDER
          }
        }

        if (content === FAILED_DECRYPT_PLACEHOLDER) {
          const cached = getCachedMessage(event.id)
          if (cached) {
            decryptedMessages.push(cached)
            return
          }
        }

        const msg = parseDirectMessage({ ...event, content }, user.pubkey)
        if (!msg) return
        if (content !== FAILED_DECRYPT_PLACEHOLDER) {
          cacheMessage(msg)
        }
        decryptedMessages.push(msg)
        } catch (err) {
          console.error('Error processing message:', err)
        }
        })
      )
    }
    // Sort by timestamp
    decryptedMessages.sort((a, b) => a.createdAt - b.createdAt)

    conversationMessages.set(decryptedMessages)
    const placeholders = decryptedMessages.filter(msg => msg.content === FAILED_DECRYPT_PLACEHOLDER)
    if (placeholders.length > 0) {
      try {
        await retryDecryptConversation(pubkey)
      } catch (err) {
        console.warn('User cancelled decryption:', err)
      }
    } else {
      setDmPermissionError(null)
    }
    console.log('âœ“ Loaded', decryptedMessages.length, 'messages from', pubkey.slice(0, 8))
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to load messages'
    console.error('âœ— Load conversation failed:', errorMsg)
    messagesError.set(errorMsg)
  } finally {
    messagesLoading.set(false)
  }
}

/**
 * Load all conversations for current user
 * Automatically decrypts encrypted messages for preview
 */
export async function loadConversations(): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const ndk = getNDK()

  try {
    messagesLoading.set(true)
    messagesError.set(null)

    const filters = [
      {
        kinds: [DIRECT_MESSAGE_KIND, GIFTWRAP_KIND],
        '#p': [user.pubkey],
        limit: 1000,
      },
      {
        kinds: [DIRECT_MESSAGE_KIND, GIFTWRAP_KIND],
        authors: [user.pubkey],
        limit: 1000,
      },
    ]

    const results = await Promise.all(filters.map(filter => ndk.fetchEvents(filter)))
    const eventMap = new Map<string, NostrEvent>()
    for (const set of results) {
      for (const evt of set as Set<NDKEvent>) {
        const raw = evt.rawEvent() as NostrEvent
        rawEventCache.set(raw.id, raw)
        eventMap.set(raw.id, raw)
      }
    }

    const convMap = new Map<string, DirectMessage[]>()

    for (const event of eventMap.values()) {
      try {
        let msg: DirectMessage | null = getCachedMessage(event.id)
        if (!msg) {
          let content = event.content
          
          // âœ… NEW: Try to decrypt encrypted messages for preview
          if (isEncryptedMessage(event)) {
            try {
              const decrypted = await decryptMessageCached(event)
              if (decrypted) {
                content = decrypted
              } else {
                content = FAILED_DECRYPT_PLACEHOLDER
              }
            } catch (err) {
              console.warn('Failed to decrypt message preview:', event.id.slice(0, 8), err)
              content = FAILED_DECRYPT_PLACEHOLDER
            }
          }
          
          msg = parseDirectMessage({ ...event, content }, user.pubkey)
          if (!msg) continue
          if (content !== FAILED_DECRYPT_PLACEHOLDER) {
            cacheMessage(msg)
          }
        }

        const otherPubkey = msg.senderPubkey === user.pubkey ? msg.recipientPubkey : msg.senderPubkey
        if (!otherPubkey) continue

        if (!convMap.has(otherPubkey)) {
          convMap.set(otherPubkey, [])
        }
        convMap.get(otherPubkey)!.push(msg)
      } catch (err) {
        console.error('Error processing message in loadConversations:', err)
      }
    }

    // âœ… NEW: Collect all unique pubkeys (participants + senders)
    const allPubkeys = new Set<string>()
    for (const [pubkey, messages] of convMap.entries()) {
      allPubkeys.add(pubkey)
      for (const msg of messages) {
        allPubkeys.add(msg.senderPubkey)
        if (msg.recipientPubkey) {
          allPubkeys.add(msg.recipientPubkey)
        }
      }
    }
    await ensureMetadataForPubkeys(Array.from(allPubkeys))

    // Build conversation list
    const convList: Conversation[] = []
    const cache = get(metadataCache)

    for (const [pubkey, messages] of convMap.entries()) {
      messages.sort((a, b) => a.createdAt - b.createdAt)
      const lastMessage = messages[messages.length - 1]
      const metadata = cache.get(pubkey)

      convList.push({
        id: pubkey,
        type: 'dm',
        participantPubkey: pubkey,
        participantName: metadata?.name || pubkey.slice(0, 8),
        participantAvatar: metadata?.picture,
        lastMessage: lastMessage,
        lastMessagePreview: formatConversationPreview(lastMessage.content),
        unreadCount: 0,
        lastUpdated: lastMessage.createdAt,
      })
    }

    conversations.set(convList)
    console.log('âœ“ Loaded', convList.length, 'conversations')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to load conversations'
    console.error('âœ— Load conversations failed:', errorMsg)
    messagesError.set(errorMsg)
  } finally {
    messagesLoading.set(false)
  }
}

/**
 * Search for users to start new chat
 */
export async function searchUsers(
  query: string
): Promise<Array<{ pubkey: string; name: string; avatar?: string }>> {
  if (!query.trim()) {
    return []
  }

  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  try {
    // Search by npub or name
    const results: Array<{ pubkey: string; name: string; avatar?: string }> = []

    // Try to decode npub
    if (query.startsWith('npub1')) {
      try {
        const { data: pubkey } = require('nostr-tools').nip19.decode(query)
        const metadata = get(metadataCache).get(pubkey as string)
        if (pubkey && pubkey !== user.pubkey) {
          results.push({
            pubkey: pubkey as string,
            name: metadata?.name || pubkey.slice(0, 8),
            avatar: metadata?.picture,
          })
        }
      } catch (err) {
        console.warn('Invalid npub:', query)
      }
    }

    // Search by name in metadata
    const cache = get(metadataCache)
    for (const [pubkey, metadata] of cache) {
      if (pubkey === user.pubkey) continue
      if (metadata.name?.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          pubkey,
          name: metadata.name || pubkey.slice(0, 8),
          avatar: metadata.picture,
        })
      }
    }

    // Limit results
    return results.slice(0, 10)
  } catch (err) {
    console.error('Search failed:', err)
    return []
  }
}

/**
 * Create a group chat
 */
export async function createGroupChat(
  groupName: string,
  memberPubkeys: string[]
): Promise<string> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')

  const groupId = generateGroupId()

  const group: ConversationGroup = {
    id: groupId,
    name: groupName,
    members: [user.pubkey, ...memberPubkeys],
    createdAt: Math.floor(Date.now() / 1000),
    createdBy: user.pubkey,
  }

  groups.update(g => new Map(g).set(groupId, group))

  console.log('âœ“ Group created:', groupName)
  return groupId
}

/**
 * Add message to conversation (optimistic update)
 */
function updateConversation(pubkey: string, message: DirectMessage, isDM = true): void {
  cacheMessage(message)
  if (isDM) {
    // Update or create conversation
    conversations.update(convs => {
      const existing = convs.find(c => c.id === pubkey)

      if (existing) {
        existing.lastMessage = message
        existing.lastMessagePreview = formatConversationPreview(message.content)
        existing.lastUpdated = message.createdAt
      } else {
        const cache = get(metadataCache)
        const metadata = cache.get(pubkey)
        if (!metadata) {
          void ensureMetadataForPubkeys([pubkey])
        }

        convs.push({
          id: pubkey,
          type: 'dm',
          participantPubkey: pubkey,
          participantName: metadata?.name || pubkey.slice(0, 8),
          participantAvatar: metadata?.picture,
          lastMessage: message,
          lastMessagePreview: formatConversationPreview(message.content),
          unreadCount: 0,
          lastUpdated: message.createdAt,
        })
      }

      return convs
    })

    // Add to current conversation messages if active
    if (get(conversationMessages).some(m => m.id === message.id)) {
      return // Already added
    }

    conversationMessages.update(msgs => [...msgs, message])
  }
}

/**
 * Parse a Nostr event into a DirectMessage
 */
function parseDirectMessage(event: NostrEvent, _currentUserPubkey: string): DirectMessage | null {
  if (!event.id) return null

  // Extract recipient from tags
  const recipientTag = event.tags.find(t => t[0] === 'p')
  const recipientPubkey = recipientTag?.[1]

  if (!recipientPubkey) return null

  return {
    id: event.id,
    senderPubkey: event.pubkey,
    recipientPubkey: recipientPubkey,
    content: event.content || '',
    createdAt: event.created_at || 0,
    isEncrypted: true,
    giftwrapped: event.kind === GIFTWRAP_KIND,
    encryptionType:
      event.kind === GIFTWRAP_KIND
        ? 'nip59'
        : event.kind === DIRECT_MESSAGE_KIND
          ? 'nip4'
          : 'nip44',
  }
}

/**
 * Truncate message for preview
 */
function truncateMessage(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '...'
}

function formatConversationPreview(content: string, maxLength = 50): string {
  if (content === FAILED_DECRYPT_PLACEHOLDER) {
    return 'Encrypted message'
  }
  return truncateMessage(content, maxLength)
}

/**
 * Generate unique group ID
 */
function generateGroupId(): string {
  return 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)
}

export async function retryDecryptMessage(
  messageId: string,
  options?: { silent?: boolean }
): Promise<boolean> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')
  const event = rawEventCache.get(messageId)
  if (!event) {
    if (!options?.silent) {
      throw new Error('Original message not found for decryption.')
    }
    return false
  }
  try {
    const decrypted = await decryptMessageCached(event)
    if (!decrypted) {
      if (!options?.silent) {
        throw new Error('Decryption was cancelled.')
      }
      return false
    }
    const updatedEvent = { ...event, content: decrypted }
    rawEventCache.set(messageId, updatedEvent)
    const msg = parseDirectMessage(updatedEvent, user.pubkey)
    if (!msg) return false
    cacheMessage(msg)
    setDmPermissionError(null)
    replaceMessageInStores(msg, user.pubkey)
    return true
  } catch (err) {
    if (!options?.silent) {
      const message =
        err instanceof Error ? err.message : 'Failed to decrypt message. Check signer permissions.'
      setDmPermissionError(message)
    }
    if (!options?.silent) {
      throw (err instanceof Error ? err : new Error('Failed to decrypt message.'))
    }
    return false
  }
}

export async function retryDecryptConversation(
  conversationId: string,
  options?: { silent?: boolean }
): Promise<void> {
  const user = getCurrentNDKUser()
  if (!user?.pubkey) throw new Error('Not authenticated')
  const placeholders = get(conversationMessages).filter(msg => {
    if (msg.content !== FAILED_DECRYPT_PLACEHOLDER) return false
    const other =
      msg.senderPubkey === user.pubkey ? msg.recipientPubkey : msg.senderPubkey
    return other === conversationId
  })

  for (const msg of placeholders) {
    try {
      await retryDecryptMessage(msg.id, options)
    } catch (err) {
      if (!options?.silent) {
        throw err
      }
    }
  }
  setDmPermissionError(null)
}

function replaceMessageInStores(message: DirectMessage, currentUserPubkey: string): void {
  conversationMessages.update(list =>
    list.map(item => (item.id === message.id ? message : item))
  )
  const otherPubkey =
    message.senderPubkey === currentUserPubkey ? message.recipientPubkey : message.senderPubkey
  if (!otherPubkey) return
  conversations.update(convs =>
    convs.map(conv =>
      conv.id === otherPubkey
        ? {
            ...conv,
            lastMessage: conv.lastMessage?.id === message.id ? message : conv.lastMessage,
            lastMessagePreview:
              conv.lastMessage?.id === message.id
                ? formatConversationPreview(message.content)
                : conv.lastMessagePreview,
            lastUpdated:
              conv.lastMessage?.id === message.id ? message.createdAt : conv.lastUpdated,
          }
        : conv
    )
  )
}


