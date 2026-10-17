import { defaultClientConditions, defineConfig } from 'vite';

// Where `npm run dev` finds the game server: the PORT the server is started with (as in the
// server's own `PORT` override), else its default.
const SERVER_PORT = Number(process.env.PORT ?? 8080);

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
      '/api': `http://localhost:${SERVER_PORT}`,
      '/ws': {
        target: `ws://localhost:${SERVER_PORT}`,
        ws: true,
      },
    },
  },
});
