import { get, writable } from 'svelte/store'
import type { NostrEvent } from '$types/nostr'
import type { NavTab } from './nav'
import { activeTab } from './nav'

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

const routeHistory = writable<Route[]>([])

export function navigateToPage(tab: NavTab): void {
  activeTab.set(tab)
  activeRoute.set({ type: 'page', tab })
  routeHistory.set([])
}

export function openPost(event: NostrEvent, originTab: NavTab): void {
  openPostById(event.id, originTab, event)
}

export function openPostById(
  eventId: string,
  originTab: NavTab,
  initialEvent?: NostrEvent
): void {
  const current = get(activeRoute)

  // Don't push to history if we're already viewing this post
  if (current.type === 'post' && current.eventId === eventId) {
    return
  }

  routeHistory.update(history => [...history, current])
  activeRoute.set({
    type: 'post',
    eventId,
    originTab,
    initialEvent,
  })
  activeTab.set(originTab)
}

export function openProfile(pubkey: string, originTab: NavTab): void {
  const current = get(activeRoute)

  // Don't push to history if we're already viewing this profile
  if (current.type === 'profile' && current.pubkey === pubkey) {
    return
  }

  routeHistory.update(history => [...history, current])
  activeRoute.set({
    type: 'profile',
    pubkey,
    originTab,
  })
  activeTab.set(originTab)
}

export function goBack(): void {
  routeHistory.update(history => {
    if (history.length === 0) {
      const fallbackTab = get(activeTab)
      activeRoute.set({ type: 'page', tab: fallbackTab })
      return []
    }

    const next = [...history]
    const previous = next.pop()!
    activeRoute.set(previous)

    if (previous.type === 'page') {
      activeTab.set(previous.tab)
    } else {
      activeTab.set(previous.originTab)
    }

    return next
  })
}
