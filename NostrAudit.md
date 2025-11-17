# Monstr Nostr Audit

Generated: 2025‑11‑16  
Comparators: Amethyst (Android), Primal (web/native), Damus (iOS)

## Quick Scorecard

| Domain | Core NIPs | Status | Evidence |
| --- | --- | --- | --- |
| Identity & Auth | 1, 05, 07, 46 | ✅ Solid NIP‑07 / NIP‑46 flows, ⚠️ no NIP‑05/NIP‑42 verification | `src/lib/auth.ts:47-210`, `src/lib/metadata.ts:153-157`, `src/lib/config.ts:33-36` |
| Relay & Network | 10, 11, 18, 65 | ⚠️ Good NIP‑65 tooling but limited relay heuristics and no NIP‑11/42 | `src/lib/relays.ts:18-137`, `src/lib/ndk.ts:29-78`, `src/lib/feed-ndk.ts:423-598` |
| Feeds & Graph | 10, 18, 23, 32, 36 | ✅ Clean store-driven feeds, ⚠️ narrow time windows and no published list metadata | `src/App.svelte:1-133`, `src/lib/feed-ndk.ts:523-898`, `src/lib/content.ts:1-420` |
| Messaging & Encryption | 4, 17, 44, 59 | ✅ Decrypts NIP‑04/44/giftwrap, ⚠️ 200-message cap, duplicate legacy stack | `src/lib/messaging-simple.ts:38-452`, `src/lib/message-decryption.ts:1-210`, `src/lib/messaging.ts:1-40` |
| Wallet & Zaps | 47, 57 | ✅ Full NWC + zap publishing, ⚠️ LNURL(bech32) + zap receipt coverage missing, Ember (kind 7375) is proprietary | `src/lib/nwc.ts:1-309`, `src/lib/feed-ndk.ts:1125-1194`, `src/lib/wallet/index.ts:653-744` |
| Discovery & Search | 19, 21, 23, 50 | ⚠️ Comprehensive parsers but no relay-backed trending or list support | `src/lib/content.ts:15-420`, `src/lib/nostr-uri.ts:3-108`, `src/lib/search.ts:19-436` |
| Notifications & Engagement | 25, 36, 57 | ✅ Local caching + zap/Ember handling, ⚠️ no push or reporter tooling | `src/lib/notifications.ts:1-496`, `src/stores/notifications.ts:1-124`, `src/lib/engagement.ts:1-153` |

Legend: ✅ = standard achieved, ⚠️ = partial, ❌ = missing.

---

## Detailed Findings

### 1. Identity & Authentication (NIPs 01, 05, 07, 46)

**What works**

- Dual signer support: NIP‑07 browser extensions and NIP‑46 Nostr Connect flows share the same store pipeline and restore path (`src/lib/auth.ts:47-210`). The helper keeps logic in stores per the AI Guidelines (state via `currentUser`, no DOM mutation).
- App-level orchestration honors the “logic belongs in `App.svelte`” rule: initialization and reactive feed switching are centralized (`src/App.svelte:1-133`).
- Session restore hydrates message permissions to avoid signer prompts (`src/lib/auth.ts:138-210` + `src/lib/messaging-simple.ts:28-42`).

**Gaps / spec misses**

- NIP‑05: `getNip05Display` simply returns the string without fetching `.well-known/nostr.json` (`src/lib/metadata.ts:147-157`), so identities are never verified or cached.
- NIP‑42 Auth: `CONFIG.nips` claims support for 42 (`src/lib/config.ts:33-36`), but there are zero references to `nip42`, `AUTH`, or kind `22242` events in the source. Paid/authenticated relays cannot be joined.
- NIP‑05 / profile freshness depends entirely on relay cache; there is no fallback to `nip05` DNS requests nor NIP‑39 backup codes.
- Multi-account flows (like Amethyst’s account switcher) are absent; `currentUser` is single-valued and logout wipes stores without keeping alternate signers.

**Improvements & benchmarks**

1. Implement real NIP‑05 validation with caching and failure surfacing (Primal blocks impersonators at this step).
2. Hook NIP‑42 AUTH challenges into `initNDK`/`subscribeWithFilter` so paid relays (Damus’ model) and auth-required back-ends work.
3. Follow Amethyst by adding account profiles & signer labels, using `settings` persistence for multiple `currentUser` blobs.

