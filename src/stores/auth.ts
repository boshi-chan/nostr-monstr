import { writable, derived } from 'svelte/store'
import type { User } from '$types/user'

export const currentUser = writable<User | null>(null)
export const isAuthenticated = derived(currentUser, $user => {
  logger.info('🔐 isAuthenticated derived - user:', $user ? 'logged in' : 'logged out')
  return $user !== null
})

