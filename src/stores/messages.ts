import { writable } from 'svelte/store'
import type { NostrEvent } from '$types/nostr'

export const conversations = writable<Map<string, NostrEvent[]>>(new Map())
export const activeConversation = writable<string | null>(null)
export const messagesLoading = writable(false)
export const messagesError = writable<string | null>(null)
