import { writable } from 'svelte/store'

export type NavTab = 'home' | 'messages' | 'livestreams' | 'notifications' | 'discover' | 'profile' | 'settings'

export const activeTab = writable<NavTab>('home')
