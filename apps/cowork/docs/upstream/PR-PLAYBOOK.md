# Upstream Contribution Playbook

## How to Contribute to OpenCode Upstream

This playbook guides Cowork maintainers through contributing improvements back to the original OpenCode project at https://github.com/anomalyco/opencode.

## Prerequisites

1. **Upstream cloned** at `/opt/opencode-upstream`
2. **Node/Bun environment** — the upstream uses `bun` as primary runtime, but `npm`/`npx` also work for typecheck/tests
3. **Fork** the repo on GitHub and clone your fork
4. **Authentication** — `gh` CLI logged in as `rsdenck` (verified via `gh auth status`)
5. **Understanding of the codebase** — read the relevant package's `README.md`, `typecheck`, and test setup

## Step-by-Step Contribution Process

### Step 1: Identify a Real Improvement

Refer to `docs/upstream/RESEARCH.md` and `docs/upstream/CONTRIBUTION-OPPORTUNITIES.md` for identified opportunities. Do not invent problems.

**Valid reasons to contribute:**
- A genuine bug that causes crashes or data loss
- A missing feature that multiple downstream projects need
- A security improvement
- A usability improvement with clear use case

**Invalid reasons:**
- "Wouldn't it be nice to have..."
- "Makes sense to organize this here"
- "Makes my life easier" without a broader use case

### Step 2: Set Up the Development Environment

```bash
# From the upstream directory
cd /opt/opencode-upstream

# Install dependencies (bun is preferred, npm/node also work)
bun install  # or: npm ci

# Verify typecheck passes
bun run typecheck

# Run the existing test suite
bun test  # or: bun test --timeout 10000
```

### Step 3: Create a Branch

```bash
git checkout -b feature/<short-description>
# e.g., git checkout -b feature/mode-based-ruleset
```

### Step 4: Implement the Change

Follow the upstream's existing patterns:

- **TypeScript** — all code is `.ts`; use the project's `tsconfig.json`
- **Testing** — `bun test` is the test runner; follow existing test patterns
- **Type generation** — if you modify schemas, run `bun run generate && bun run check:generated`
- **Typecheck** — `bun run typecheck` must pass
- **Lint/formatting** — check what the upstream uses (likely `bun check` or similar)

### Step 5: Test Your Change

```bash
# Run the specific test file you modified/created
bun test packages/schema/test/permissions-mode.test.ts

# Run typecheck across the whole project
bun run typecheck

# Run generated code check (if schema changed)
bun run check:generated
```

### Step 6: Commit and Push

```bash
git add .
git commit -m "feat: add mode-based ruleset generator to schema

- Add permissionsForMode() function that generates Ruleset from mode string
- Export from packages/schema/src/index.ts
- Add test file packages/schema/test/permissions-mode.test.ts

See also: docs/upstream/RESEARCH.md, docs/upstream/CONTRIBUTION-OPPORTUNITIES.md"
git push origin feature/<short-description>
```

### Step 7: Open the PR

```bash
# From your fork
gh pr create \
  --title "feat: add mode-based ruleset generator to schema" \
  --body "$(cat <<'PRBODY'
## Description

Adds a `permissionsForMode()` function to `packages/schema` that generates a
`Permission.Ruleset` from a mode string (`"ask"`/`"auto"`/`"strict"`).

This helps downstream projects (like OpenCode Cowork) that need mode-based
permission configuration without reimplementing the mapping logic.

## Related

- Research: docs/upstream/RESEARCH.md
- Opportunities: docs/upstream/CONTRIBUTION-OPPORTUNITIES.md
- Decision log: docs/upstream/PR-REVIEW-LOG.md

## Checklist

- [x] `bun run typecheck` passes
- [x] `bun test` passes for affected packages
- [x] `bun run check:generated` passes (if schema changes)
- [ ] PR reviewed by maintainers
PRBODY
  )"
```

### Step 8: Respond to Feedback

- Address maintainer comments promptly
- If the PR is rejected, ask for clarification and document the decision in `PR-REVIEW-LOG.md`
- If the PR is merged, celebrate! Update the research docs to reflect the contribution.

### Step 9: Update Cowork if Needed

If the upstream change affects how Cowork integrates:

1. Update `@cowork/opencode-adapter` to use the new upstream API
2. Run `npm run verify` to ensure nothing breaks
3. Update `docs/upstream/RESEARCH.md` and `docs/upstream/CONTRIBUTION-OPPORTUNITIES.md` to reflect the change
4. Tag a new version if the API surface changed

## Code Style Conventions

Based on inspection of the upstream codebase:

- **File header**: minimal; rely on `biome`/`eslint` for formatting
- **Imports**: alphabetical, internal packages first, then external
- **Naming**: camelCase for functions/variables, PascalCase for types/interfaces
- **JSDoc**: concise, one-line summaries for exported functions
- **Tests**: `bun test` style; `it()`, `expect()`, `await` for async
- **Type generation**: `bun run generate` + `bun run check:generated` must pass after schema changes

## What Not To Do

- ❌ Do not open a PR without a real, identified problem
- ❌ Do not force the `ask`/`auto`/`strict` mode system onto upstream users who don't need it
- ❌ Do not commit `node_modules/`, `.pnp/`, or build outputs (`dist/`, `.bun/`)
- ❌ Do not claim a PR is "done" without running the full test suite
- ❌ Do not merge your own PR without maintainers' review (use `gh pr create` for maintainers to review)

## Quick Reference Commands

```bash
# From /opt/opencode-upstream
bun install          # install deps
bun run typecheck    # TypeScript typecheck
bun test             # run all tests
bun test packages/X/  # run tests in a specific package
bun run generate     # regenerate schema code
bun run check:generated  # verify generated code matches schemas
bun run check:generated  # or: npx tsc --noEmit (depending on setup)

# Git operations
git checkout main          # switch to main
git pull                   # pull latest
git checkout -b feature/X  # create feature branch
git push origin feature/X  # push to your fork
gh pr create               # open PR in browser
```

## Contribution Status (as of 2026-10-26)

| Contribution                                      | Status                       | Notes                                        |
| ------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| Mode-based ruleset generator (Opportunity #1)     | ✅ Researched, documented    | Ready to implement if decision to contribute |
| Event normalization utility (Opportunity #2)      | ✅ Researched, documented    | Lower priority; additive utility             |
| Mode parameter to permission API (Opportunity #3) | ✅ Researched, documented    | Medium effort; requires server changes       |
| No contributions submitted yet                    | 🟡 Awaiting real improvement | Per policy in pt/fs2.md                      |

## Contact & Maintenance

- **Upstream repo**: https://github.com/anomalyco/opencode
- **Maintainers**: review PRs; triage issues
- **This project's maintainer**: rsdenck (piptr@protonmail.com)
- **Policy**: `pt/fs2.md` — only contribute if real, tested improvement exists

---

_This playbook is versioned alongside the project. Update when contribution patterns change._
