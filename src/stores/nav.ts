import { writable } from 'svelte/store'

export type NavTab = 'home' | 'messages' | 'profile'

export const activeTab = writable<NavTab>('home')
