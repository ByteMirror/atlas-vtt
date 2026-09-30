import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const alias = {
  '@': '/src',
  src: '/src',
  obsidian: '/tests/mocks/obsidian.ts',
};

export default defineConfig({
  // Dev tooling (e.g. disk-backed template loading) is enabled under test so
  // the maintainer-facing code paths are exercised. Mirrors the Vite `define`.
  define: {
  },
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./tests/setup/obsidianDom.ts'],
          exclude: ['**/node_modules/**', '**/*.gpu.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'gpu',
          include: ['src/**/*.gpu.test.ts'],
          testTimeout: 600_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: 'chromium' } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
