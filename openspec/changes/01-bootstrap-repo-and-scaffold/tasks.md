# Tasks

## 1. Repository layout

- [x] 1.1 Move `locomotive-wars-v4-v4.html` to `reference/locomotive-wars-v4.html` unchanged; verify with `sha256sum` that it matches the original
- [x] 1.2 Add `.gitignore` (node_modules, dist, data, config.json, .env*, coverage) and `.nvmrc` (22); verify `git check-ignore node_modules data config.json` lists all three after `git init`
- [x] 1.3 Create root `package.json` with workspaces `packages/*` and scripts `dev`, `build`, `test`, `lint`, `typecheck`; verify `npm install` succeeds

## 2. Workspaces

- [x] 2.1 Create `packages/shared` (`@lw/shared`) with `src/index.ts` exporting a placeholder constant and one Vitest test; verify `npm test -w @lw/shared` passes
- [x] 2.2 Create `packages/server` (`@lw/server`) with a `src/main.ts` that imports from `@lw/shared` and logs a startup line; verify `npm run dev -w @lw/server` prints it and `npm run build -w @lw/server` emits `dist/`
- [x] 2.3 Create `packages/client` (`@lw/client`) with Vite, an `index.html` with a full-window canvas, and `src/main.ts` importing from `@lw/shared`; verify `npm run build -w @lw/client` succeeds and the dev page loads without console errors
- [x] 2.4 Configure the Vite dev proxy for the `/ws` path to the server port; verify the proxy entry is present (it is exercised in change 04)
- [x] 2.5 Make root `npm run dev` start server and client together; verify both start from one command

## 3. Quality tooling

- [x] 3.1 Add `tsconfig.base.json` (strict) and per-package tsconfigs; verify `npm run typecheck` passes
- [x] 3.2 Add ESLint flat config with typescript-eslint and Prettier, including a rule that rejects DOM globals and `node:` imports in `packages/shared`; verify `npm run lint` passes, and that adding `window` in shared fails it
- [x] 3.3 Add Vitest workspace config; verify root `npm test` runs all package tests

## 4. Docs and license

- [x] 4.1 Write `README.md`: project summary, requirements (Node 22), `npm install` / `npm run dev`, and the numbered change roadmap 01 to 07; verify the documented commands run as written
- [x] 4.2 Ask the user which license to use, then add the `LICENSE` file; verify the file exists and the README names the license

## 5. Git, GitHub, CI

- [x] 5.1 Add `.github/workflows/ci.yml` (Node from `.nvmrc`; `npm ci`, typecheck, lint, test, build on push and pull_request); verify locally that the same command sequence passes
- [x] 5.2 `git init`, create the initial commit, and review the staged file list for secrets or unwanted files; verify with `git status` that the tree is clean
- [ ] 5.3 Confirm with the user, then run `gh repo create carlhako/locomotive-wars --public --source=. --remote=origin --push`; verify `gh repo view carlhako/locomotive-wars` shows a public repo with the commit
- [ ] 5.4 Verify the first CI run on GitHub passes (`gh run list --limit 1`)
