import { writable, derived } from 'svelte/store'
import type { Conversation, ConversationGroup, DirectMessage, MessageState } from '$types/dm'
import type { NostrEvent } from '$types/nostr'

/**
 * All conversations - for backward compatibility with existing messaging.ts
 * Maps pubkey -> array of NostrEvents
 */
export const conversations = writable<Map<string, NostrEvent[]>>(new Map())

/**
 * Conversation metadata indexed by pubkey
 * Maps pubkey -> Conversation object with display info
 */
export const conversationMetadata = writable<Map<string, Conversation>>(new Map())

/**
 * Messages in the currently active conversation
 */
export const conversationMessages = writable<DirectMessage[]>([])

/**
 * Currently selected conversation ID (pubkey or group ID)
 */
export const activeConversation = writable<string | null>(null)

/**
 * Loading state (for backward compatibility)
 */
export const messagesLoading = writable(false)

/**
 * Error state (for backward compatibility)
 */
export const messagesError = writable<string | null>(null)

/**
 * Full message state
 */
export const messageState = writable<MessageState>({
  isLoading: false,
  isSending: false,
  error: null,
  encryptionMode: 'nip17', // default to NIP-17 gift wrap
})

/**
 * Unread counts by conversation
 */
export const unreadCounts = writable<Map<string, number>>(new Map())

/**
 * Typing indicators: who is typing in which conversation
 */
export const typingIndicators = writable<Map<string, { pubkey: string; timestamp: number }>>(new Map())

/**
 * Group chats (for backward compatibility)
 */
export const groups = writable<Map<string, ConversationGroup>>(new Map())

/**
 * Modal visibility flags
 */
export const showNewChatModal = writable(false)
export const showNewGroupModal = writable(false)

type ChatSearchResult = {
  pubkey: string
  name: string
  avatar?: string | null
}

/**
 * New chat search state
 */
export const searchQuery = writable('')
export const searchResults = writable<ChatSearchResult[]>([])
export const isSearching = writable(false)

/**
 * Conversation-specific encryption preferences
 * pubkey -> 'nip17' | 'nip4'
 */
export const conversationEncryption = writable<Map<string, 'nip17' | 'nip4'>>(new Map())

/**
 * Giftwrap capability map
 * pubkey -> 'unknown' | 'supported' | 'unsupported'
 */
export const giftwrapSupport = writable<Map<string, 'unknown' | 'supported' | 'unsupported'>>(
  new Map()
)

/**
 * Tracks whether cached conversations have been hydrated for the active user
 */
export const dmCacheHydratedFor = writable<string | null>(null)

/**
 * Derived store: get active conversation metadata
 */
export const activeConversationData = derived(
  [activeConversation, conversationMetadata],
  ([$activeId, $convs]) => {
    if (!$activeId) return null
    return $convs.get($activeId) ?? null
  }
)

/**
 * Get encryption mode for conversation
 */
export function getConversationEncryptionMode(_pubkey: string | null): 'nip17' | 'nip4' {
  // Default to nip17 (gift wrap) for new messages
  return 'nip17'
}

/**
 * Set DM permission error
 */
export function setDmPermissionError(error: string | null): void {
  messagesError.set(error)
}
