# Upstream Research: OpenCode Cowork V2

## Purpose

This document investigates the upstream OpenCode project (`/opt/opencode-upstream`) to identify opportunities for legitimate, tested improvements that could be contributed back via Pull Request. The goal is not to invent problems, but to find real gaps or enhancements that benefit both Cowork and the upstream project.

## Upstream Overview

- **Repository**: https://github.com/anomalyco/opencode
- **Version**: 2.1.4 (referenced by Cowork)
- **Structure**: Monorepo with packages: `client`, `protocol`, `schema`, `core`, `server`, `plugin`, `tui`, `cli`, `sdk`
- **Language**: TypeScript, uses `effect` for some subsystems, `bun` as optional runtime

## Key Packages Relevant to Cowork

### `packages/client` (v2.1.4)

The official SDK Cowork wraps. Key exports:

- `Service.ensure()` / `Service.discover()` — discover or start the local OpenCode background service
- `OpenCode.make({ baseUrl, headers })` — create a client instance
- `client.event.subscribe({ signal })` — event stream subscription with reconnect/backoff
- `client.session.prompt()` — send a prompt to OpenCode and get assistant messages
- `client.session.interrupt()` — interrupt a session
- `client.permission.*` — permission-related RPC methods
- `client.provider.list()`, `client.model.list()`, `client.agent.list()`, `client.skill.list()`, `client.mcp.list()` — catalog queries
- `client.diagnostics()` — server diagnostics

Event types supported (from generated types):
- `session.execution.started`, `.succeeded`, `.failed`, `.interrupted`
- `permission.asked`, `.replied`
- Plus many others (tool calls, step events, text events, etc.)

### `packages/protocol` 

Defines the HTTP/RPC API. Permission-related endpoints:

- `GET /api/permission/request` — list pending permission requests
- `GET /api/permission/saved` — list saved permissions
- `PATCH /api/permission/saved/:id` — update saved permission
- `DELETE /api/permission/saved/:id` — remove saved permission
- `POST /api/session/:sessionID/permission` — create permission request for a session
- `GET /api/session/:sessionID/permission` — list session permission requests

### `packages/schema` 

Defines the data models:

- `Permission.Rule` — `{ action: string, resource: string, effect: "allow" | "deny" | "ask" }`
- `Permission.Ruleset` — `Rule[]`
- `Permission.Request` — `{ id, sessionID, action, resources, save?, metadata?, source?, message? }`
- `Permission.Reply` — `"once" | "always" | "reject"`
- `Permission.Effect` — `"allow" | "deny" | "ask"`

### `packages/core`

The core type system. Contains primitive types but no permission-mode mapping.

## Cowork's Integration Point

Cowork's `@cowork/opencode-adapter` is the sole integration point between the product and the OpenCode engine. What Cowork does:

1. **Service discovery** — wraps `Service.ensure()` with retry/backoff; falls back to starting a new process if none is running
2. **Permission mapping** — `permissionsForMode(mode)` generates `OpenCodePermissionRule[]` for `ask`/`auto`/`strict` modes:
   - `auto` → `{ action: "*", resource: "*", effect: "allow" }`
   - `ask` → default allow + `edit`, `write`, `shell`, `bash`, `webfetch`, `websearch`, `fetch` → `ask`
   - `strict` → mutating actions → `ask`; network actions → `deny`; also `task` and `browser` → `deny`
3. **Event normalization** — takes raw OpenCode events, extracts `sessionID`, redacts secrets/truncates payloads before storage
4. **Session management** — creates/replaces sessions on interrupt, handles permission replies through the API
5. **Event subscription** — wraps `client.event.subscribe()` with reconnect logic, backoff, and signal handling

## Comparison: Upstream vs Cowork

| Area                         | Upstream OpenCode                                                      | Cowork Adapter                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Permission rules**         | `Rule` type with `effect: "allow"                                      | "deny"                                                                                                                     | "ask"`; rulesets stored/server-side | `permissionsForMode()` generates rules client-side; policy layer because OpenCode is not OS-sandboxed |
| **Event types**              | `session.execution.*`, `permission.asked/replied`, plus two dozen more | Same types + custom `AdapterEvent` shape (with redaction, truncation, `receivedAt`)                                        |
| **Mode system**              | No `ask`/`auto`/`strict` concept; permissions are individual rules     | Three-mode system (`ask`/`auto`/`strict`) enforced through the approval workflow UI                                        |
| **Service lifecycle**        | `Service.ensure()`, `Service.discover()`                               | Same, plus health caching, connection pooling, graceful reconnect                                                          |
| **Permission approval flow** | Server-side `POST /api/session/:sessionID/permission`                  | Client-side approval cards + API replies (`once`/`always`/`reject`); pending approvals expire on terminal task transitions |

