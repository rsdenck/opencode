# 0001 — Adopt the official OpenCode client as the integration boundary

- Status: accepted
- Date: 2026-10

## Context

Cowork must run real OpenCode tasks while remaining testable and replaceable.

## Decision

Cowork talks to OpenCode exclusively through `@cowork/opencode-adapter` over the
official `@opencode/client` 2.1.4 SDK (`Service.ensure`, event stream,
permissions, sessions, messages, diffs, diagnostics).

## Consequences

- Integration bugs surface in the engine logic, not in HTTP plumbing.
- Unit tests use fake adapters.
- Real E2E runs against a genuine local OpenCode service.
- Upstream API changes require adapter updates and re-validation.

## Alternatives considered

- Hand-written HTTP client: rejected (drift from protocol, no types).
- Direct coupling of engine to SDK: rejected (untestable).
