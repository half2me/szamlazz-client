import { defineConfig } from 'vitest/config'

/*
 * Two suites, split by file name:
 *
 * - unit (`*.test.ts`): no network. Fixtures and pure logic; fast enough for every save and every push.
 * - live (`*.live.test.ts`): issues and reverses real documents on szamlazz.hu's demo account. Needs
 *   network access and takes a minute or two.
 *
 * `pnpm test` runs unit, `pnpm test:live` runs live, `pnpm test:all` runs both.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          // Only the TypeScript sources, not the compiled copies under dist/.
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.live.test.ts'],
        },
      },
      {
        test: {
          name: 'live',
          include: ['src/**/*.live.test.ts'],
          testTimeout: 30000,
        },
      },
    ],
  },
})
