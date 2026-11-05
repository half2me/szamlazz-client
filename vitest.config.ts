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
  // Vite hands esbuild the `target` from tsconfig.json, where @tsconfig/node26 sets es2025, a value
  // the esbuild bundled with Vite 7 does not recognise. Tests run on Node 26 untranspiled, so
  // esnext. Only the test transform reads this; `pnpm build` is tsc and keeps es2025.
  esbuild: { tsconfigRaw: { compilerOptions: { target: 'esnext' } } },
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
          // One request at a time: the demo account is shared and rate limited, and
          // concurrent runs can trip over each other (e.g. "newest receipt for this
          // order number"). Files run one after another, and tests inside a file are
          // already sequential unless marked concurrent.
          fileParallelism: false,
          sequence: { concurrent: false },
        },
      },
    ],
  },
})
