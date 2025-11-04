export interface DirectMessage {
  id: string
  senderPubkey: string
  recipientPubkey: string
  content: string
  createdAt: number
  isEncrypted: boolean
  giftwrapped?: boolean
}

export interface Conversation {
  participantPubkey: string
  lastMessage?: DirectMessage
  unreadCount: number
  lastUpdated: number
}
