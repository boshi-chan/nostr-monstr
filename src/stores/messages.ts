import { writable } from 'svelte/store'
import type { DirectMessage } from '$types/dm'

export const conversations = writable<Map<string, DirectMessage[]>>(new Map())
export const activeConversation = writable<string | null>(null)
export const isLoadingMessages = writable(false)
