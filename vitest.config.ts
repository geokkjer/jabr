import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/__tests__/*'],
      // Server tests run via vitest.server.config.ts (node env, in-memory DB).
      // Running them here would execute resetDatabase() against the real
      // dev database in data/ — do not re-add them to this config.
      exclude: [...configDefaults.exclude, 'e2e/**', 'server/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
