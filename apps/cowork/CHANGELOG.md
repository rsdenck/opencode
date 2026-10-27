# Changelog

All notable changes to OpenCode Cowork V2 are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Task engine: full lifecycle phases (`prepare`, `analyze`, `execute`,
  `verify`, `finalize`), persisted step tracking, task events, and task
  summaries/plans.
- OpenCode adapter over the official `@opencode/client` SDK (`Service.ensure`,
  event subscribe, permissions, sessions, messages, diffs, diagnostics).
- Approvals: `ask`, `auto` and `strict` modes, pending/approved/rejected/
  expired states, and idempotent permission event handling.
- Persistence layer on SQLite via `node:sqlite` with migrations through
  schema v3 (tasks, steps, approvals, artifacts, events, workspaces,
  settings, usage).
- Fastify HTTP API: health, system, catalog, workspaces, tasks, approvals,
  settings, events (SSE), web static serving, typed error responses.
- Security: token auth (header or bearer), Origin allow-list, timing-safe
  token comparison, security headers, CSP, Zod validation, body limits, prompt
  length limits, workspace path and symlink guards, secret redaction in events
  and errors.
- SolidJS web UI: dashboard, task list, task detail (timeline, live output,
  report, plan, approvals, artifacts, conversation, events), workspaces, settings.
- Real OpenCode integration test (gated with `COWORK_REAL_OPENCODE=1`).
- Built-server smoke test (`npm run smoke`) against the tsup bundle.

### Fixed

- Late OpenCode events can no longer mutate tasks that reached a terminal
  state after cancellation, failure or completion.
- Approvals pending on a task are expired when the task completes, fails,
  cancels or is interrupted.
- Malformed JSON request bodies now return HTTP 400 with a typed error instead
  of an internal error.
- Built server bundle correctly preserves `node:sqlite` and externalizes
  CommonJS-only dependencies (`@fastify/static`) that cannot be bundled into ESM.

### Security

- Refuse to bind to a non-loopback host unless `NODE_ENV=production` and a
  strong auth token are configured.

## [0.1.0] - Unreleased

First public milestone of the local OpenCode Cowork V2 implementation.

- Core domain, task state machine and validation: implemented and unit tested.
- Storage: SQLite persistence with migrations, repositories and usage records.
- Workspace isolation: registration, listing, snapshots, path guards.
- Task engine: creation, plan, execution via OpenCode, approvals, resume,
  cancel, recovery, artifact collection.
- Server and UI: authenticated Fastify API and SolidJS web app.
- Quality gates: typecheck, Biome lint, unit tests, production build, real E2E
  (gated), built-server smoke (28 checks).