### 2. Relays & Network Strategy (NIPs 10, 11, 18, 65)

**What works**

- Relay CRUD honors NIP‑65 and never publishes empty lists, preventing catastrophic wipes (`src/lib/relays.ts:61-110`). Validation enforces `wss://` safety.
- Default relay set mixes Damus/Snort/Primal endpoints and is reused for NIP‑46 URIs (`src/lib/ndk.ts:10-148`).
- `subscribeWithFilter` centralizes NDK subscriptions and couples them to feed labels for clean teardown (`src/lib/feed-ndk.ts:426-470`), satisfying the AI guideline about central logic.

**Gaps / risks**

- Relay health/scoring: there is no backoff per relay, bandwidth accounting, or write read-splitting. Amethyst and Damus both expose relay latencies and allow per-relay toggles.
- NIP‑11 relay information docs are never fetched; the app blindly trusts unknown relays, missing metadata (software, fees, auth flags).
- Subscription windows are extremely narrow (global feed only looks back 2 hours, `src/lib/feed-ndk.ts:846-870`; following feed is 7 days, `src/lib/feed-ndk.ts:523-569`). That keeps UI snappy but misses historical content that Primal and Amethyst fetch via backfill lists.
- No NIP‑65 import from “followed users” – circles are inferred heuristically from tags, but you never read other people’s relay lists to build a social relay graph.
- User-managed relay lists are never applied at runtime: `initNDK()` always boots with the hard-coded `DEFAULT_RELAYS` array (`src/lib/ndk.ts:10-44`), so the relays edited in Settings only publish kind‑10002 metadata but don’t drive subscriptions or publishing. Amethyst/Damus wire the saved list directly into their pools.
- `enableOutboxModel` is disabled (`src/lib/ndk.ts:38-43`), so write relays must be manually added; outbox support (used by Primal) would reduce publish latency.

**Improvements**

1. Add relay probing (NIP‑11 + latency stats) and surface them in `RelaySettings.svelte` so users can curate like Damus.
2. Support per-feed “since” override and optionally fetch historical gaps (Amethyst uses event IDs to backfill).
3. Consider enabling NDK’s outbox model and/or pluggable relay pools to match Primal’s aggregator approach for long-form content.

### 3. Feeds, Graphs & Content Parsing (NIPs 10, 18, 21, 23, 32, 36)

**What works**

- Feed orchestration entirely lives in stores and `App.svelte`, aligning with the AI Guidelines (reactive `$:` block decides subscriptions, `src/App.svelte:63-133`).
- `feed-ndk.ts` supports multiple timelines: global, following, circles-of-circles, and long-form (kind `30023`) (`src/lib/feed-ndk.ts:523-898`). “Circles” builds a graph from p-tags and caches it (`src/lib/feed-ndk.ts:297-360`).
- Content parser handles reposts, nested JSON, NIP‑21 URIs, NIP‑32 labels, and NIP‑36 warnings (`src/lib/content.ts:1-420`), which is ahead of Damus’ still-limited label support.

**Gaps / optimization**

- No published list metadata (NIP‑51) for things like curated long-read authors or circles; everything is inferred at runtime. Amethyst persists curated lists (kind 30000) and lets users share them.
- Spam controls are thin: there is a `isBot` heuristic but no configurable mute lists (NIP‑40) or mention filters.
- Reply depth/pagination: `subscribeToFollowingFeed` requests only `kinds: [1,6,16]` and relies on `feedFilters` for replies, but there is no NIP‑10 thread completion beyond `thread.ts` ad-hoc fetches.
- Long-read feeds limit to 100 events and 30 days (`src/lib/feed-ndk.ts:778-833`); Damus and Primal both use per-author pagination so writers aren’t dropped.

**Improvements**

1. Adopt NIP‑51 list events for “circles”, “trusted long reads”, “mutes”, etc., so the graph travels with the user.
2. Add incremental pagination (store `until` ticks) for each feed akin to Amethyst’s timeline loader.
3. Expose content-warning preferences (Primal lets users opt-in/out per label) by surfacing `getContentWarningLabels`.

### 4. Messaging & Encryption (NIPs 04, 17, 44, 59)

**What works**

