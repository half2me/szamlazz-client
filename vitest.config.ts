import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only run the TypeScript sources, not the compiled copies under dist/.
    include: ['src/**/*.test.ts'],
  },
})
