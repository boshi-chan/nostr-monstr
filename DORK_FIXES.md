# 🔧 DORK Fixes - Step-by-Step Solutions

Complete code examples for all 5 critical issues.

---

## 🔴 CRITICAL FIX #1: Remove activeFeedTab Duplication

**Problem**: Two stores control the same thing, can desync.

**Files to Change**: 
- `src/stores/feed.ts` (REMOVE one line)
- `src/stores/feedSource.ts` (NO CHANGE)
- `src/components/pages/Home.svelte` (UPDATE)
- `src/App.svelte` (UPDATE)

### Step 1: Remove from feed.ts

**File**: `src/stores/feed.ts`

```typescript
// BEFORE
export type FeedTab = 'following' | 'circles' | 'global' | 'long-reads'

// Feed events (single timeline for the currently active feed)
export const feedEvents = writable<NostrEvent[]>([])

// Active feed tab
export const activeFeedTab = writable<FeedTab>('global')  // ❌ DELETE THIS LINE

// Loading / error state for the active feed
export const feedLoading = writable(false)
export const feedError = writable<string | null>(null)

// ... rest stays the same
```

**AFTER**:
```typescript
// BEFORE
export type FeedTab = 'following' | 'circles' | 'global' | 'long-reads'

// Feed events (single timeline for the currently active feed)
export const feedEvents = writable<NostrEvent[]>([])

// ❌ DELETED: export const activeFeedTab = writable<FeedTab>('global')

// Loading / error state for the active feed
export const feedLoading = writable(false)
export const feedError = writable<string | null>(null)

// ... rest stays the same
```

### Step 2: Update Home.svelte

**File**: `src/components/pages/Home.svelte`

```typescript
// BEFORE
import {
  activeFeedTab,
  feedEvents,
  feedLoading,
  feedError,
  type FeedTab,
} from '$stores/feed'

import { feedSource } from '$stores/feedSource'

const feedTabs: { id: FeedTab; label: string; icon: typeof UsersIcon }[] = [
  { id: 'following', label: 'Following', icon: UsersIcon },
  { id: 'circles', label: 'Circles', icon: CircleIcon },
  { id: 'global', label: 'Global', icon: GlobeIcon },
]

let activeFeed: FeedTab = 'global'
$: activeFeed = $activeFeedTab  // ❌ REDUNDANT

function setActiveFeed(tab: FeedTab) {
  activeFeedTab.set(tab)  // ❌ REDUNDANT

  if (tab === 'global') feedSource.set('global')
  if (tab === 'following') feedSource.set('following')
  if (tab === 'circles') feedSource.set('circles')
}

onMount(() => {
  setActiveFeed($activeFeedTab)  // ❌ WRONG
})
```

**AFTER**:
```typescript
// AFTER
import {
  feedEvents,
  feedLoading,
  feedError,
  type FeedTab,
} from '$stores/feed'

import { feedSource, type FeedSource } from '$stores/feedSource'

const feedTabs: { id: FeedSource; label: string; icon: typeof UsersIcon }[] = [
  { id: 'following', label: 'Following', icon: UsersIcon },
  { id: 'circles', label: 'Circles', icon: CircleIcon },
  { id: 'global', label: 'Global', icon: GlobeIcon },
]

let activeFeed: FeedSource = 'global'
$: activeFeed = $feedSource  // ✅ USE feedSource

function setActiveFeed(tab: FeedSource) {
  feedSource.set(tab)  // ✅ ONLY set feedSource
}

onMount(() => {
  // ✅ feedSource is already set in stores, no need to set it again
})
```

### Step 3: Update App.svelte

No changes needed! It already uses `$feedSource` correctly.

**Verify**:
```typescript
// App.svelte already has this (correct):
$: if ($isInitialized) {
  const targetFeed = $feedSource  // ✅ Uses feedSource
  // ...
}
```

### Verification

After changes:
1. Run `npm run dev`
2. Click between Global, Following, Circles tabs
3. Verify feed switches correctly
4. Check console for no errors
5. Refresh page - feed should stay on same tab

---

## 🔴 CRITICAL FIX #2: Fix Profile Route originTab

**Problem**: Profile component doesn't receive originTab, can't go back.

**Files to Change**:
- `src/components/Layout.svelte` (UPDATE)
- `src/components/pages/Profile.svelte` (UPDATE)

### Step 1: Update Layout.svelte

**File**: `src/components/Layout.svelte`

```svelte
<!-- BEFORE -->
{:else if $activeRoute.type === 'profile'}
  <Profile pubkey={$activeRoute.pubkey} />
{/if}
```

**AFTER**:
```svelte
<!-- AFTER -->
{:else if $activeRoute.type === 'profile'}
  <Profile 
    pubkey={$activeRoute.pubkey} 
    originTab={$activeRoute.originTab}
  />
{/if}
```

