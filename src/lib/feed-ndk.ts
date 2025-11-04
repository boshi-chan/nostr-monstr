/**
 * Feed management using NDK with proper Svelte reactivity
 * FIXED for Svelte 4: Using array-based store instead of Map
 */

import { writable, derived, get } from 'svelte/store'
import { getNDK } from './ndk'
import type { NDKEvent, NDKFilter, NDKSubscription } from '@nostr-dev-kit/ndk'
import type { NostrEvent } from '$types/nostr'

// Convert NDK event to our NostrEvent type
function ndkEventToNostrEvent(ndkEvent: NDKEvent): NostrEvent {
  return {
    id: ndkEvent.id,
    pubkey: ndkEvent.pubkey,
    created_at: ndkEvent.created_at || 0,
    kind: ndkEvent.kind || 0,
    tags: ndkEvent.tags,
    content: ndkEvent.content,
    sig: ndkEvent.sig || '',
  }
}

// Fetch author profile in background
async function fetchAuthorProfile(ndk: any, pubkey: string) {
  try {
    const author = ndk.getUser({ pubkey })
    if (!author.profile) {
      await author.fetchProfile()
    }
  } catch (err) {
    // Silently fail - profile fetching is not critical
  }
}

// Feed events store - FIXED: Use array instead of Map for Svelte 4 reactivity
const feedEventsArray = writable<NostrEvent[]>([])

// Derived array for easy iteration with deduplication
export const feedEvents = derived(feedEventsArray, $events => {
  // Deduplicate by event ID
  const seen = new Set<string>()
  const unique = $events.filter(e => {
    if (seen.has(e.id)) {
      console.warn('⚠️ Duplicate event detected:', e.id)
      return false
    }
    seen.add(e.id)
    return true
  })
  return unique.sort((a, b) => b.created_at - a.created_at)
})

// Loading state
export const isLoadingFeed = writable(false)

// User contacts (following list)
export const userContacts = writable<Set<string>>(new Set())

// Contacts of contacts (circles)
export const contactsOfContacts = writable<Set<string>>(new Set())

// Active subscriptions
let activeSubscriptions: Map<string, NDKSubscription> = new Map()
let eventCache: Map<string, NostrEvent> = new Map() // Track events by ID

/**
 * Subscribe to global feed
 * Shows all recent notes from all users
 */
export function subscribeToGlobalFeed() {
  try {
    const ndk = getNDK()

    // Close existing global subscription
    const existingSub = activeSubscriptions.get('global')
    if (existingSub) {
      console.log('⏹️ Stopping existing global subscription')
      existingSub.stop()
    }

    isLoadingFeed.set(true)
    console.log('🌍 Starting global feed subscription')
    console.log('🌍 NDK instance:', ndk ? 'exists' : 'MISSING')

    const filter: NDKFilter = {
      kinds: [1], // Short text notes
      limit: 100,
    }

    console.log('🌍 Subscribing with filter:', filter)
    const subscription = ndk.subscribe(filter, { closeOnEose: false })
    console.log('🌍 Subscription created:', subscription ? 'exists' : 'MISSING')

    let eventCount = 0

    subscription.on('event', (event: NDKEvent) => {
      eventCount++
      console.log(`📥 EVENT #${eventCount}: ${event.id.slice(0, 8)}`)
      
      const nostrEvent = ndkEventToNostrEvent(event)
      
      // FIXED: Check if already have this event
      if (eventCache.has(nostrEvent.id)) {
        console.log('📥 DUPLICATE - skipping')
        return
      }
      
      eventCache.set(nostrEvent.id, nostrEvent)
      
      // FIXED: Update array directly - triggers Svelte reactivity
      feedEventsArray.update(events => {
        // Create new array to trigger reactivity
        const newArray = [...events, nostrEvent]
        console.log(`📥 Array updated: ${events.length} → ${newArray.length} events`)
        return newArray
      })
      
      console.log('📥 Global event:', nostrEvent.id.slice(0, 8), '- Total:', eventCache.size)
    })

    subscription.on('eose', () => {
      console.log('✓ Global feed EOSE - loaded', eventCache.size, 'events')
      console.log('✓ Store check:', get(feedEventsArray).length, 'events in store')
      isLoadingFeed.set(false)
    })

    subscription.on('error', (err: any) => {
      console.error('❌ Global feed error:', err)
      isLoadingFeed.set(false)
    })

    activeSubscriptions.set('global', subscription)
    console.log('🌍 Global subscription registered')
  } catch (err) {
    console.error('❌ Failed to subscribe to global feed:', err)
    isLoadingFeed.set(false)
  }
}

