import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
      '$components': path.resolve(__dirname, './src/components'),
      '$stores': path.resolve(__dirname, './src/stores'),
      '$types': path.resolve(__dirname, './src/types'),
    }
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          'wallet': ['./src/lib/wallet/index.ts'],
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: false
  }
})