### Step 2: Update Profile.svelte

**File**: `src/components/pages/Profile.svelte`

Add prop:
```typescript
// BEFORE
<script lang="ts">
  export let pubkey: string | undefined = undefined
</script>

// AFTER
<script lang="ts">
  import type { NavTab } from '$stores/nav'
  
  export let pubkey: string | undefined = undefined
  export let originTab: NavTab = 'home'  // ✅ ADD THIS
</script>
```

Use it in back button:
```typescript
// BEFORE
function goBack() {
  goBack()  // From router store
}

// AFTER
import { goBack as routerGoBack } from '$stores/router'

function handleGoBack() {
  routerGoBack()  // Will use originTab from route history
}
```

### Verification

1. Go to Home
2. Click on a user's profile
3. Click back button
4. Should return to Home with feed intact

---

## 🔴 CRITICAL FIX #3: Complete Logout

**Problem**: Logout doesn't clear all stores, old user state persists.

**File**: `src/lib/auth.ts`

```typescript
// BEFORE
export async function logout(): Promise<void> {
  console.log('🚪 logout() called - starting cleanup')

  // Clear NDK signer
  console.log('🚪 Clearing NDK signer')
  logoutNDK()

  // Stop all feed subscriptions and clear feed
  console.log('🚪 Stopping subscriptions and clearing feed')
  const { stopAllSubscriptions, clearFeed } = await import('./feed-ndk')
  stopAllSubscriptions()
  clearFeed()

  // Clear storage
  console.log('🚪 Clearing storage')
  await saveSetting('currentUser', null)
  await saveSetting('authMethod', null)
  await saveSetting('nostrConnectToken', null)

  // Clear store - this triggers reactive updates
  console.log('🚪 Setting currentUser to null (should trigger isAuthenticated = false)')
  currentUser.set(null)
  console.log('🚪 Logout complete - currentUser.set(null) called')
}
```

**AFTER**:
```typescript
export async function logout(): Promise<void> {
  console.log('🚪 logout() called - starting cleanup')

  // Clear NDK signer
  console.log('🚪 Clearing NDK signer')
  logoutNDK()

  // Stop all feed subscriptions and clear feed
  console.log('🚪 Stopping subscriptions and clearing feed')
  const { stopAllSubscriptions, clearFeed } = await import('./feed-ndk')
  stopAllSubscriptions()
  clearFeed()

  // ✅ NEW: Clear all feed state
  console.log('🚪 Clearing all feed state')
  const {
    likedEvents,
    repostedEvents,
    zappedEvents,
    metadataCache,
    userEventIds,
    following,
    circles,
  } = await import('$stores/feed')
  
  likedEvents.set(new Set())
  repostedEvents.set(new Set())
  zappedEvents.set(new Map())
  metadataCache.set(new Map())
  userEventIds.set(new Set())
  following.set(new Set())
  circles.set(new Set())

  // ✅ NEW: Stop notifications
  console.log('🚪 Stopping notifications')
  try {
    const { stopNotificationListener } = await import('$lib/notifications')
    stopNotificationListener()
  } catch (err) {
    console.warn('Failed to stop notifications:', err)
  }

  // Clear storage
  console.log('🚪 Clearing storage')
  await saveSetting('currentUser', null)
  await saveSetting('authMethod', null)
  await saveSetting('nostrConnectToken', null)

  // Clear store - this triggers reactive updates
  console.log('🚪 Setting currentUser to null')
  currentUser.set(null)
  console.log('🚪 Logout complete')
}
```

### Verification

1. Login with user A
2. Like some posts, follow some users
3. Logout
4. Login with user B
5. Verify user B doesn't see user A's liked posts or follows
6. Check console for all cleanup messages

---

## 🔴 CRITICAL FIX #4: Add Feed Error Handling

**Problem**: No timeout or retry logic, UI hangs on slow relays.

**File**: `src/lib/feed-ndk.ts`

Add at the top after imports:

```typescript
// ✅ ADD THESE CONSTANTS
const SUBSCRIPTION_TIMEOUT = 8000 // 8 seconds
const MAX_RETRIES = 2
const RETRY_DELAY = 1000 // 1 second
```

Replace `subscribeToGlobalFeed`:

```typescript
// BEFORE
export async function subscribeToGlobalFeed(): Promise<void> {
  try {
    const ndk = getNDK()
    const now = Math.floor(Date.now() / 1000)

    const sub = ndk.subscribe(
      {
        kinds: [1],
        limit: 100,
        since: now - 86400 * 7,
      },
      { closeOnEose: false }
    )

    activeSubscriptions.update(subs => new Set(subs).add('global'))
    feedLoading.set(true)

    sub.on('event', (event: NDKEvent) => {
      addEventToFeed(event, 'global')
    })

    sub.on('eose', () => {
      console.log('Global feed EOSE')
      feedLoading.set(false)
    })

    subscriptionRefs.set('global', sub)
  } catch (err) {
    console.error('Global feed subscription error:', err)
    feedError.set(String(err))
  }
}
```