/**
 * Subscribe to following feed
 * Shows notes from users you follow
 */
export function subscribeToFollowingFeed(pubkey: string) {
  console.log('═══════════════════════════════════════')
  console.log('📞 subscribeToFollowingFeed() CALLED')
  console.log('pubkey:', pubkey ? pubkey.slice(0, 8) : 'EMPTY')
  console.log('═══════════════════════════════════════')
  
  try {
    const ndk = getNDK()

    if (!pubkey) {
      console.warn('⚠️ subscribeToFollowingFeed called with empty pubkey')
      subscribeToGlobalFeed()
      return
    }

    // Close existing following subscription
    const existingSub = activeSubscriptions.get('following')
    if (existingSub) {
      console.log('⏹️ Stopping existing following subscription')
      existingSub.stop()
    }

    isLoadingFeed.set(true)
    console.log('👥 Fetching contacts for:', pubkey.slice(0, 8))

    // First, fetch the user's contact list
    const contactListFilter: NDKFilter = {
      kinds: [3], // Contact list
      authors: [pubkey],
      limit: 1,
    }

    const contactListSub = ndk.subscribe(contactListFilter, { closeOnEose: true })

    contactListSub.on('event', (event: NDKEvent) => {
      // Extract pubkeys from tags
      const contacts = new Set<string>()
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1]) {
          contacts.add(tag[1])
        }
      }

      userContacts.set(contacts)
      console.log(`📋 Loaded ${contacts.size} contacts`)

      // Now subscribe to notes from these contacts
      if (contacts.size > 0) {
        const feedFilter: NDKFilter = {
          kinds: [1, 6, 16], // Notes, reposts, generic reposts
          authors: Array.from(contacts),
          limit: 50,
        }

        const feedSub = ndk.subscribe(feedFilter, { closeOnEose: false })

        feedSub.on('event', (event: NDKEvent) => {
          const nostrEvent = ndkEventToNostrEvent(event)
          
          // FIXED: Check if already have this event
          if (eventCache.has(nostrEvent.id)) {
            return
          }
          
          eventCache.set(nostrEvent.id, nostrEvent)
          
          // FIXED: Update array directly
          feedEventsArray.update(events => {
            return [...events, nostrEvent]
          })
          
          console.log('📥 Following event:', nostrEvent.id.slice(0, 8), '- Total:', eventCache.size)
        })

        feedSub.on('eose', () => {
          console.log('✓ Following feed EOSE - loaded', eventCache.size, 'events')
          isLoadingFeed.set(false)
        })

        feedSub.on('error', (err: any) => {
          console.error('❌ Following feed error:', err)
          isLoadingFeed.set(false)
        })

        activeSubscriptions.set('following', feedSub)
      } else {
        console.log('⚠️ No contacts found')
        isLoadingFeed.set(false)
      }
    })

    contactListSub.on('eose', () => {
      const contacts = get(userContacts)
      if (contacts.size === 0) {
        console.log('⚠️ No contacts found, showing global feed')
        isLoadingFeed.set(false)
      }
    })

    contactListSub.on('error', (err: any) => {
      console.error('❌ Contact list fetch error:', err)
      isLoadingFeed.set(false)
    })
  } catch (err) {
    console.error('❌ Failed to subscribe to following feed:', err)
    isLoadingFeed.set(false)
  }
}

/**
 * Subscribe to circles feed (contacts of contacts)
 */
