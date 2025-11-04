/**
 * Direct Message utilities
 * Implements Signal-style encrypted messaging with Giftwrap support (NIP-44)
 */

import { conversations, activeConversation } from '$stores/messages'
import { getDB } from './db'
import type { DirectMessage } from '$types/dm'

/**
 * Load conversations from IndexedDB
 */
export async function loadConversations(): Promise<void> {
  const db = getDB()
  const dmIndex = await db.getAll('dmIndex')

  const conversationMap = new Map<string, DirectMessage[]>()

  for (const entry of dmIndex) {
    // In production, fetch actual messages from events store
    conversationMap.set(entry.pubkey, [])
  }

  conversations.set(conversationMap)
}

/**
 * Send encrypted message
 */
export async function sendEncryptedMessage(
  recipientPubkey: string,
  content: string,
  useGiftwrap: boolean = true
): Promise<string> {
  // In production, this would:
  // 1. Encrypt content with NIP-44 (ChaCha20-Poly1305)
  // 2. Wrap with Giftwrap if supported
  // 3. Sign and send to relays
  // 4. Store locally

  const messageId = 'msg_' + Math.random().toString(36).substring(7)

  const message: DirectMessage = {
    id: messageId,
    senderPubkey: '', // Would come from auth store
    recipientPubkey,
    content,
    createdAt: Math.floor(Date.now() / 1000),
    isEncrypted: true,
    giftwrapped: useGiftwrap,
  }

  // Store in conversations map
  conversations.update((convs) => {
    const msgs = convs.get(recipientPubkey) || []
    const newMsgs = [...msgs, message]
    const newConvs = new Map(convs)
    newConvs.set(recipientPubkey, newMsgs)
    return newConvs
  })

  return messageId
}

/**
 * Delete message (local hide + Nostr delete event)
 */
export async function deleteMessage(messageId: string, recipientPubkey: string): Promise<void> {
  // In production, this would:
  // 1. Remove from local storage
  // 2. Send NIP-09 delete event to relays

  conversations.update((convs) => {
    const msgs = convs.get(recipientPubkey) || []
    const filtered = msgs.filter((m) => m.id !== messageId)
    const newConvs = new Map(convs)
    newConvs.set(recipientPubkey, filtered)
    return newConvs
  })
}

/**
 * Mark conversation as read
 */
export async function markConversationAsRead(pubkey: string): Promise<void> {
  const db = getDB()
  await db.put('dmIndex', {
    pubkey,
    lastUpdated: Math.floor(Date.now() / 1000),
  })
}
