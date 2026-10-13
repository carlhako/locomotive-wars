# Locomotive Wars

A top-down train combat game, being turned from a single-player HTML file into a multiplayer web
game. Many players share one authoritative server world, ram each other's trains, and compete for
a high-score table.

The original single-player game is preserved unchanged at
[`reference/locomotive-wars-v4.html`](reference/locomotive-wars-v4.html) and is the behaviour
reference for the port.

## Requirements

- Node 22 (see [`.nvmrc`](.nvmrc))
- npm 10 or newer (ships with Node 22)

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts the game server and the Vite client together. Open http://localhost:5173.
The client dev server proxies the `/ws` path to the game server on port 3000.

## Scripts

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Server (`tsx watch`) and client (Vite) together      |
| `npm run build`     | Build `shared`, then `server` (`tsc`), then `client` |
| `npm test`          | Run every package's Vitest tests                     |
| `npm run lint`      | ESLint and a Prettier format check                   |
| `npm run typecheck` | `tsc --noEmit` in every package                      |
| `npm run format`    | Rewrite files with Prettier                          |

## Layout

| Package           | Name         | Purpose                                                 |
| ----------------- | ------------ | ------------------------------------------------------- |
| `packages/shared` | `@lw/shared` | Simulation, constants, protocol types. No DOM, no Node. |
| `packages/server` | `@lw/server` | Node game server                                        |
| `packages/client` | `@lw/client` | Browser game, built with Vite                           |

`@lw/shared` is consumed as TypeScript source in development (via a `source` export condition) and
as built output (`dist/`) in production. Lint and the TypeScript config both reject browser and
Node APIs inside it, so the same simulation runs on server and client.

## Roadmap

Work is planned as numbered [OpenSpec](openspec/) changes. Each builds on the one before.

1. **`01-bootstrap-repo-and-scaffold`**: repository, monorepo, tooling, CI (this change).
2. **`02-extract-shared-simulation`**: game rules as a headless, multi-train simulation.
3. **`03-client-renderer-from-snapshots`**: client draws from a self-contained world view.
4. **`04-realtime-server-netcode`**: authoritative server and real-time protocol.
5. **`05-pvp-rules-and-respawn`**: any train can ram any other; immediate respawn.
6. **`06-server-config-and-rounds`**: operator config file, timed rounds, bots.
7. **`07-highscores`**: persistent all-time high-score table.

## License

[MIT](LICENSE)
