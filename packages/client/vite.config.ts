import { defaultClientConditions, defineConfig } from 'vite';

// Where `npm run dev` finds the game server: the server's default port (change 06 adds config).
const SERVER_PORT = 8080;

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
