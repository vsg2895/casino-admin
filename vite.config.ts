import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Vendored shared types live in-repo now (no monorepo cross-dir dependency).
      '@shared/types': fileURLToPath(new URL('./src/shared-types', import.meta.url)),
    },
  },
})
