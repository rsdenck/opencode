# OpenCode Integration

## Purpose

This package (`@cowork/opencode-adapter`) is the only place where OpenCode is
used. All integration behavior lives here, behind the `OpenCodeAdapter` interface,
so the task engine is testable with fake adapters and the real engine can run
against the genuine OpenCode V2 service.

## Dependencies

- `@opencode/client` **2.1.4`(official client; also ships`protocol`and
 `schema` packages).

## Capabilities used

| Capability        | Client method                | Cowork usage                            |
| ----------------- | ---------------------------- | --------------------------------------- |
| Service lifecycle | `Service.ensure()`           | discover/start local background service |
| Health            | `client.health()`            | `/api/health` `opencode` block          |
| Events            | `client.event.subscribe()`   | task lifecycle + approvals              |
| Prompt            | `client.session.prompt()`    | task execution                          |
| Interrupt         | `client.session.interrupt()` | cancellation                            |
| Permissions       | `client.permission.*`        | ask/auto/strict mapping + replies       |
| Messages          | `client.session.messages()`  | final report / plan                     |
| Diff              | `client.session.diff()`      | artifact discovery                      |
| Diagnostics       | `client.*`                   | `/api/system/diagnostics`               |

## Event mapping

Persisted event types in the task engine:

`session.execution.started`, `session.execution.succeeded`,
`session.execution.failed`, `session.execution.interrupted`,
`session.step.started`, `session.step.ended`, `session.step.failed`,
`session.tool.called`, `session.tool.success`, `session.tool.failed`,
`session.text.ended`, `permission.asked`, `permission.replied`, plus Cowork
task events (`task.status`, `task.warning`, `task.completed`, `task.failed`,
`task.cancelled`, `task.resumed`).

Adapter events are normalized through an internal `AdapterEvent` shape
(type, data, raw, receivedAt) plus a helper to extract `sessionID`.

## Permission mapping

`packages/opencode-adapter/src/types.ts` exports `permissionsForMode(mode)`:

- `auto` → `{ action: "*", resource: "*" effect: "allow" }`
- `ask` → default allow, plus `edit`, `write`, `shell`, `bash`, `webfetch`,
  `websearch`, `fetch` → `ask`
- `strict` → mutating actions require approval; network actions blocked.

OpenCode runs without an OS sandbox; these rules are policy layers enforced by
the Cowork approval workflow and surfaced through the UI.

## Known integration gaps

- Provider/model availability is listed from the local catalog; availability of
  specific provider credentials is outside Cowork's control.
- The adapter surface is versioned by client major behavior; client 2.1.4 is the
  reference version.

## Upstream research

Findings and candidate improvements live in [upstream/RESEARCH.md](upstream/RESEARCH.md).
