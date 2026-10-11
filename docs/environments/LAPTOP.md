# Laptop Operating Guide

**Status: NOT VERIFIED for current Foody Backend checkout.** No current laptop OS, Node, Codex or PostgreSQL versions have been confirmed in this documentation.

## Initial discovery (read-only)

```sh
pwd
git remote -v
git branch --show-current
git status --short
node --version
npm --version
codex --version
psql --version
```

Do not assume a path, shell, package manager, database name or port from Android applies to the laptop.

## Setup sequence

1. Clone or update the **correct backend** repository from its authorized remote; verify branch and commit.
2. Read repository governance and lock protocol before editing.
3. Use the Node version required by `package.json`/engines or the verified CI baseline. Install dependencies with the repository's lockfile and package manager.
4. Configure environment variables using the repository's example/template, never copying real secrets into documentation or Git.
5. Use a dedicated local test database and verify its identity before migration or tests.
6. Run typecheck, lint, build, focused integration tests and the complete authorized regression suite.
7. Record versions, actual commands, results, known limitations and date in `VERIFIED_BASELINE.md`.

## Cross-device handoff

- Git is the source of committed project state; local uncommitted work, `.env`, local database contents, lock metadata and process state do not automatically transfer.
- Verify full commit SHA and remote parity after a push/fetch. Never assume tracking ref equals remote without fetching.
- Keep per-device test databases separate. Do not reuse Android's database URL on laptop.
- Do not modify or commit user-protected files, even if they appear as untracked changes.

## Exit checklist

Document: device, branch/HEAD, dirty work, locks, tests and logs, database identity, commit/push result, remaining blocker and next action. Release only locks owned by the current worker.
