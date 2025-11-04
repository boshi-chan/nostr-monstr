AI Guidelines for Monstr (Svelte + Nostr)
1) NEVER break reactivity

Do not manipulate DOM directly (document.getElement… etc).

Always update UI state via Svelte stores.

When something needs to change UI → update store value.

Example:

feedSource.set('global')


NOT:

someVar = 'global' // without store

2) Do not key lists by values that may repeat

Svelte crashes if keyed values duplicate.

BAD:

{#each images as image (image)}


GOOD:

{#each images as image, i}

3) App logic lives in App.svelte

feed subscriptions

reacting to logout

switching global/following

MUST use reactive statements ($:) in App.svelte.

4) “Feature pages” do NOT subscribe directly

Home.svelte ONLY writes to stores:

feedSource.set('global')


App.svelte actually runs the feed.

5) Logout MUST:

stop subscriptions

clear feed store

set currentUser to null

6) All initialization goes in App.svelte onMount

initDB()

initNDK()

restoreSession()

default subscribeToGlobalFeed()

7) LESS code in components

Components should:

take data from stores

show interface

call store setters on click

Summary

State → stores
Logic → App.svelte
UI → components

NEVER directly call feed subscriptions from random components.
NEVER key lists by value that can repeat.

Files we touched
1) MediaRenderer.svelte

WHAT we changed:
We removed keyed each blocks (image) / (video) / (embed) and replaced them with indexes.

WHY:
Svelte breaks when two same URLs appear → then reactive system silently dies → whole app stops updating until refresh.
Fixing this fixed everything else.

2) Home.svelte

WHAT we changed:
We removed the feed subscriptions from Home and instead just set a store called feedSource.

WHY:
Home should NOT control subscriptions. It should only tell the app “we want global” or “we want following”.
This makes switching tabs clean and reactive.

3) App.svelte

WHAT we changed:
We added reactive subscriptions based on $feedSource and $isAuthenticated.

WHY:
App is the “root singleton”.
It is the ONLY place that should call:

subscribeToGlobalFeed

subscribeToFollowingFeed

stopAllSubscriptions

clearFeed

This is the brain.

4) added: feedSource.ts (store)

WHAT it does:
Small store with 'global' | 'following'

WHY:
A single store is the controlled switch for feed type.
App watches it and responds instantly.

Effect of these fixes

feed switching now works without refresh

logout now works without refresh

app no longer freezes when duplicate media URLs arrive

architecture is now sane and maintainable

One sentence summary

We removed direct logic from Home, centralized feed subscriptions in App, and fixed a Svelte crash in MediaRenderer that was silently killing all reactivity.