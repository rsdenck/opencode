# Upstream PR Review Log

## Purpose

Track Pull Request reviews against the upstream OpenCode project. This log ensures we only merge/contribute changes that are legitimate, tested, and compatible.

## Open PRs (as of this writing)

| PR # | Title | Area | Status      | Reason              |
| ---- | ----- | ---- | ----------- | ------------------- |
| —    | —     | —    | No open PRs | Waiting on research |

## Merged PRs (historical)

| PR # | Title | Merged Date | Contributor | Description       |
| ---- | ----- | ----------- | ----------- | ----------------- |
| —    | —     | —           | —           | No merged PRs yet |

## Pending Review Checklist

Before reviewing any upstream PR, verify:

- [ ] **Legitimate problem** — the PR solves a real issue, not an invented one
- [ ] **Tests pass** — `bun test` and `bun run typecheck` both green
- [ ] **No API breakage** — or if breaking, documented with migration plan
- [ ] **Compatible with Cowork** — does not conflict with `@cowork/opencode-adapter` usage
- [ ] **Follows upstream conventions** — same coding style, same test patterns
- [ ] **No false claims** — no "this will fix X" without reproducing the issue

## Contribution Decision Framework

Based on `pt/fs2.md`, a PR should only be submitted if ALL of these are true:

1. **Real improvement exists** — there is a genuine gap, bug, or enhancement need
2. **Tested** — the contribution includes tests that pass in the upstream CI
3. **Policy-compliant** — does not violate upstream's contribution guidelines
4. **Not duplicative** — does not duplicate existing functionality without strong reason
5. **Maintainer-friendly** — easy to review, test, and merge; not overly complex

If any of these cannot be confirmed, do not submit the PR. Document the decision in this log.

## Decision Archive

| PR/Commit | Decision                                        | Date       | Notes                                                    |
| --------- | ----------------------------------------------- | ---------- | -------------------------------------------------------- |
| —         | No contributions submitted yet (research phase) | 2026-10-26 | Research complete; awaiting real improvement opportunity |
