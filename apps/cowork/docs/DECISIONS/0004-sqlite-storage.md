# 0004 — SQLite as the local persistence engine

- Status: accepted
- Date: 2026-10

## Context

Cowork needs durable task state, events, artifacts and settings that survive
restarts, with zero external service requirements.

## Decision

Use SQLite through the built-in `node:sqlite` `DatabaseSync` driver
(Node.js >= 22.5), with a migration framework and typed repositories.

## Consequences

- No server dependency or network protocol for persistence.
- `node:sqlite` is flagged experimental; warning suppression via
  `NODE_OPTIONS=--disable-warning=ExperimentalWarning` in scripts/tests.
- Server bundle must preserve the `node:` prefix (`removeNodeProtocol: false`) and
  keep builtins external.

## Alternatives considered

- Embedded better-sqlite3: rejected (additional dependency, ESM/CJS friction).
- JSON file store: rejected (no atomic multi-write transactions).
