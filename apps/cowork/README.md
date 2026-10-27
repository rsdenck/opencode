# OpenCode Cowork V2

> **Vendored into `rsdenck/opencode` at `apps/cowork/`.** Run it against this fork's checkout with:
>
> ```sh
> cd apps/cowork
> npm ci
> COWORK_OPENCODE_TOKEN="$(opencode service get password)" npm run dev
> ```
>
> The token lets the catalog list the agents of the locally elected OpenCode background service; without it the
> workbench still connects but the agent list stays empty. Provenance and update policy:
> [VENDORED.md](VENDORED.md).

OpenCode Cowork is a local, workspace-oriented agent workbench built on the real
[OpenCode](https://github.com/anomalyco/opencode) V2 engine. It turns OpenCode
sessions into durable tasks: every task has a workspace, a model and agent, a
visible execution timeline, explicit approvals, artifacts, a report and a
persisted history that survives restarts.

This repository contains a working V2 implementation. It is not a mock or a
design prototype: the server talks to an OpenCode V2 service through the official
`@opencode/client` SDK, stores state in SQLite, and the SolidJS web UI is served
by the same authenticated server.

## What works

- **Workspaces**: register local directories, browse files, preview text files,
  and enforce that every path stays inside the registered workspace root.
- **Tasks**: create a task from a prompt, choose provider/model/agent, and watch
  it move through `queued → running → awaiting_approval → completed` (or
  `failed`, `cancelled`, `interrupted`).
- **Approvals**: in `ask` and `strict` modes, mutating and network tools pause
  the task and surface an approval card with the requested action and resources.
  Replies (`once`, `always`, `reject`) are forwarded to OpenCode's permission
  API.
- **Resume**: interrupted and failed tasks can be resumed on the same OpenCode
  session; if the session is gone, Cowork creates a replacement session.
- **Cancellation**: cancelling a task interrupts the real OpenCode session and
  closes all running steps. Late upstream events cannot resurrect a terminal
  task.
- **Persistence**: tasks, steps, approvals, artifacts, event history and
  settings live in SQLite. Active tasks are recovered as `interrupted` after a
  restart.
- **Observability**: an SSE stream plus a persisted event log expose execution,
  tool and permission events. Secrets in payloads and error messages are
  redacted before storage.
- **Security**: token authentication on every `/api/*` route, Origin
  allow-listing, timing-safe token comparison, CSP/security headers, Zod
  validation, request body limits, workspace path and symlink guards.
- **Settings**: default model, default agent, default approval mode, task
  retention.

## Requirements

- Node.js **22.12 or newer** (the project uses the built-in `node:sqlite`
  module, which is available from Node 22.5 and still emits an experimental
  warning).
- npm 10+ (npm workspaces).
- A reachable OpenCode V2 service. Cowork uses `@opencode/client`'s
  `Service.ensure()` to discover or start the shared local background service;
  alternatively set `COWORK_OPENCODE_URL` to an explicit server.
- A model available to that OpenCode service. The tests use
  `opencode/big-pickle`, which works without provider credentials in the
  development environment used for this project.

There is no Bun requirement and Electron is not included in this milestone;
see [docs/ROADMAP.md](docs/ROADMAP.md) for the desktop plan.

## Quick start

```bash
npm install

# Development: Fastify API + Vite dev server for the web UI
npm run dev
```

Open <http://127.0.0.1:5173>. In development the Vite server proxies `/api` to
the Fastify server on port 4319.

Production-style local run:

```bash
npm run build
npm start
```

Open <http://127.0.0.1:4319>. The server prints the data directory and API token
location. The token is generated on first start and written to
`~/.local/share/cowork/auth-token` (mode `0600`), or to
`$COWORK_DATA_DIR/auth-token`. It is injected into the served HTML and used by
the web UI automatically.

To run against an explicit OpenCode server:

```bash
COWORK_OPENCODE_URL=http://127.0.0.1:4096 npm start
```

See [.env.example](.env.example) for every supported environment variable.

## Verification

```bash
npm run verify            # typecheck + lint + 62 unit tests + production build
npm run test:integration  # gated real OpenCode E2E; requires COWORK_REAL_OPENCODE=1
npm run smoke             # API/security/task smoke test against a running server
```

The real integration test and the full smoke test are deliberately gated because
they call an actual model service:

```bash
COWORK_REAL_OPENCODE=1 npm run test:integration
```

Results from the reference environment are recorded in
[docs/TESTING.md](docs/TESTING.md). Do not assume CI has run until the workflows
in `.github/workflows/` have actually executed on GitHub.

## Repository layout

```
apps/server          Fastify API, auth, SSE, static app shell
apps/web             SolidJS web UI
packages/core        domain types, Zod schemas, task state machine, redaction
packages/storage     SQLite database, migrations and repositories
packages/workspace   workspace registration, path isolation, file snapshots
packages/opencode-adapter  the only module that talks to OpenCode
packages/task-engine orchestration, approvals, recovery, persistence
docs                 architecture, security, testing, API, decisions
scripts/smoke.mjs    black-box smoke test for a running built server
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY.md)
- [OpenCode integration](docs/OPENCODE-INTEGRATION.md)
- [HTTP API](docs/API.md)
- [Development](docs/DEVELOPMENT.md)
- [Testing and results](docs/TESTING.md)
- [Roadmap and limitations](docs/ROADMAP.md)
- [Architecture decisions](docs/DECISIONS/)
- [Upstream contribution research](docs/upstream/RESEARCH.md)

## Status and limitations

- Cowork is a **single-user local application**. There is no multi-tenant
  isolation, user accounts, or remote access story beyond the token.
- OpenCode is **not OS-sandboxed** by Cowork. Workspace confinement is a policy
  layer: path guards for Cowork's own file APIs plus OpenCode permission rules.
  A shell command run by the agent can still reach outside the workspace if it is
  approved. Do not run Cowork against untrusted prompts or repositories.
- The UI is a web application. An Electron shell is planned but was not built in
  this milestone because a GUI cannot be validated in the headless environment
  used for development.
- Provider availability, model behavior and cost depend on the configured
  OpenCode service.
- Upstream contribution work is documented separately and must not be assumed to
  be merged or even submitted. See `docs/upstream/`.

## License

MIT. See [LICENSE](LICENSE).
