# Upstream Contribution Opportunities

## Overview

This document lists specific, concrete opportunities to contribute to the upstream OpenCode project (`/opt/opencode-upstream`). Each opportunity is grounded in code inspection and has a clear path to a tested PR.

## Opportunity 1: Add Mode-Based Ruleset Generator to Schema

### Problem

The upstream `packages/schema` defines `Permission.Rule` and `Permission.Ruleset` but does not provide a convenience function to generate a ruleset from a mode string (`"ask"`/`"auto"`/`"strict"`). Cowork implements this mapping in `packages/opencode-adapter/src/types.ts` via `permissionsForMode()`, but every downstream project must re-implement it or work with raw rules.

### Solution

Add a function to `packages/schema/src/index.ts` (or a new file `packages/schema/src/permissions-mode.ts`):

```typescript
import { Rule, Ruleset, Effect } from "./ruleset.ts"

/** Generate a Permission.Ruleset from a mode string. */
export function permissionsForMode(mode: "ask" | "auto" | "strict"): Ruleset {
  if (mode === "auto") {
    return [{ action: "*", resource: "*", effect: "allow" }]
  }

  const base: Rule = { action: "*", resource: "*", effect: "allow" }
  const mutating = ["edit", "write", "shell", "bash"] as const
  const network = ["webfetch", "websearch", "fetch"] as const

  if (mode === "ask") {
    return [
      base,
      ...mutating.map((a) => ({ action: a, resource: "*", effect: "ask" }) as Rule),
      ...network.map((a) => ({ action: a, resource: "*", effect: "ask" }) as Rule),
    ]
  }

  // strict
  return [
    base,
    ...mutating.map((a) => ({ action: a, resource: "*", effect: "ask" }) as Rule),
    ...network.map((a) => ({ action: a, resource: "*", effect: "deny" }) as Rule),
    { action: "task", resource: "*", effect: "deny" } as Rule,
    { action: "browser", resource: "*", effect: "deny" } as Rule,
  ]
}
```

### Files to modify

- `packages/schema/src/index.ts` — add export
- `packages/schema/src/ruleset.ts` (new) — contain the function and `Rule`/`Ruleset` re-exports

### Tests to add

- `packages/schema/test/permissions-mode.test.ts` — test the three modes produce expected rulesets

### Verification

```bash
cd /opt/opencode-upstream
bun run typecheck  # must pass
bun test packages/schema/test/permissions-mode.test.ts  # must pass
```

### Risks

- Low — purely additive, no existing behavior changes
- The function signature uses string literals `"ask" | "auto" | "strict"` which could be expanded later

### Related Code

- Upstream: `packages/schema/src/permission.ts` — defines `Rule`, `Ruleset`, `Effect`
- Cowork: `packages/opencode-adapter/src/types.ts` — `permissionsForMode(mode)` (identical logic, different context)

## Opportunity 2: Add Event Normalization Utility to Client

### Problem

OpenCode events are produced by the server and consumed by clients. Currently there is no utility to normalize events — specifically: redact secrets, truncate oversized payloads, and enforce a consistent shape. Projects that persist event data (like Cowork) must implement this themselves.

### Solution

Add a utility function to `packages/client/src/` or `packages/schema/src/`:

```typescript
import { redactValue } from "@opencode/core" // if published, or inline the logic

/** Redact and truncate an OpenCode event payload. */
export function normalizeEventPayload(
  payload: unknown,
  maxBytes = 16 * 1024,
): { truncated: boolean; originalBytes: number; preview: string } {
  const serialized = JSON.stringify(redactValue(payload ?? null))
  if (serialized.length <= maxBytes) {
    return { truncated: false, originalBytes: serialized.length, preview: serialized }
  }
  return {
    truncated: true,
    originalBytes: serialized.length,
    preview: serialized.slice(0, maxBytes) + "\n…[truncated]",
  }
}
```

### Files to modify