**AFTER**:
```typescript
// ✅ NEW: Global feed with retry and timeout
export async function subscribeToGlobalFeed(retryCount = 0): Promise<void> {
  try {
    feedLoading.set(true)
    feedError.set(null)

    const ndk = getNDK()
    const now = Math.floor(Date.now() / 1000)

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Global feed subscription timeout')),
        SUBSCRIPTION_TIMEOUT
      )
    )

    // Create subscription promise
    const subscriptionPromise = new Promise<void>((resolve, reject) => {
      try {
        const sub = ndk.subscribe(
          {
            kinds: [1],
            limit: 100,
            since: now - 86400 * 7,
          },
          { closeOnEose: false }
        )

        activeSubscriptions.update(subs => new Set(subs).add('global'))

        sub.on('event', (event: NDKEvent) => {
          addEventToFeed(event, 'global')
        })

        sub.on('eose', () => {
          console.log('✓ Global feed EOSE')
          feedLoading.set(false)
          resolve()
        })

        sub.on('error', (err: Error) => {
          console.error('✗ Global feed subscription error:', err)
          reject(err)
        })

        subscriptionRefs.set('global', sub)
      } catch (err) {
        reject(err)
      }
    })

    // Race timeout vs subscription
    await Promise.race([subscriptionPromise, timeoutPromise])

  } catch (err) {
    const errorMsg = String(err)
    console.error(`✗ Global feed error (attempt ${retryCount + 1}):`, errorMsg)

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying global feed in ${RETRY_DELAY}ms...`)
      feedError.set(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`)
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return subscribeToGlobalFeed(retryCount + 1)
    }

    // Final error
    feedError.set(`Failed to load global feed: ${errorMsg}`)
    feedLoading.set(false)
  }
}
```

Do the same for `subscribeToFollowingFeed`:

```typescript
export async function subscribeToFollowingFeed(retryCount = 0): Promise<void> {
  try {
    feedLoading.set(true)
    feedError.set(null)

    const user = get(currentUser)
    if (!user?.pubkey) {
      throw new Error('Not authenticated')
    }

    const followingList = get(following)
    if (followingList.size === 0) {
      feedError.set('You are not following anyone yet')
      feedLoading.set(false)
      return
    }

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Following feed subscription timeout')),
        SUBSCRIPTION_TIMEOUT
      )
    )

    const subscriptionPromise = new Promise<void>((resolve, reject) => {
      try {
        const now = Math.floor(Date.now() / 1000)

        const sub = get(getNDK()).subscribe(
          {
            kinds: [1],
            authors: Array.from(followingList),
            limit: 100,
            since: now - 86400 * 7,
          },
          { closeOnEose: false }
        )

        activeSubscriptions.update(subs => new Set(subs).add('following'))

        sub.on('event', (event: NDKEvent) => {
          addEventToFeed(event, 'following')
        })

        sub.on('eose', () => {
          console.log('✓ Following feed EOSE')
          feedLoading.set(false)
          resolve()
        })

        sub.on('error', (err: Error) => {
          console.error('✗ Following feed error:', err)
          reject(err)
        })

        subscriptionRefs.set('following', sub)
      } catch (err) {
        reject(err)
      }
    })

    await Promise.race([subscriptionPromise, timeoutPromise])

  } catch (err) {
    const errorMsg = String(err)
    console.error(`✗ Following feed error (attempt ${retryCount + 1}):`, errorMsg)

    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying following feed in ${RETRY_DELAY}ms...`)
      feedError.set(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`)
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return subscribeToFollowingFeed(retryCount + 1)
    }

    feedError.set(`Failed to load following feed: ${errorMsg}`)
    feedLoading.set(false)
  }
}
```

### Verification

1. Start dev server
2. Open DevTools Network tab
3. Throttle network (slow 3G)
4. Navigate to different feeds
5. Should see "Retrying..." message, then either loads or shows error
6. Should NOT hang forever

---

## 🔴 CRITICAL FIX #5: Add Input Validation

**Problem**: No validation before publishing, empty posts possible.

**File**: `src/lib/feed-ndk.ts`

Find `publishNote` function and update:

```typescript
// BEFORE
export async function publishNote(content: string, replyTo?: NostrEvent): Promise<void> {
  try {
    const user = get(currentUser)
    const ndk = getNDK()

    const event = new NDKEvent(ndk, {
      kind: 1,
      content,
      tags: replyTo ? [['e', replyTo.id]] : [],
    })

    // ... rest of implementation
  } catch (err) {
    console.error('Publish failed:', err)
    throw err
  }
}
```

**AFTER**:
```typescript
// ✅ NEW: Validation function
function validatePostContent(content: string): void {
  if (!content) {
    throw new Error('Post cannot be empty')
  }

  const trimmed = content.trim()
  if (trimmed.length === 0) {
    throw new Error('Post cannot contain only whitespace')
  }

  if (trimmed.length > 5000) {
    throw new Error(`Post exceeds 5000 character limit (${trimmed.length} chars)`)
  }

  // Check for common spam patterns
  const urlCount = (trimmed.match(/https?:\/\//g) || []).length
  if (urlCount > 10) {
    throw new Error('Post contains too many URLs (max 10)')
  }
}

// ✅ NEW: Updated publishNote
export async function publishNote(content: string, replyTo?: NostrEvent): Promise<void> {
  try {
    // ✅ Validate input
    validatePostContent(content)

    // ✅ Check auth
    const user = get(currentUser)
    if (!user?.pubkey) {
      throw new Error('Not authenticated - please log in')
    }

    // ✅ Check NDK
    const ndk = getNDK()
    if (!ndk) {
      throw new Error('NDK not initialized')
    }

    // ✅ Check signer
    if (!ndk.signer) {
      throw new Error('No signer available - please log in again')
    }

    // ✅ Validate reply target if provided
    if (replyTo) {
      if (!replyTo.id) {
        throw new Error('Invalid reply target')
      }
      if (typeof replyTo.id !== 'string' || replyTo.id.length !== 64) {
        throw new Error('Invalid event ID')
      }
    }

    const event = new NDKEvent(ndk, {
      kind: 1,
      content: content.trim(),
      tags: replyTo ? [['e', replyTo.id, '', 'reply']] : [],
    })

    await event.sign(ndk.signer)
    await event.publish()

    console.log('✓ Post published:', event.id)

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('✗ Publish failed:', errorMsg)
    throw new Error(`Failed to publish post: ${errorMsg}`)
  }
}
```

Also update `Compose.svelte` to show validation errors:

```svelte
<!-- BEFORE -->
<script lang="ts">
  let content = ''
  let loading = false
  let error = ''

  async function handleSubmit() {
    if (!content.trim() || loading) return

    try {
      loading = true
      error = ''

      await publishNote(content, replyTo || undefined)

      content = ''
      composeReplyTo.set(null)
      showCompose.set(false)
    } catch (err) {
      error = String(err)
      console.error('Publish failed:', err)
    } finally {
      loading = false
    }
  }
</script>

<!-- AFTER -->
<script lang="ts">
  let content = ''
  let loading = false
  let error = ''
  let charCount = 0  // ✅ ADD
  const MAX_CHARS = 5000  // ✅ ADD

  $: charCount = content.length  // ✅ ADD

  async function handleSubmit() {
    if (!content.trim() || loading) return

    try {
      loading = true
      error = ''

      await publishNote(content, replyTo || undefined)

      content = ''
      composeReplyTo.set(null)
      showCompose.set(false)
    } catch (err) {
      error = String(err)
      console.error('Publish failed:', err)
    } finally {
      loading = false
    }
  }
</script>

<!-- In template, add: -->
{#if error}
  <div class="text-red-400 text-sm mb-2">{error}</div>
{/if}

<!-- Character counter: -->
<div class="text-xs text-text-muted mt-2">
  {charCount} / {MAX_CHARS}
  {#if charCount > MAX_CHARS * 0.9}
    <span class="text-orange-400">(⚠️ Getting close to limit)</span>
  {/if}
</div>

<!-- Disable submit if invalid: -->
<button
  type="button"
  disabled={!content.trim() || loading || charCount > MAX_CHARS}
  on:click={handleSubmit}
>
  {loading ? 'Posting...' : 'Post'}
</button>
```

### Verification

1. Try to post empty message → Error
2. Try to post whitespace only → Error
3. Try to post 5001+ characters → Error
4. Try to post valid message → Success
5. Character counter shows and warns near limit

---

## ✅ Summary: All 5 Fixes

| Fix | File | Changes | Time |
|-----|------|---------|------|
| 1 | feed.ts, Home.svelte | Remove activeFeedTab | 30 min |
| 2 | Layout.svelte, Profile.svelte | Add originTab | 15 min |
| 3 | auth.ts | Complete logout | 20 min |
| 4 | feed-ndk.ts | Error handling + retry | 45 min |
| 5 | feed-ndk.ts, Compose.svelte | Input validation | 30 min |

**Total Time**: ~2.5 hours

---

## 🚀 After All Fixes

Run:
```bash
npm run dev
npm run check  # TypeScript check
```

Test:
- [ ] Login/logout works
- [ ] Feed switching works
- [ ] Profile navigation works
- [ ] Posting works with validation
- [ ] Error messages appear
- [ ] Retry logic works on slow network

Then move to HIGH priority issues!

---
