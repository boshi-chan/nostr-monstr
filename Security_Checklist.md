# Security Checklist

## 1. Private Key Storage - Ready for production
- **Nostr logins:** Extensions / Nostr Connect only; no nostr private keys persisted locally.
- **Monero wallet:** Master key is generated per device, encrypted with a user PIN via Argon2id, and stored only in encrypted form. Users must enter the PIN to unlock, and the UI warns that this is a hot wallet.

## 2. XSS / Markdown Sanitization - Ready for production
- Sanitized markdown rendering via marked + DOMPurify.
- CSP tightened (script-src, style-src, img/media/connect restrictions) with a temporary unsafe-eval exception for NDK.
- Action: migrate to an eval-free NDK build to drop that exception.

## 3. Direct Message Encryption - Needs Hardening
- Still using NIP-04 (window.nostr.nip04.encrypt).
- Plan: migrate to NIP-44 + NIP-17 giftwraps (ChaCha20-Poly1305) and keep NIP-04 only for legacy receive.

## 4. Link Preview Fetching - Needs Hardening
- Auto-fetch + NIP-04 malleability enables Vuln.6.
- Require user confirmation + protocol whitelist before fetching remote previews.

## 5. Signature Verification - Needs Hardening
- Relay events aren't verified yet.
- Use erifySignature (nostr-tools) before caching any event; reject invalid/future-dated ones.

## 6. Wallet Seed Backup - Needs Hardening
- Wallet secrets encrypted locally, but relay backup option still exists.
- Remove relay backup. Instead, show seed once with warnings and/or offer user-triggered encrypted exports (iCloud/Drive) only.

## 7. Logging Hygiene - Needs Hardening
- Production code still uses raw console.log.
- Add logger utility (only logs info/debug in dev) and enable drop_console in Vite/Terser builds.

## 8. NWC Secret Storage - Needs Hardening
- NWC connection secrets stored plaintext in localStorage.
- Encrypt secrets with the Argon2id-derived master key before persisting; decrypt only when needed.
