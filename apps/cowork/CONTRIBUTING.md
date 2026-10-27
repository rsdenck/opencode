# Contributing

Thank you for considering a contribution to OpenCode Cowork V2.

## Ground rules

- Work happens in this repository, not in the OpenCode upstream repository.
- The product must keep using the real OpenCode engine through the official
  client; do not introduce mocks in production code paths.
- Every change should keep `npm run verify` green.

## Local setup

```bash
git clone <this-repository>
cd cowork
npm install
npm run dev
```

## Checks before opening a pull request

```bash
npm run verify
COWORK_REAL_OPENCODE=1 npm run test:integration   # optional, needs a live OpenCode service
```

## Commit style

Small Conventional Commits, for example:

- `feat(task-engine): expire approvals when a task reaches a terminal state`
- `fix(server): return 400 for malformed JSON bodies`
- `docs: add architecture and security documentation`

## Upstream contributions

Do not mix upstream contributions with product commits unless they are
released through the Cowork repository.

Upstream pull requests must follow the process described in
`docs/upstream/CONTRIBUTION-PLAYBOOK.md` and the requirements of
`/opt/cowork/pt/fs2.md`.

## Reporting security issues

Please follow [SECURITY.md](SECURITY.md). Do not open public issues for
vulnerabilities.
