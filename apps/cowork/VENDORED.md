# Vendored: OpenCode Cowork

This directory is a **vendored snapshot** of [rsdenck/cowork](https://github.com/rsdenck/cowork), embedded into
`rsdenck/opencode` so the workbench ships with the fork it drives.

| Field                                                                                     | Value |
| ----------------------------------------------------------------------------------------- | ----- |
| Source repo      `https://github.com/rsdenck/cowork.git`                                  |
| Source commit    `8a099cc` (`docs: add upstream research and contribution documentation`) |
| Vendored on      `2026-10-27`                                                             |
| License          MIT (see `LICENSE` in this directory)                                    |

## Why vendored instead of a workspace package

The upstream Cowork is a standalone Node application:

- npm workspaces with its own `package-lock.json`,
- `node:sqlite` (Node 22.12+), `tsx`, `tsup`, `vitest`, `biome`,
- a SolidJS web UI served by its own authenticated server.

The opencode monorepo is a Bun workspace (`packages/*`, `packages/plugins/*`, `services/*`, …) pinned to
`bun@1.4.4`. Folding Cowork into those workspaces would force a toolchain migration (bun:sqlite, bun test, catalog
versions) with no benefit: Cowork talks to OpenCode **through the official `@opencode/client` SDK**, so it stays a
loose coupling by design. It is therefore embedded at `apps/cowork/`, which is outside every root workspace glob and
keeps its own lockfile, CI and tests.

`@opencode/client` is pinned at `2.1.4` — the same version as this fork.

## Running it against this repository

```sh
cd apps/cowork
npm ci
npm run dev            # server on :8787 (default) + web UI
```

Then register the fork checkout as a workspace (UI → Workspaces, or the API) and point it at this repository, for
example `/opt/opencode-repo`. Tasks created there run through the locally elected OpenCode service; set
`COWORK_OPENCODE_URL` to override discovery.

## Updating the vendored copy

1. In a checkout of `rsdenck/cowork`, make or pull the changes and commit.
2. Copy the tree over this directory (keep `.git` out), update the table above with the new source commit.
3. `cd apps/cowork && npm ci && npm run verify` — typecheck, lint, tests and build must pass before committing.

Do not edit vendored files casually: either change them here **and** upstream, or note the divergence in this file.

## Divergences from upstream

- `tsconfig.json` includes `packages/*/test/**` and `apps/server/test/**`, and the two `waitFor` test helpers plus the
  fake adapter's `diffEntries` were adjusted, so `npm run typecheck` covers the tests. Upstream compiled tests without
  typechecking them, which also made Vite resolve tsconfigs from outside this directory when nested in a parent
  monorepo.
- `README.md` gained the vendored run instructions at the top.

## Verified in this fork (2026-10-27, Node 24.21)

```sh
cd apps/cowork
npm ci                 # 243 packages
npm run typecheck      # clean (tests included)
npm run test:unit      # 5 files, 62 tests passed
npm run build          # server + web built
npm run lint           # biome clean
```

Live smoke against the fork's own background service:

```sh
COWORK_DATA_DIR=<dir> node apps/server/dist/index.js &
COWORK_DATA_DIR=<dir> COWORK_SMOKE_URL=http://127.0.0.1:4319 COWORK_SMOKE_TASK=0 \
  COWORK_OPENCODE_TOKEN="$(opencode service get password)" node scripts/smoke.mjs
# 21/21 checks passed
```
