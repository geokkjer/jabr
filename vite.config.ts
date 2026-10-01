import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [vue(), tailwindcss(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // The server bundle lives in dist/server and is emitted by esbuild, not
    // Vite. Vite empties its outDir by default, so a client-only build
    // (`pnpm build-only`) would silently delete the server entry point and
    // leave `node dist/server/index.js` unable to start. `pnpm build` runs
    // the client first, which only masks this.
    emptyOutDir: false,
  },
})
