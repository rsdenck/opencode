# Security Policy

## Supported versions

This is a V0.x local prototype. Security fixes are applied to the latest
commit on `main`.

## Reporting a vulnerability

Email the maintainer at the address listed in the repository profile, or open a
private security advisory on GitHub.

Please include reproduction steps, affected component and impact.

## Security model

1. **Authentication** — every `/api/*` route requires a token presented either
   as `x-cowork-token` or `Authorization: Bearer <token>`. Comparison is
   timing-safe.
2. **Token handling** — generated token stored in the data directory with mode
   `0600`; injectable via `COWORK_AUTH_TOKEN`. Served into the web UI only via
   an escaped HTML attribute.
3. **Transport** — the server binds to loopback by default; refusing to bind to
   a non-loopback address requires `NODE_ENV=production` and a strong token.
4. **Origin** — state-changing and `/api` requests are checked against an
   allow-list of origins (loopback defaults plus `COWORK_ALLOWED_ORIGINS`).
5. **Headers** — `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
   `X-Frame-Options: DENY`, CSP (`default-src 'self'; script-src 'self';
   style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';
   object-src 'none'; base-uri 'none'; frame-ancestors 'none'`).
6. **Validation** — Zod schemas for all request bodies and queries, Fastify body
   limits, prompt length and snapshot size limits.
7. **Path safety** — workspace file listing/preview resolve within the
   registered workspace root; traversal attempts and absolute paths outside the
   root are rejected. Symlink escapes are guarded.
8. **Secret redaction** — OpenCode payloads and error messages are redacted and
   truncated before being persisted or returned.

## Threat model and residual risks

- The OpenCode process itself is **not** OS-sandboxed. Cowork permission rules
  (`ask` / `auto` / `strict`) are policy for the agent, not an OS boundary. A
  user approving a shell tool grants process-level access to the host.
- The API token is stored locally and is equivalent to full control of the local
  Cowork data directory; protect the host accordingly.
- The web UI is served from the same origin as the API; there is no
  cross-origin split in this milestone.

See [docs/SECURITY.md](docs/SECURITY.md) for the full model and checklist.
