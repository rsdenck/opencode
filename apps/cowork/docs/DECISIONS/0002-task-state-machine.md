# 0002 — Task lifecycle state machine

- Status: accepted
- Date: 2026-10

## Context

Autonomous task execution needs explicit, persisted, enforceable transitions to
support approvals, cancellation, resume and restart recovery.

## Decision

Tasks move through phases (`prepare`, `analyze`, `execute`, `verify`, `finalize`)
and statuses (`queued`, `planning`, `running`, `awaiting_approval`, `completed`,
`failed`, `cancelled`, `interrupted`) via an asserted state machine in
`@cowork/core`.

## Consequences

- Terminal states cannot be mutated except through explicit recovery paths.
- Late upstream events after cancellation/failure are ignored.
- Approvals pending when a task reaches a terminal state expire.

## Alternatives considered

- Ad-hoc status strings without transitions: rejected (invalid states allowed).
- Event-driven status inference only: rejected (no enforcement).