- `packages/client/src/event-utils.ts` (new) — contain the function

### Tests to add

- `packages/client/test/event-utils.test.ts` — test with normal, oversized, and null payloads

### Verification

```bash
cd /opt/opencode-upstream
bun run typecheck  # must pass
bun test packages/client/test/event-utils.test.ts  # must pass
```

### Risks

- Low — additive utility, no breaking changes
- Dependencies on `@opencode/core` for redaction — if not published as a workspace package, inline the redaction logic

### Related Code

- Cowork: `packages/core/src/redact.ts` — the `redactValue` function Cowork uses
- Upstream: `packages/client/src/promise/generated/types.ts` — event types

## Opportunity 3: Add Mode Parameter to Permission API Endpoints

### Problem

The upstream permission system (`POST /api/session/:sessionID/permission`) accepts individual rules but does not have a concept of "modes" (`ask`/`auto`/`strict`). Each project must configure rules manually or implement their own mode-based approval workflow.

### Solution

Enhance the permission-related RPC endpoints to accept an optional `mode` parameter. When provided, the server automatically generates the appropriate ruleset and creates permission requests accordingly.

This could be in:
- `packages/protocol/src/groups/permission.ts` — add `mode` parameter to `session.permission.create`
- `packages/server/src/handlers/permission.ts` — handle the mode and generate ruleset
- `packages/schema/src/permission.ts` — add `mode` field to `Request` type

### Files to modify

- `packages/protocol/src/groups/permission.ts` — add `mode?: "ask" | "auto" | "strict"` to relevant endpoints
- `packages/schema/src/permission.ts` — add `mode` field to `Request` type (optional)
- `packages/server/src/handlers/permission.ts` — implement mode-aware rule generation

### Tests to add

- `packages/server/test/permission-mode.test.ts` — test that specifying mode generates correct rules

### Verification

```bash
cd /opt/opencode-upstream
bun run typecheck  # must pass
bun run check:generated  # must pass (if schema changes affect generated code)
bun test packages/server/test/permission-mode.test.ts  # must pass
```

### Risks

- Medium — changes to server-side permission handling could affect existing deployments
- Must ensure backward compatibility: `mode` is optional, default behavior unchanged

### Related Code

- Upstream: `packages/protocol/src/groups/permission.ts` — existing permission endpoints
- Cowork: `packages/task-engine/src/engine.ts` — approval flow with `ask`/`once`/`reject` replies

## Contribution Priority

| Priority | Opportunity                          | Effort                           | Impact                                     | Risk   |
| -------- | ------------------------------------ | -------------------------------- | ------------------------------------------ | ------ |
| High     | #1: Mode-based ruleset generator     | Low (add function)               | Medium (helps all schema users)            | Low    |
| Medium   | #2: Event normalization utility      | Low (add function)               | Medium (helps event-persistence projects)  | Low    |
| Medium   | #3: Mode parameter to permission API | Medium (server + schema changes) | High (directly helps permission workflows) | Medium |

## Recommended Starting Point

**Start with Opportunity #1** (mode-based ruleset generator). It's the lowest effort, lowest risk, and provides immediate value to the ecosystem. The function is purely additive, follows existing patterns in the codebase, and has a clear test path.

After that, **Opportunity #2** is also low-hanging fruit — any project that persists OpenCode events will benefit from standardized normalization.

**Opportunity #3** requires more coordination since it touches server-side logic, but if the maintainers are open to mode-based permission configuration, it would have the highest impact.

## How to Contribute

1. Read the contributing guide at the upstream repo
2. Fork https://github.com/anomalyco/opencode
3. Start with Opportunity #1
4. Run the existing test suite: `bun test`
5. Add tests for the new function
6. Ensure `bun run typecheck && bun run check:generated` pass
7. Submit a PR with a clear description

Remember the policy: only contribute if a real improvement exists. All three opportunities above are grounded in actual gaps identified through Cowork's integration with upstream OpenCode.
