import { writable } from 'svelte/store'

export type NavTab = 'home' | 'messages' | 'notifications' | 'profile' | 'settings'

export const activeTab = writable<NavTab>('home')
