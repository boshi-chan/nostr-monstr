import { writable } from 'svelte/store'

export const isInitialized = writable(false)
export const initError = writable('')
