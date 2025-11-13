/**
 * Direct Message type
 * Represents a single DM, supporting NIP-04, NIP-17, NIP-44, and NIP-59 (giftwrap) encryption
 */
export interface DirectMessage {
  id: string
  senderPubkey: string
  recipientPubkey: string
  content: string
  createdAt: number
  isEncrypted: boolean
  encryptionType?: 'nip4' | 'nip17' | 'nip44' | 'nip59' // encryption standard used
  giftwrapped?: boolean // deprecated, use encryptionType instead
  failed?: boolean // true if decryption failed
}

/**
 * Conversation type
 * Represents a 1-to-1 or group conversation
 */
export interface Conversation {
  id: string
  type: 'direct' | 'group'
  participantPubkey?: string
  participantName?: string
  participantAvatar?: string
  lastMessage?: DirectMessage
  lastMessagePreview?: string
  lastMessageAt?: number
  lastUpdated?: number
  unreadCount?: number
}

/**
 * Group chat type
 * Represents a conversation with multiple participants
 */
export interface ConversationGroup {
  id: string
  name: string
  members: string[] // pubkeys
  createdAt: number
  lastMessage?: DirectMessage
  unreadCount: number
  createdBy?: string
}

/**
 * Message state for UI
 * Tracks loading/sending state of messages
 */
export interface MessageState {
  isLoading: boolean
  isSending: boolean
  error: string | null
}
