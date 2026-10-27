# Architecture

This document describes the OpenCode Cowork V2 architecture.

## Overview

Cowork is a layered application:

```
Web UI (SolidJS)  ->  Fastify HTTP API  ->  TaskEngine  ->  Adapter  ->  OpenCode
                                                                 |
                                                                 v
                                                        SQLite (node:sqlite)
```

- **Web UI** (`apps/web`): SolidJS SPA built with Vite, served as static files
  by the Fastify server in production. Talks only to `/api/*`.
- **HTTP API** (`apps/server`): Fastify application with typed error responses,
  authentication, SSE event stream and static serving.
- **Task engine** (`packages/task-engine`): orchestration. Lifecycle phases,
  approvals, resume/cancel, restart recovery, artifact collection, event
  persistence, subscription to adapter events.
- **OpenCode adapter** (`packages/opencode-adapter`): the single integration
  point. All OpenCode calls (service health, sessions, prompt, interrupt, event
  stream, permissions, messages, diff, diagnostics) go through it.
- **Storage** (`packages/storage`): SQLite via the built-in `node:sqlite`
  `DatabaseSync` driver, migrations and repositories.
- **Workspace** (`packages/workspace`): registration, listing, snapshots and
  path safety.
- **Core** (`packages/core`): domain types, Zod schemas, task state machine and
  redaction helpers.

## Task lifecycle

Phases: `prepare → analyze → execute → verify → finalize`.

Statuses: `queued → planning → running → awaiting_approval → completed`,
with terminal states `failed`, `cancelled`, `interrupted`.

Transitions are asserted in the state machine (`packages/core/src/state-machine.ts`).

A task moves through phases over persisted steps:

1. `prepare` — validate workspace and connect to OpenCode.
2. `analyze` — build an execution plan; first assistant message holds the plan.
3. `execute` — run the OpenCode session with authorized tools.
4. `verify` — verify produced results.
5. `finalize` — collect report and artifacts.

When the OpenCode execution succeeds, the newest assistant message is used as
the final report; plan and report are persisted with usage/cost data.

Approvals expire when a task reaches a terminal state; late events from the
upstream stream are ignored for terminal tasks, which prevents resurrection of
cancelled or failed work.

## Adapter isolation

The engine never imports `@opencode/client` directly. All outbound calls and
events pass through `OpenCodeAdapter`, which:

- resolves or starts the OpenCode service via `Service.ensure()`;
- wraps event subscription with reconnect/backoff;
- maps permission modes to OpenCode permission rules
  (`ask`, `auto`, `strict`);
- exposes typed summaries (`AgentSummary`, `ProviderSummary`, `ModelSummary`,
  `SkillSummary`, `McpSummary`, `SessionSummary`, `AssistantMessageSummary`).

This is what keeps Cowork testable (fake adapters in unit tests) while the real
integration test exercises the genuine service.

## Persistence schema (v3)

Tables: `tasks`, `task_steps`, `task_events`, `approvals`, `artifacts`,
`workspaces`, `settings`, `task_usage`.

Events are append-only with a monotonically increasing `seq` per task and are
redacted and truncated before storage.

## Security boundaries in the request path

See [SECURITY.md](SECURITY.md).

## Build pipeline

- Web: Vite + SolidJS, output to `apps/web/dist`.
- Server: `tsup` bundles `apps/server/src/index.ts` to ESM with:
  - `removeNodeProtocol: false` (preserve `node:` prefixed builtins such as
    `node:sqlite`),
  - `skipNodeModulesBundle: true` (externalize CommonJS-only packages like
    `@fastify/static` that use dynamic `require`, unsupported in ESM bundles),
  - `noExternal: [/^@cowork\//]` (workspace packages are consumed from their
    TypeScript sources).

## Failure modes and error codes

Errors thrown as `CoworkError` map to typed JSON responses via `toPublicError`
(`unauthorized`, `origin_not_allowed`, `validation_error`, `task_not_found`,
`workspace_not_found`, `model_not_found`, `workspace_root_not_allowed`,
`unsafe_binding`, …).

## Extension points

- Add an API route: Fastify plugin + engine/store call + tests + docs.
- Add a UI feature: SolidJS view component + API client method + store wiring +
  tests.
- Add an upstream OpenCode improvement: adapter mapping + integration test.