- `messaging-simple.ts` can send with preferred scheme (NIP‑44 fallback to NIP‑04) and remembers per-user preferences (`src/lib/messaging-simple.ts:202-260`, `src/lib/dm-crypto.ts:35-133`).
- Giftwrap/gossip decryptor understands multiple layers and properly validates seal recipients (`src/lib/message-decryption.ts:1-210`), matching Amethyst’s approach.
- Warm-up ensures NIP‑04 permissions are granted before UI displays conversation lists (`src/lib/messaging-simple.ts:28-40`), reducing nos2x prompt spam.

**Gaps / tech debt**

- Hard 200-message fetch limit (per direction, `src/lib/messaging-simple.ts:72-80`) and a 60-second “since” window for live subs (`src/lib/messaging-simple.ts:416-425`). Anything older must be manually scrolled and there’s no pagination.
- Duplicate legacy stack: `src/lib/messaging.ts:1-215` still contains the nos2x-specific pipeline, conflicting with the “simple” variant and risking divergence.
- No group chats (NIP‑29) despite placeholder stubs, no mute/inbox controls (NIP‑40), and no ephemeral note support (NIP‑17 send path for giftwrap is disabled).
- Compared to Damus (giftwrap sending) and Amethyst (NIP‑24 message tags, typed conversations), Monstr cannot participate in NIP‑59 sealed DMs beyond decrypting, and there are no DM receipts or read markers.

**Improvements**

1. Delete or refactor `lib/messaging.ts` to avoid two divergent DM stacks; keep everything in the “simple” pipeline.
2. Implement paging (store last event ID per partner) and fetch older DMs like Amethyst does, plus expand `since` for live subs.
3. Offer giftwrap send or at least detect partners that require it, matching Damus nos2x compatibility.

### 5. Wallet, Zaps & Payments (NIPs 47, 57 + Ember extensions)

**What works**

- Full Nostr Wallet Connect implementation: encrypted requests/responses, signer derivation from stored master key, and zap modal integration (`src/lib/nwc.ts:1-309`, `src/stores/nwc.ts:1-129`).
- Zap requests use NIP‑57 kind `9734` events and persist user engagement state (`src/lib/feed-ndk.ts:1125-1194`, `src/lib/engagement.ts:1-119`).
- Custom Ember wallet publishes kind `7375` receipts and auto-syncs Monero addresses into NIP‑01 metadata (`src/lib/wallet/index.ts:653-744` + `src/lib/profile.ts:150-207`), giving the app unique tipping UX.

**Gaps**

- LNURL shortcomings: only Lightning-address format is supported; bech32 LNURLs throw (`src/lib/nwc.ts:214-247`). Primal, Damus, and Amethyst all support bech32 for Zaps.
- Zap receipts (kind `9735`) are read only to update user state; there is no UI for verifying LNURL callbacks or zap splits (NIP‑57 advanced features).
- NIP‑47 errors are surfaced but not categorized (no mapping to codes), and there is no wallet capability discovery beyond `get_info`.
- Ember (kind `7375`) is proprietary. Without an open NIP, other clients (Amethyst, Damus) will treat those events as noise; consider proposing a draft or storing data under existing `NIP-57` tags.

**Improvements**

1. Add bech32 LNURL parsing and fallback relays to match Damus/Amethyst compatibility.
2. Surface wallet capability metadata (like Primal) and allow multiple stored NWC URIs with names.
3. Publish an Ember spec (draft NIP) or map receipts to `kind 9735` to avoid ecosystem fragmentation.

### 6. Discovery & Search (NIPs 19, 21, 23, 50)

**What works**

- Content parser extracts `nostr:` URIs and NIP‑19 entities (`src/lib/nostr-uri.ts:3-108`) and the UI renders them via `NostrURIRenderer.svelte`.
- Search supports notes, npubs, hashtags, and metadata queries, pushes requests via the NIP‑50 `search` field, and orders results heuristically (`src/lib/search.ts:19-436`).
- Long-form authors are derived from follows + circles, so new long reads appear even without aggregator relays (`src/lib/feed-ndk.ts:676-840`).

**Gaps**

- Trending, curated lists, and tag leaderboards are missing. Primal surfaces curated feeds (NIP‑51) and Damus exposes trending hashtags; Monstr relies on manual search.
- Search is bound to whichever relays the user currently connects to. There is no relay selection UI or back-end aggregator for queries; results vary wildly compared to Amethyst’s gossip engine.
- Discovery surfaces (global/following/circles) omit recommended users or note scoring; there is no integration with NIP‑05 lookups, zap totals, or LNURL metadata.

