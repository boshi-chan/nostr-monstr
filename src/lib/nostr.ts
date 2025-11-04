import { isLoadingFeed } from '$stores/feed'
import { parseMetadataEvent } from './metadata'
import { addEvent } from './db'
import type { NostrFilter } from '$types/nostr'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.snort.social',
]

let relayConnections: Map<string, WebSocket> = new Map()
let subscriptions: Map<string, NostrFilter> = new Map()
let pendingSubscriptions: Array<{ subId: string; filter: NostrFilter }> = []
let seenEventIds: Set<string> = new Set()

export async function initNostr(): Promise<void> {
  // Connect to relays (non-blocking)
  RELAYS.forEach(relay => {
    setTimeout(() => connectToRelay(relay), 0)
  })
}

function connectToRelay(url: string): void {
  try {
    const ws = new WebSocket(url)

    ws.onopen = () => {
      console.log(`✓ Connected to ${url}`)
      relayConnections.set(url, ws)
      
      // Send any pending subscriptions
      for (const { subId, filter } of pendingSubscriptions) {
        const message = ['REQ', subId, filter]
        ws.send(JSON.stringify(message))
      }
      pendingSubscriptions = []
    }

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data)
        await handleRelayMessage(message, url)
      } catch (err) {
        console.error('Failed to parse relay message:', err)
      }
    }

    ws.onerror = (err) => {
      console.error(`✗ Relay error ${url}:`, err)
    }

    ws.onclose = () => {
      console.log(`✗ Disconnected from ${url}`)
      relayConnections.delete(url)
      // Attempt reconnect after 5 seconds
      setTimeout(() => connectToRelay(url), 5000)
    }
  } catch (err) {
    console.error(`Failed to connect to ${url}:`, err)
  }
}

async function handleRelayMessage(message: any, relay: string): Promise<void> {
  if (!Array.isArray(message) || message.length < 2) return

  const [type, subId, data] = message

  switch (type) {
    case 'EVENT':
      if (data && data.id) {
        console.log(`📥 Event from ${relay}:`, data.kind, data.id.slice(0, 8))
        
        // Parse metadata if it's a kind 0 event
        if (data.kind === 0) {
          parseMetadataEvent(data)
        }
        
        // Parse contact list if it's a kind 3 event
        if (data.kind === 3) {
          const { parseContactList } = await import('./feed')
          const { userContacts, contactsOfContacts } = await import('$stores/feed')
          const { currentUser: authUser } = await import('$stores/auth')
          const contacts = parseContactList(data)

          // Get current user
          let user: any = null
          const unsub = authUser.subscribe((u: any) => user = u)
          unsub()

          // If this is the current user's contact list
          if (user && data.pubkey === user.pubkey) {
            userContacts.set(contacts)
            console.log(`📋 Parsed ${contacts.size} contacts for current user`)
          } else {
            // This is a contact-of-contact's list
            contactsOfContacts.update((existing: Set<string>) => {
              return new Set([...existing, ...contacts])
            })
            console.log(`📋 Added contacts-of-contacts from ${data.pubkey.slice(0, 8)}`)
          }
        }
        
        // For posts, fetch author metadata
        if ([1, 6, 16, 30023].includes(data.kind)) {
          const { fetchUserMetadata } = await import('./metadata')
          fetchUserMetadata(data.pubkey)
        }
        
        // Store in IndexedDB
        try {
          await addEvent(data)
        } catch (err) {
          console.error('Failed to add event to DB:', err)
        }
        
        // Add to feed store (only posts, not metadata or contacts)
        if ([1, 6, 16, 30023].includes(data.kind)) {
          // Check if we've already seen this event
          if (seenEventIds.has(data.id)) {
            console.log('⏭️  Skipping duplicate event:', data.id.slice(0, 8))
            break
          }

          seenEventIds.add(data.id)
          const { feedEvents } = await import('$stores/feed')
          feedEvents.update((events: any[]) => [...events, data])
        }
      }
      break

    case 'EOSE':
      console.log(`✓ EOSE from ${relay} (${subId})`)
      isLoadingFeed.set(false)
      break

    case 'NOTICE':
      console.log(`ℹ Notice from ${relay}:`, data)
      break

    case 'OK':
      console.log(`✓ OK from ${relay}:`, subId)
      break

    case 'AUTH':
      console.log(`🔐 AUTH required from ${relay}`)
      break
  }
}

export function subscribe(subId: string, filter: NostrFilter): void {
  subscriptions.set(subId, filter)
  
  console.log(`📡 Subscribing to ${subId}:`, filter)

  const message = ['REQ', subId, filter]
  let sentCount = 0

  for (const ws of relayConnections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message))
        sentCount++
      } catch (err) {
        console.error('Failed to send subscription:', err)
      }
    }
  }

  // If no connections are open, queue for later
  if (sentCount === 0) {
    console.log(`⏳ Queueing subscription ${subId} (no open connections)`)
    pendingSubscriptions.push({ subId, filter })
  } else {
    console.log(`✓ Sent subscription to ${sentCount} relay(s)`)
  }

  isLoadingFeed.set(true)
}

export function unsubscribe(subId: string): void {
  subscriptions.delete(subId)

  const message = ['CLOSE', subId]

  for (const ws of relayConnections.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }
}

export function closeAll(): void {
  for (const ws of relayConnections.values()) {
    ws.close()
  }
  relayConnections.clear()
  subscriptions.clear()
}
