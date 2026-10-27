# Development

## Prerequisites

- Node.js >= 22.12.0
- npm (workspaces enabled)
- OpenCode V2 service reachable (local background service by default; or set
  `COWORK_OPENCODE_URL`).

## Getting started

```bash
npm install
npm run dev        # Fastify dev server on 4319 + Vite web dev server on 5173
```

Open <http://127.0.0.1:5173>.

Production-like local run:

```bash
npm run build
npm start          # serves web dist from apps/web/dist on 4319
```

## Environment variables

See [.env.example](../.env.example). Highlights:

- `COWORK_HOST`, `COWORK_PORT`, `COWORK_DATA_DIR`, `COWORK_WEB_DIR`,
  `COWORK_ALLOWED_ORIGINS`, `COWORK_ALLOWED_WORKSPACE_ROOTS`,
  `COWORK_MAX_PROMPT_CHARS`, `COWORK_MAX_FILES`, `COWORK_MAX_RESPONSE_BYTES`,
  `COWORK_AUTH_TOKEN`, `COWORK_OPENCODE_URL`, `COWORK_OPENCODE_TOKEN`,
  `COWORK_OPENCODE_SERVICE`, `COWORK_TRUST_PROXY`, `COWORK_LOG_LEVEL`,
  `NODE_ENV`.

## Tooling

- TypeScript 5 (project references via `tsconfig.base.json`).
- Biome for lint/format.
- Vitest for unit tests; `vitest.integration.config.ts` for the gated real E2E.
- tsup for the server bundle; Vite for the web app.

## Code layout conventions

- `@cowork/*` packages import each other by name; workspace protocol `*` for
  cross-package deps.
- Server bundle keeps workspace packages source-imported; do not move runtime
  imports into compiled package entrypoints unless bundling is updated.

## Adding a feature checklist

1. Types/schemas in `@cowork/core`.
2. Storage changes with migration if needed (schema version bump).
3. Engine logic + state machine transition tests.
4. Adapter mapping when external behavior changes.
5. Fastify route + error handling + tests in `apps/server/test`.
6. Web client + view component wiring.
7. Docs: API.md, SECURITY.md if relevant, TESTING.md results.
8. CHANGELOG entry.

## Release checklist

- `npm run verify` green.
- Version bump in root `package.json`, `COWORK_VERSION`, package versions.
- Tag `vX.Y.Z`.
- GitHub release from tag (workflow).
