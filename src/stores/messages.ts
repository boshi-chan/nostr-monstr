import { writable, derived } from 'svelte/store'
import type { Conversation, ConversationGroup, DirectMessage, MessageState } from '$types/dm'

export const conversations = writable<Map<string, DirectMessage[]>>(new Map())
export const conversationMetadata = writable<Map<string, Conversation>>(new Map())
export const conversationMessages = writable<DirectMessage[]>([])
export const activeConversation = writable<string | null>(null)
export const messagesLoading = writable(false)
export const messagesError = writable<string | null>(null)

export const messageState = writable<MessageState>({
  isLoading: false,
  isSending: false,
  error: null,
})

export const unreadCounts = writable<Map<string, number>>(new Map())
export const typingIndicators = writable<Map<string, { pubkey: string; timestamp: number }>>(new Map())
export const groups = writable<Map<string, ConversationGroup>>(new Map())
export const showNewChatModal = writable(false)
export const showNewGroupModal = writable(false)
export const conversationEncryption = writable<Map<string, 'nip17' | 'nip4'>>(new Map())
export const giftwrapSupport = writable<Map<string, 'unknown' | 'supported' | 'unsupported'>>(new Map())
export const dmCacheHydratedFor = writable<string | null>(null)

export const activeConversationData = derived(
  [activeConversation, conversationMetadata],
  ([$active, $meta]) => ($active ? $meta.get($active) ?? null : null)
)

export function setDmPermissionError(error: string | null): void {
  messagesError.set(error)
}

// User search stores (for new chat modal)
export const searchQuery = writable('')
export const searchResults = writable<any[]>([])
export const isSearching = writable(false)
