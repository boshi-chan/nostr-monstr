import { activeRoute, navigateToPage, openPostById, openProfile } from '$stores/router'
import type { Route } from '$stores/router'
import { activeTab } from '$stores/nav'

type DeepLinkTarget =
  | { type: 'post'; eventId: string }
  | { type: 'profile'; pubkey: string }
  | null

function parseDeepLink(url: string | null | undefined): DeepLinkTarget {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'monstr:' && parsed.protocol !== 'monstr://') return null
    const [first, second] = parsed.pathname.replace(/^\/+/, '').split('/')
    if (first === 'post' && second) {
      return { type: 'post', eventId: second }
    }
    if (first === 'profile' && second) {
      return { type: 'profile', pubkey: second }
    }
  } catch (err) {
    console.warn('[deep-link] Failed to parse url:', url, err)
  }
  return null
}

export function handleDeepLink(url: string | null | undefined): void {
  const target = parseDeepLink(url)
  if (!target) return

  const current: Route = $activeRoute

  if (target.type === 'post') {
    openPostById(target.eventId, current.type === 'page' ? current.tab : 'home')
    return
  }

  if (target.type === 'profile') {
    openProfile(target.pubkey, current.type === 'page' ? current.tab : 'home')
    return
  }
}

// Optional: helper to wire from Capacitor appUrlOpen event
export function setupDeepLinkListener(): void {
  if (typeof window === 'undefined') return
  // Capacitor delivers appUrlOpen via window events in hybrid apps
  window.addEventListener('appUrlOpen', (event: any) => {
    handleDeepLink(event?.url ?? null)
  })
}
