import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Dev tooling (e.g. disk-backed template loading) is enabled under test so
  // the maintainer-facing code paths are exercised. Mirrors the Vite `define`.
  define: {
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/obsidianDom.ts'],
  },
  resolve: {
    alias: {
      '@': '/src',
      src: '/src',
      obsidian: '/tests/mocks/obsidian.ts',
    },
  },
}); 
