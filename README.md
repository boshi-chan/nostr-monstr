# Monstr

Monstr is a Svelte + Vite Nostr client with first-class Android (Capacitor) support, built around:

- Timeline feeds: following, circles, trending
- Posting, replies, reposts, zaps, and Monero “Ember” tipping
- Wallet support (create/import, send, sync) with restore height control
- Accessibility focus: labeled actions for screen readers, reduced feed auto-refresh churn
- Android-native niceties: back button navigation, safe-area aware layout, deep links

## Features
- **Feeds**: following, circles, trending, long-reads, livestreams
- **Compose**: post, reply, quote, repost, zap, ember
- **Wallet**: create/import, send, delete; shows restore height and lets you override it
- **Accessibility**: TalkBack-friendly action buttons, reduced focus jumps via “Show new posts” queue
- **Android**: hardware back navigates in-app before exit; safe-area handling for status/nav bars

## Getting Started
```bash
# Install deps
npm install

# Dev
npm run dev

# Build
npm run build

# Type check
npm run check
```

## Routing
Navigation is path-based with history seeding so Android back stays in-app. Use the helpers in `src/lib/navigation.ts` / `src/stores/router.ts` (`navigateTo`, `navigateToPage`, `openPost`, `openProfile`) for any new navigation.

## Wallet Notes
- New wallets default to the current daemon height (no lookback). The restore height is shown in the wallet UI and can be overridden on import.
- Wallet syncing pauses when the app is hidden and resumes on focus; it continues from the last synced height.
- Custom nodes must be HTTPS and CORS-enabled in the current WebView setup.

## Delete Behavior
Deleting your own post emits a NIP-09 delete event and hides it locally. Relay compliance is best-effort.

## Accessibility
- Post actions (reply, like, repost, zap, ember) have explicit labels and hidden text for TalkBack.
- Feed auto-inserts are queued behind a “Show new posts” button to prevent focus jumps.

## License
BSD 3-Clause License © 2025 boshi-chan (boseph). See `LICENSE`.
