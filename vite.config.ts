import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

export default defineConfig({
  plugins: [svelte(), basicSsl()],
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
      '$components': path.resolve(__dirname, './src/components'),
      '$stores': path.resolve(__dirname, './src/stores'),
      '$types': path.resolve(__dirname, './src/types'),
      'assert': path.resolve(__dirname, './src/polyfills/assert.ts'),
    }
  },
  define: {
    'global': 'globalThis',
  },
  optimizeDeps: {
    include: ['monero-ts'],
    esbuildOptions: {
      target: 'esnext',
      define: {
        'global': 'globalThis'
      }
    }
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
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
    strictPort: false,
    fs: {
      allow: ['..']
    }
  },
  worker: {
    format: 'es'
  }
})