**Improvements**

1. Introduce curated lists (`kind 30000`) for “featured long reads”, “trusted relays”, etc., and ship them like Amethyst’s curated feeds.
2. Offer multi-relay search selection (Primal lets the user pick aggregator endpoints) and show which relays returned hits.
3. Add trending computations (zaps, replies, tags) by reusing engagement snapshots.

### 7. Notifications & Interaction State (NIPs 25, 36, 57)

**What works**

- Notification service deduplicates via hashes, resolves target events lazily, and supports likes, replies, mentions, zaps, reposts, and Ember tips (`src/lib/notifications.ts:1-496`).
- Interaction cache persists likes/reposts/zaps per user in localStorage (`src/lib/interaction-cache.ts:1-119`), mirroring Amethyst’s optimistic UI.
- Feed engagement hydration fetches `kinds 6/7/9735/1` to keep counts accurate (`src/lib/engagement.ts:1-153`).

**Gaps**

- No NIP‑56 reporting or mute list ingestion (NIP‑40). Damus and Amethyst both allow users to file reports and import shared mutes.
- Notifications stay local; there is no push integration (Primal / Damus mobile) and no cross-device sync.
- Zap receipts are tracked only when the user is online; there is no catch-up job to reconcile historical zaps or LNURL callbacks.

**Improvements**

1. Implement NIP‑56 report publishing and display incoming reports with filtering tools.
2. Add NIP‑40 mute list support so blocklists sync across clients.
3. Consider delegating notifications to a worker (or aggregator) to match Damus push behavior.

### 8. Standards Inventory & False Positives

- `CONFIG.nips` lists 1,2,5,10,11,13,18,19,21,23,24,25,27,36,42,47,50,51,92,96 (`src/lib/config.ts:33-36`). In reality:
  - ✅ Implemented: 1/2 (contacts), 7/46 (auth), 10/18 (reply + repost), 19/21 (URI parsing), 23 (long form read), 25 (reactions), 32/36 (labels/warnings), 44 (DM send), 47/57 (wallet), parts of 50 (search).
  - ⚠️ Claimed but absent: 5 (event deletion – no kind `5` publisher), 11 (relay info), 24 (delegation), 27 (text commentary reuse), 42 (auth challenges), 51 (lists), 92 (?), 96 (HTTP file storage).
- There are no references to kind `10000` (mute lists), `22242` (AUTH), `10030+` (Live Activities) or `naddr`-published lists, so the claim should be trimmed or features implemented.

### 9. Alignment with AI Guidelines

- ✅ App logic is centralized: feed subscriptions, wallet hydration, and notifications are all orchestrated via reactive statements in `src/App.svelte:1-180`.
- ✅ Derived stores (feeds, filters, notifications) are used for computed state (`src/stores/feed.ts:1-75`, `src/stores/notifications.ts:1-70`).
- ⚠️ The presence of two DM stacks (`lib/messaging-simple.ts` and `lib/messaging.ts`) breaks the “less code in components” rule and risks reactivity drift.
- ✅ Components such as `Post.svelte` update stores (likes, reposts) instead of touching DOM, aligning with the top-level guidelines.

### 10. Prioritized Next Steps

1. **Identity hardening:** ship NIP‑05 verification + NIP‑42 support, then prune inaccurate NIP claims.
2. **Relay intelligence:** add NIP‑11 metadata fetches, expose relay health metrics, and let users adopt Amethyst-style relay scoring.
3. **List + mute support:** implement NIP‑51 (lists) and NIP‑40 (mute lists) so circles, curated feeds, and blocks travel between Monstr, Amethyst, and Damus.
4. **Messaging cleanup:** remove the legacy DM implementation, add pagination + giftwrap sending, and align with Primal’s background decrypt workers.
5. **Payments polish:** add LNURL bech32 support, zap splits, and document the Ember event format as a draft NIP so other clients can interoperate.
6. **Discovery uplift:** introduce curated/trending feeds via list events and optionally a lightweight indexing worker so Monstr can compete with Primal’s discovery surface.

Delivering on the above will close the biggest compatibility gaps with Amethyst’s gossip resilience, Primal’s discovery tooling, and Damus’ mobile polish while keeping the architecture within the AI Guidelines (logic centralized in stores and `App.svelte`).
