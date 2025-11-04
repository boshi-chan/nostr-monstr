/**
 * Application configuration
 */

export const CONFIG = {
  // Nostr relays
  relays: [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine',
  ],

  // Wallet
  wallet: {
    minConfirmations: 10,
    lockTimeoutMs: 5 * 60 * 1000, // 5 minutes
  },

  // Feed
  feed: {
    pageSize: 100,
    maxCacheSize: 10000,
  },

  // Performance
  performance: {
    maxBundleSize: 200 * 1024, // 200kb
    renderTimeout: 50, // ms
  },

  // NIPs supported
  nips: [
    1, 2, 5, 10, 11, 13, 18, 19, 21, 23, 24, 25, 27, 36, 42, 47, 50, 51, 92, 96,
  ],
}