export function subscribeToCirclesFeed(pubkey: string) {
  console.log('═══════════════════════════════════════')
  console.log('📞 subscribeToCirclesFeed() CALLED')
  console.log('pubkey:', pubkey ? pubkey.slice(0, 8) : 'EMPTY')
  console.log('═══════════════════════════════════════')
  
  try {
    const ndk = getNDK()

    if (!pubkey) {
      console.warn('⚠️ subscribeToCirclesFeed called with empty pubkey')
      subscribeToGlobalFeed()
      return
    }

    // Close existing circles subscription
    const existingSub = activeSubscriptions.get('circles')
    if (existingSub) {
      console.log('⏹️ Stopping existing circles subscription')
      existingSub.stop()
    }

    isLoadingFeed.set(true)
    console.log('🔄 Fetching circles for:', pubkey.slice(0, 8))

    // First fetch user's contact list if we don't have it
    let contacts = get(userContacts)

    if (contacts.size === 0) {
      console.log('⚠️ No contacts in store, fetching...')
      
      // Fetch contacts first
      const contactListFilter: NDKFilter = {
        kinds: [3],
        authors: [pubkey],
        limit: 1,
      }

      const contactListSub = ndk.subscribe(contactListFilter, { closeOnEose: true })

      contactListSub.on('event', (event: NDKEvent) => {
        const newContacts = new Set<string>()
        for (const tag of event.tags) {
          if (tag[0] === 'p' && tag[1]) {
            newContacts.add(tag[1])
          }
        }
        userContacts.set(newContacts)
        contacts = newContacts
        console.log(`📋 Loaded ${newContacts.size} contacts for circles`)
      })

      contactListSub.on('eose', () => {
        if (contacts.size === 0) {
          console.log('⚠️ No contacts found for circles feed')
          isLoadingFeed.set(false)
          return
        }
        
        fetchCirclesContent(ndk, contacts)
      })

      contactListSub.on('error', (err: any) => {
        console.error('❌ Contact list fetch error:', err)
        isLoadingFeed.set(false)
      })
    } else {
      console.log(`📋 Using ${contacts.size} existing contacts for circles`)
      fetchCirclesContent(ndk, contacts)
    }
  } catch (err) {
    console.error('❌ Failed to subscribe to circles feed:', err)
    isLoadingFeed.set(false)
  }
}

function fetchCirclesContent(ndk: any, contacts: Set<string>) {
  try {
    // Fetch contact lists of contacts
    const contactListsFilter: NDKFilter = {
      kinds: [3],
      authors: Array.from(contacts),
      limit: 50,
    }

    const circlesContacts = new Set<string>()
    const contactListsSub = ndk.subscribe(contactListsFilter, { closeOnEose: true })

    contactListsSub.on('event', (event: NDKEvent) => {
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1] && !contacts.has(tag[1])) {
          circlesContacts.add(tag[1])
        }
      }
    })

    contactListsSub.on('eose', () => {
      contactsOfContacts.set(circlesContacts)
      console.log(`📋 Loaded ${circlesContacts.size} circles contacts`)

      // Subscribe to their notes
      if (circlesContacts.size > 0) {
        const feedFilter: NDKFilter = {
          kinds: [1, 6, 16],
          authors: Array.from(circlesContacts).slice(0, 100), // Limit to avoid too many authors
          limit: 50,
        }

        const feedSub = ndk.subscribe(feedFilter, { closeOnEose: false })

        feedSub.on('event', (event: NDKEvent) => {
          const nostrEvent = ndkEventToNostrEvent(event)
          
          // FIXED: Check if already have this event
          if (eventCache.has(nostrEvent.id)) {
            return
          }
          
          eventCache.set(nostrEvent.id, nostrEvent)
          
          // FIXED: Update array directly
          feedEventsArray.update(events => {
            return [...events, nostrEvent]
          })
          
          console.log('📥 Circles event:', nostrEvent.id.slice(0, 8), '- Total:', eventCache.size)
        })

        feedSub.on('eose', () => {
          console.log('✓ Circles feed EOSE - loaded', eventCache.size, 'events')
          isLoadingFeed.set(false)
        })

        feedSub.on('error', (err: any) => {
          console.error('❌ Circles feed error:', err)
          isLoadingFeed.set(false)
        })

        activeSubscriptions.set('circles', feedSub)
      } else {
        console.log('⚠️ No circles contacts found')
        isLoadingFeed.set(false)
      }
    })

    contactListsSub.on('error', (err: any) => {
      console.error('❌ Circles contact lists fetch error:', err)
      isLoadingFeed.set(false)
    })
  } catch (err) {
    console.error('❌ Failed to fetch circles content:', err)
    isLoadingFeed.set(false)
  }
}

/**
 * Subscribe to long-form content from your contacts
 */
