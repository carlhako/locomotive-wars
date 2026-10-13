# Proposal

## Why

Locomotive Wars is a single 2,500-line HTML file with no version control, no build, and no tests. Turning it into a multiplayer web server needs a shared codebase for client and server, a public home on GitHub, and CI that keeps every later change honest. This is change 1 of 7 toward the first multiplayer beta; every later change builds on it.

## What Changes

- Initialise git and create a **public** GitHub repository `carlhako/locomotive-wars`, then push the initial commit.
- Set up an npm-workspaces TypeScript monorepo with three packages: `shared` (simulation, constants, protocol types), `server` (Node game server), and `client` (browser game built with Vite).
- Add strict TypeScript config, ESLint + Prettier, and Vitest wired across all workspaces.
- Add root scripts: `dev`, `build`, `test`, `lint`, `typecheck`.
- Add a GitHub Actions workflow running install, typecheck, lint, test, and build on every push and pull request.
- Move the original single-player game to `reference/locomotive-wars-v4.html`, kept unchanged as the behaviour reference for later ports.
- Add `README.md` (what the project is, how to run it, the numbered change roadmap), `.gitignore`, `.nvmrc`, and a license file.

No game behaviour changes in this change.

## Capabilities

### New Capabilities

None. This is repository and tooling setup only; `.openspec.yaml` sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- New repository on GitHub (public, outward-facing).
- New dev dependencies: TypeScript, Vite, Vitest, ESLint, Prettier, tsx.
- Requires Node 22 LTS (installed: v22.23.2).
- Later changes: `02-extract-shared-simulation` depends on the `shared` package existing; `03` and `04` depend on the `client` and `server` packages.
