# Security

See also the root-level policy summary in [SECURITY.md](../SECURITY.md).

## Threat model

- Local single-user host running the Cowork server and the OpenCode service.
- Assets at risk: task prompts, workspace files, API token, persisted task data,
  generated artifacts.

## Controls implemented

### Authentication and transport

- Token required on all `/api/*` routes.
- Timing-safe comparison; constant-length buffer handling.
- Token stored at rest with `0600` inside the data directory; env override for
  development.
- Token injected into served HTML only through an HTML-escaped attribute, never
  as a cookie or URL parameter.

### Binding

- Default loopback binding only; refuses non-loopback without
  `NODE_ENV=production`; refuses loopback-less tokens shorter than 24 bytes when
  binding off-loopback.

### Network origin

- Origin allow-list enforced for API traffic; browser-style cross-origin requests
  are rejected with `origin_not_allowed`.

### Response headers

- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `X-Frame-Options: DENY`, CSP restrictive, no frame ancestors, no object/base.

### Validation and limits

- Zod validation on workspace/task/approval/settings inputs and queries.
- Fastify body limit (default 1 MiB max), prompt max length (default 20k),
  snapshot/file count and response size limits.

### Filesystem

- Workspace registration requires absolute paths; optional allow-list
  (`COWORK_ALLOWED_WORKSPACE_ROOTS`) for additional roots.
- File APIs resolve within the registered workspace root; traversal and
  absolute-escape attempts return `path_traversal`.
- Symlink escape protection in the workspace guard.

### Data handling

- Event payloads and error messages pass through secret redaction and truncation
  before persistence.

## Residual risks

1. **OpenCode is not OS-sandboxed.** Permission modes (`ask`/`auto`/`strict`) are
   agent policy rules, not OS boundaries. Approving `shell` grants host process
   access. This is documented and cannot be fully closed without upstream sandbox
   support.
2. **Local single user.** No authentication separation between multiple
   humans; token file is the boundary.
3. **Token at rest.** Data directory may be readable by other local processes;
   use OS-level permissions.

## Checklist for changes touching security-relevant code

- Add or update tests under `apps/server/test`, `packages/workspace/test`.
- Keep `npm run verify` green.
- Update this document and [docs/API.md](API.md) when request/response shapes
  change.