## Contribution Opportunities

### 1. Enhance upstream permission ruleset to support mode-based mapping

The upstream already has the data model (`Rule`, `Ruleset`, `Effect`), but lacks the conceptual mapping that Cowork implements (`ask`/`auto`/`strict` modes).

**Potential contribution**: Add mode-based permission configuration to the upstream schema or documentation, e.g.:

- A `PermissionMode` type (`"ask" | "auto" | "strict"`)
- Pre-built rulesets for each mode, or a function `permissionsForMode(mode): Ruleset`
- Documentation on how to configure mode-based permissions in an OpenCode server

This would benefit any project that needs fine-grained permission control beyond individual rule configuration.

### 2. Standardize event normalization pattern

Cowork normalizes OpenCode events with:
- Secret redaction (via `@cowork/core`'s `redactValue`)
- Payload truncation (max 16 KiB, with `truncated` flag)
- Consistent `AdapterEvent` shape (`type`, `data`, `raw`, `receivedAt`)
- Session ID extraction helper

**Potential contribution**: Add a utility function or type to the upstream `client` or `schema` packages for event normalization, especially secret redaction and payload size limiting. This would help anyone persisting OpenCode event data.

### 3. Add `ask` mode support to upstream permission workflow

The upstream has the `Rule.effect = "ask"` capability, but the approval workflow (asking the user, collecting `once`/`always`/`reject` replies) is server-side and not client-mode-aware.

**Potential contribution**: Enhance the upstream `session.permission.create` or related endpoints to accept a `mode` parameter (`"ask" | "auto" | "strict"`) and automatically generate the appropriate rule set, or document how to configure mode-based approvals.

### 4. Improve service discovery resilience

Cowork's adapter adds:
- Health caching (10s TTL)
- Promise-based lazy initialization with null-on-failure cleanup
- Explicit `mode` resolution (`explicit`/`background-service`/`unknown`)
- Error translation to `CoworkError` with code `opencode_unavailable`

**Potential contribution**: These are primarily Cowork-specific concerns (workspace isolation, policy layer), but any general improvements to `Service.ensure()` error handling, discovery fallback, or health checking would be valuable.

## Non-Contribution Areas (by design)

These are intentionally **not** upstream candidates because they are Cowork-specific policy decisions:

- The `ask`/`auto`/`strict` mode system itself — this is a product-level policy, not a general OpenCode improvement
- Workspace path isolation and symlink guards — purely policy/confinement for Cowork
- The approval card UI flow — product-specific UX
- SQLite persistence and migration schema — storage choice specific to Cowork
- Secret redaction patterns — Cowork's internal concern

## Recommendation

**Do not open a PR simply to add Cowork's permission mode system**. The modes are a product decision.

**Do consider** one of these two approaches:

1. **Add mode-based ruleset generation** to the upstream schema/types, e.g., export a function or type that generates a `Ruleset` from a mode string. This is useful for anyone building permission-aware tools on top of OpenCode.

2. **Add event normalization utilities** to the upstream client/schema, especially around secret redaction and payload size management. This is a general good practice for anyone persisting OpenCode event data.

Both contributions would be legitimate, tested, and compatible with the existing upstream codebase without forcing the `ask`/`auto`/`strict` mode concept onto upstream users who don't need it.

## Next Steps

If pursuing a contribution:

1. Fork `https://github.com/anomalyco/opencode`
2. Identify the specific package (`schema` or `client`) most appropriate for the change
3. Write tests following the upstream testing patterns (`bun test`)
4. Ensure `npm run typecheck` and `npm run check:generated` pass
5. Submit a PR with a clear description of the problem being solved
6. Be prepared to iterate based on maintainer feedback

Remember the policy from `pt/fs2.md`: do not invent problems to justify a PR. Only contribute if a real, tested improvement exists.
