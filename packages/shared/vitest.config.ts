import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'shared',
    // The simulation must run with no DOM; keep its tests in plain Node.
    environment: 'node',
  },
});
