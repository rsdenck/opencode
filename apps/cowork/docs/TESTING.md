# Testing

## Commands

```bash
npm run verify                  # typecheck + lint + unit tests + build
npm run test                    # all unit tests (excluding real integration by default)
npm run test:unit               # packages + server tests, integration excluded
npm run test:integration       # real OpenCode E2E, gated by COWORK_REAL_OPENCODE=1
npm run smoke                   # black-box smoke against built server
```

## Unit tests

- `@cowork/core`: 13 tests (schemas, state machine, redaction, IDs).
- `@cowork/storage`: 13 tests (migrations, repositories, events, approvals,
  artifacts, usage).
- `@cowork/workspace`: 13 tests (registration, isolation, path guards, snapshots).
- `@cowork/task-engine`: 12 tests (creation, approvals, completion, failures,
  cancellation, resume, recovery).
- `apps/server`: 11 tests (auth, origin, headers, validation, workspaces, task
  API, error handling).

Total: 62 tests / 5 files at v0.1.0 milestone baseline.

## Real OpenCode integration test

`packages/task-engine/test/real-opencode.integration.test.ts` is skipped unless
`COWORK_REAL_OPENCODE=1`. It:

- creates a temporary workspace;
- runs a task via the real adapter against the local OpenCode background
  service (`opencode/big-pickle`);
- answers a real permission request through the real permission API;
- verifies completion, report, artifact and event persistence, and SQLite
  reopen.

```bash
COWORK_REAL_OPENCODE=1 npm run test:integration
```

Observed duration: ~13 seconds in the reference environment.

## Built-server smoke test

`scripts/smoke.mjs` runs against a live built server (started by the maintainer
via the local wrapper script) and performs 28 checks:

- auth (401 without token, token accepted, wrong token rejected),
- security headers and CSP,
- web shell serving and token injection/escaping,
- foreign origin rejection,
- system and catalog endpoints,
- workspace registration, file listing/preview, traversal and absolute-escape
  blocking, typed 404s.

## Adding tests

- Fake adapters for engine/server tests; never mock the real OpenCode client in
  engine unit tests.
- Real E2E only in the gated integration suite.

## Known limitations

- The smoke script requires a running server and a valid token
  (`COWORK_SMOKE_URL`, `COWORK_AUTH_TOKEN`, `COWORK_SMOKE_TASK=0` to skip the
  real task).
- Real E2E requires a reachable OpenCode service and a working provider/model.
