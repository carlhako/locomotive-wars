import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Consume @lw/shared as TypeScript source (see its package.json "exports").
    conditions: ['source'],
  },
  ssr: {
    resolve: {
      conditions: ['source'],
    },
  },
  test: {
    name: 'server',
    environment: 'node',
  },
});
