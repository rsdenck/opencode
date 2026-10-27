# Roadmap

## Shipped (v0.1.0 milestone)

- Local task workbench on top of OpenCode V2 (engine, approvals, resume,
  cancel, artifacts, events, reports).
- SQLite persistence (schema v3).
- Fastify API + SolidJS UI, authenticated and hardened.
- Unit tests (62), real OpenCode integration test (gated), built-server smoke
  (28 checks).
- Documentation, CI workflows and release pipeline (this milestone).

## Planned

- **Electron shell**: desktop packaging of the web UI. Blocked on headful
  validation tooling; will be added only when testable headlessly or via Xvfb.
- **Remote access**: reverse-proxy friendly deployment, optional remote auth.
- **Multi-workspace orchestration**: parallel task queues, task groups.
- **Human-in-the-loop UI polish**: inline diffs in approvals, decision expiry
  defaults.
- **OpenCode upstream features**: session diff rendering, tool approval
  streaming refinements, sandbox integration.

## Out of scope (explicitly)

- Cowork as a general-purpose SaaS multi-tenant product.
- Replacing OpenCode's own permission engine.

See [docs/ROADMAP.md](ROADMAP.md) for the tracked milestone list.
