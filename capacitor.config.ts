import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nostrmonstr.app',
  appName: 'Nostr Monstr',
  webDir: 'dist',
  android: {
    // Prevent content from going under the status bar
    backgroundColor: '#0a0a0a',
  },
  plugins: {
    StatusBar: {
      // Use dark content (light icons) on dark background
      style: 'DARK',
      backgroundColor: '#0a0a0a',
    },
  },
};

export default config;
