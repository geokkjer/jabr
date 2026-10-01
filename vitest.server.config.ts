import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/__tests__/**/*.test.ts'],
    env: {
      JABR_DB_PATH: ':memory:',
      JABR_BOOKS_PATH: './test-fixtures/books',
      NODE_ENV: 'test',
    },
    setupFiles: ['./server/__tests__/setup.ts'],
  },
})
