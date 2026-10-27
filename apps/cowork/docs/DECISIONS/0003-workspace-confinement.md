# 0003 — Workspace confinement via registration and path guard

- Status: accepted
- Date: 2026-10

## Context

Autonomous agents can run shell commands; Cowork must prevent access to
arbitrary host paths for tasks.

## Decision

Workspaces are registered with an absolute path and optional allow-list.
All Cowork file APIs resolve within the registered root; traversal/absolute
escapes are rejected; symlink escapes guarded.

OpenCode permission rules are policy layers because the OpenCode process is not
OS-sandboxed.

## Consequences

- Best-effort containment that relies on approval workflow.
- Documented residual risk (OS-level sandbox missing upstream).

## Alternatives considered

- Rely solely on OpenCode sandbox: rejected at the time (not available).
- Docker containerization per task: deferred to roadmap.
