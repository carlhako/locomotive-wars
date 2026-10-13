import { defaultClientConditions, defineConfig } from 'vite';

// Dev server port for the game server; replaced by real server config in change 06.
const SERVER_PORT = 3000;

export default defineConfig({
  resolve: {
    // Consume @lw/shared as TypeScript source (see its package.json "exports").
    conditions: ['source', ...defaultClientConditions],
  },
  ssr: {
    // Vitest resolves through the SSR conditions; keep tests on the same source.
    resolve: { conditions: ['source'] },
  },
  server: {
    proxy: {
      '/ws': {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
});