export function subscribeToLongReads(pubkey?: string) {
  console.log('═══════════════════════════════════════')
  console.log('📞 subscribeToLongReads() CALLED')
  console.log('pubkey:', pubkey ? pubkey.slice(0, 8) : 'undefined/global')
  console.log('═══════════════════════════════════════')
  
  try {
    const ndk = getNDK()

    // Close existing long-reads subscription
    const existingSub = activeSubscriptions.get('long-reads')
    if (existingSub) {
      console.log('⏹️ Stopping existing long-reads subscription')
      existingSub.stop()
    }

    isLoadingFeed.set(true)

    // If pubkey provided, only fetch from contacts
    if (pubkey) {
      console.log('📖 Fetching long-reads from contacts')
      
      const contacts = get(userContacts)
      
      if (contacts.size === 0) {
        console.log('⚠️ No contacts found, fetching all long-reads')
        subscribeToLongReadsGlobal()
        return
      }

      const filter: NDKFilter = {
        kinds: [30023], // Long-form content
        authors: Array.from(contacts),
        limit: 30,
      }

      const subscription = ndk.subscribe(filter, { closeOnEose: false })

      subscription.on('event', (event: NDKEvent) => {
        const nostrEvent = ndkEventToNostrEvent(event)
        
        // FIXED: Check if already have this event
        if (eventCache.has(nostrEvent.id)) {
          return
        }
        
        eventCache.set(nostrEvent.id, nostrEvent)
        
        // FIXED: Update array directly
        feedEventsArray.update(events => {
          return [...events, nostrEvent]
        })
        
        console.log('📥 Long-read event:', nostrEvent.id.slice(0, 8), '- Total:', eventCache.size)
      })

      subscription.on('eose', () => {
        console.log('✓ Long-reads feed EOSE - loaded', eventCache.size, 'events')
        isLoadingFeed.set(false)
      })

      subscription.on('error', (err: any) => {
        console.error('❌ Long-reads feed error:', err)
        isLoadingFeed.set(false)
      })

      activeSubscriptions.set('long-reads', subscription)
    } else {
      subscribeToLongReadsGlobal()
    }
  } catch (err) {
    console.error('❌ Failed to subscribe to long-reads:', err)
    isLoadingFeed.set(false)
  }
}

function subscribeToLongReadsGlobal() {
  try {
    const ndk = getNDK()
    
    const filter: NDKFilter = {
      kinds: [30023], // Long-form content
      limit: 30,
    }

    const subscription = ndk.subscribe(filter, { closeOnEose: false })

    subscription.on('event', (event: NDKEvent) => {
      const nostrEvent = ndkEventToNostrEvent(event)
      
      // FIXED: Check if already have this event
      if (eventCache.has(nostrEvent.id)) {
        return
      }
      
      eventCache.set(nostrEvent.id, nostrEvent)
      
      // FIXED: Update array directly
      feedEventsArray.update(events => {
        return [...events, nostrEvent]
      })
      
      console.log('📥 Long-read event (global):', nostrEvent.id.slice(0, 8), '- Total:', eventCache.size)
    })

    subscription.on('eose', () => {
      console.log('✓ Long-reads feed EOSE (global) - loaded', eventCache.size, 'events')
      isLoadingFeed.set(false)
    })

    subscription.on('error', (err: any) => {
      console.error('❌ Long-reads feed error (global):', err)
      isLoadingFeed.set(false)
    })

    activeSubscriptions.set('long-reads', subscription)
  } catch (err) {
    console.error('❌ Failed to subscribe to long-reads (global):', err)
    isLoadingFeed.set(false)
  }
}

/**
 * Clear feed events
 */
export function clearFeed() {
  feedEventsArray.set([])
  eventCache.clear()
  console.log('🧹 Feed cleared')
}

/**
 * Stop all subscriptions
 */
export function stopAllSubscriptions() {
  for (const subscription of activeSubscriptions.values()) {
    subscription.stop()
  }
  activeSubscriptions.clear()
}

/**
 * Build thread from event
 */
export function buildThread(event: NostrEvent, allEvents: NostrEvent[]): NostrEvent[] {
  const thread: NostrEvent[] = [event]

  // Find replies
  const replies = allEvents.filter(e => {
    return e.tags.some(tag => tag[0] === 'e' && tag[1] === event.id)
  })

  thread.push(...replies.sort((a, b) => a.created_at - b.created_at))

  return thread
}

/**
 * Get replies for an event
 */
export function getReplies(eventId: string, allEvents: NostrEvent[]): NostrEvent[] {
  return allEvents.filter(e => {
    return e.tags.some(tag => tag[0] === 'e' && tag[1] === eventId)
  })
}
