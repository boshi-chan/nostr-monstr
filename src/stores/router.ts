import type { NostrEvent } from '$types/nostr'
import type { NavTab } from './nav'
import { activeTab } from './nav'
import { writable } from 'svelte/store'
import { navigateTo } from '$lib/navigation'

type PageRoute = {
  type: 'page'
  tab: NavTab
}

type PostRoute = {
  type: 'post'
  eventId: string
  originTab: NavTab
  initialEvent?: NostrEvent
}

type ProfileRoute = {
  type: 'profile'
  pubkey: string
  originTab: NavTab
}

export type Route = PageRoute | PostRoute | ProfileRoute

const initialRoute: Route = { type: 'page', tab: 'home' }

export const activeRoute = writable<Route>(initialRoute)

export function navigateToPage(tab: NavTab): void {
  const path = tab === 'home' ? '/home' : `/${tab}`
  const route: PageRoute = { type: 'page', tab }
  navigateTo(path, route)
  activeTab.set(tab)
  activeRoute.set(route)
}

export function openPost(event: NostrEvent, originTab: NavTab): void {
  openPostById(event.id, originTab, event)
}

export function openPostById(
  eventId: string,
  originTab: NavTab,
  initialEvent?: NostrEvent
): void {
  const route: PostRoute = {
    type: 'post',
    eventId,
    originTab,
    initialEvent,
  }
  navigateTo(`/post/${eventId}`, route)
  activeTab.set(originTab)
  activeRoute.set(route)
}

export function openProfile(pubkey: string, originTab: NavTab): void {
  const route: ProfileRoute = {
    type: 'profile',
    pubkey,
    originTab,
  }
  navigateTo(`/profile/${pubkey}`, route)
  activeTab.set(originTab)
  activeRoute.set(route)
}

export function goBack(): boolean {
  if (typeof window === 'undefined') return false

  // Check if we can go back (history length > 1 means there's somewhere to go back to)
  // The seeded history in App.svelte ensures we always have at least 2 entries
  if (history.length > 2) {
    history.back()
    return true
  }

  // If we're at the root, can't go back further
  return false
}
