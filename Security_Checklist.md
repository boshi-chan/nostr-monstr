# Security Checklist

## 1. Private Key Storage - Ready for production
- **Nostr logins:** Extensions / Nostr Connect only; no nostr private keys persisted locally.
- **Monero wallet:** Master key is generated per device, encrypted with a user PIN via Argon2id, and stored only in encrypted form. Users must enter the PIN to unlock, and the UI warns that this is a hot wallet.

## 2. XSS / Markdown Sanitization - Ready for production
- Sanitized markdown rendering via marked + DOMPurify.
- CSP tightened (script-src, style-src, img/media/connect restrictions) with a temporary unsafe-eval exception for NDK.
- Action: migrate to an eval-free NDK build to drop that exception.

## 3. Direct Message Encryption - Ready for production
- DMs now prefer NIP-44 ChaCha20-Poly1305 by default with automatic fallback to NIP-04 when a peer or signer lacks support, and we track per-partner capabilities so future sends stick with the strongest mode they can handle.
- The receive path accepts both schemes and transparently downgrades partners only if their ciphertext can’t be decrypted as NIP-44.
- Next hardening phase is optional giftwrap (NIP-17) so modern clients unwrap our NIP-44 payloads natively while legacy NIP-04 compatibility remains for incoming messages.

## 4. Link Preview Fetching - Ready for production
- Removed auto-generated link preview cards; links now render as plain clickable anchors with no background fetch, eliminating the Vuln.6 surface.
- No remote metadata is fetched unless the user explicitly opens the link in their own tab/window.

## 5. Signature Verification - Ready for production
- Every relay event (feed, DMs, metadata, search, notifications, Ember totals, thread/reply fetches) now runs through `nostr-tools` `validateEvent` plus a future-skew check before we cache or render it.
- Invalid signatures or events timestamped more than 10 minutes in the future are dropped immediately, preventing forged or replayed data from entering the UI caches.

## 6. Wallet Seed Backup - Ready for production
- Removed relay backup/restore entirely; wallet seeds never leave the device or relays.
- Wallet modal now shows explicit “no remote backup” warnings and offers copy/download actions so users can export the seed offline before clearing storage.
- Recovery is seed-only (just like other hot wallets). Losing the 25-word phrase means losing the small balance, which matches the intended hot-wallet threat model.

## 7. Logging Hygiene - Ready for production
- Added a centralized `$lib/logger` that funnels all logging through a dev-aware helper (info/debug only in dev; warn/error always on).
- Replaced ad-hoc `console.*` usage across the app.
- Enabled Terser `drop_console`/`drop_debugger` so stray console statements get stripped if any sneak in.

## 8. NWC Secret Storage - Ready for production
- NWC connection strings are now encrypted with the same Argon2id/PIN master key as the wallet before they’re written to storage; unlocking prompts for the PIN.
- Secrets only exist in memory once the user unlocks them, and disconnecting clears both decrypted and encrypted copies.
