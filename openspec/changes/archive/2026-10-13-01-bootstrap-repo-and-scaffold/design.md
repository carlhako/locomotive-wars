# Design

## Context

The project directory holds `locomotive-wars-v4-v4.html`, the `openspec/` planning tree, and agent tooling folders (`.claude/`, `.pi/`). It is not a git repository. `gh` is authenticated as `carlhako`. Node v22.23.2 and npm 12 are installed.

## Goals / Non-Goals

**Goals:**
- One repository where client and server import the same TypeScript simulation and protocol types.
- A single command each for dev, build, test, lint, and typecheck, all run by CI.
- The original game preserved as a reference that later changes port from.

**Non-Goals:**
- Any gameplay, rendering, or networking code (changes 02 to 04).
- Deployment, Docker, or hosting (post-beta change 09).

## Decisions

### Monorepo layout with npm workspaces

```
locomotive-wars/
  package.json            workspaces: ["packages/*"], root scripts
  tsconfig.base.json      strict, ES2022, moduleResolution "bundler"
  packages/
    shared/               @lw/shared  - sim, constants, protocol types (no DOM, no Node APIs)
    server/               @lw/server  - Node game server
    client/               @lw/client  - Vite browser app
  reference/
    locomotive-wars-v4.html
  openspec/  .claude/  .pi/
```

- **Why npm workspaces:** npm is already installed and the project needs nothing more than cross-package imports. pnpm or Turborepo add tooling for no benefit at three packages.
- `shared` is consumed as TypeScript source by both sides (Vite compiles it for the client; `tsx` runs it in dev and `tsc` builds it for production). This avoids a separate publish/build step for the shared package during development.
- `shared` must stay environment-neutral: no `window`, `document`, or `node:*` imports. A lint rule (`no-restricted-globals` / `no-restricted-imports`) enforces it so the simulation can run in both the browser and Node.

### TypeScript everywhere

TypeScript over plain JavaScript because the simulation runs on both server and client, and the wire protocol is a contract between them; typed messages catch drift at compile time. `strict: true` from the start: it is far cheaper to begin strict than to tighten later.

### Tooling

| Concern | Choice | Alternative considered |
|---|---|---|
| Client bundler / dev server | Vite | esbuild by hand: more glue, no HMR |
| Server dev runner | `tsx watch` | Node's built-in type stripping: no path aliases or `enum`, so too restrictive |
| Server production build | `tsc` to `dist/` | bundling: unnecessary for a Node service |
| Tests | Vitest (workspace mode) | Jest: slower ESM/TS setup |
| Lint/format | ESLint flat config + typescript-eslint, Prettier | Biome: fine, but less ecosystem coverage for TS rules |

`npm run dev` starts the server (tsx watch) and the client (Vite) together. Vite proxies the WebSocket path to the server so the browser uses one origin in dev, matching production, where the server serves the built client.

### Repository and CI

- `gh repo create carlhako/locomotive-wars --public --source=. --remote=origin --push` after the first commit. Creating a public repo publishes code, so the apply step confirms with the user before running it.
- Commit `openspec/`, `.claude/`, and `.pi/`, which hold the project's planning workflow. Ignore `node_modules/`, `dist/`, `data/` (runtime high-score storage from change 07), `config.json` (local server config from change 06), and `.env*`.
- GitHub Actions workflow `ci.yml`: Node from `.nvmrc`, then `npm ci`, `typecheck`, `lint`, `test`, and `build`, on push and pull_request.

### Reference game

`git mv` is not possible before the first commit, so the original file is moved to `reference/locomotive-wars-v4.html` before the initial commit, keeping it byte-identical. Later changes cite line ranges in it.

## Risks / Trade-offs

- [Shared package consumed as source can leak browser/Node APIs] → Lint restrictions on `packages/shared` plus a Vitest run of the shared tests in a plain Node environment.
- [Public repo exposes anything committed] → `.gitignore` is written before the first commit, and the first commit is reviewed for secrets before pushing.

## Open Questions

- Which license to use (for example MIT, or none, which means all rights reserved). This doesn't affect structure; ask the user at apply time before adding the license file.
