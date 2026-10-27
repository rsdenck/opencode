# 0005 — Web-first delivery, Electron deferred

- Status: accepted
- Date: 2026-10

## Context

The product needs a local UI; delivery vehicle choice was open.

## Decision

Deliver the first working product as a web application served by the Fastify
server, with a Vite/SolidJS SPA. Defer Electron packaging until there is a
headless-testable or Xvfb-based validation path.

## Consequences

- No desktop artifact in this milestone; documented limitation.
- Future desktop work should reuse the same API server.

## Alternatives considered

- Electron from the start: rejected (cannot be validated headlessly in this
  environment; GUI claims would be unverifiable).
