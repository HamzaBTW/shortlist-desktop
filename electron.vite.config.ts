import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    // A sandboxed preload cannot load other files: bundle everything into one.
    build: { externalizeDeps: false, isolatedEntries: true }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@design': resolve(__dirname, 'design') }
    },
    build: {
      // Never inline files as data: URIs; the content security policy allows only 'self'.
      assetsInlineLimit: 0
    }
  }
})
