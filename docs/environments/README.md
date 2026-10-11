# Foody Backend: Environment Playbook

**Status:** documentation baseline, 2026-10-11. This directory describes operating environments; it does **not** certify an installation as stable.

## Start here on every new session

1. Read the repository's actual `PROJECT_CONTEXT.md`, `AGENTS.md`, and workflow constitutions first. Those take precedence over this playbook.
2. Determine host: Android/Termux or laptop. Read the matching guide.
3. Read `VERIFIED_BASELINE.md` to distinguish **VERIFIED**, **OBSERVED**, **UNTESTED**, and **BLOCKED**.
4. Inspect current Git branch, dirty files, work-locks, and running processes before any changes.
5. Avoid reinstalling tools or recreating databases if the baseline is already valid.
6. For a configuration change, use the repo's lock protocol, test, update baseline and troubleshooting, then commit only authorized files.

## Files

- `ANDROID_TERMUX.md`: native Android workflow and Debian compatibility fallback.
- `LAPTOP.md`: laptop setup and environment parity checklist.
- `TROUBLESHOOTING.md`: reproducible failure investigation and recovery.
- `VERIFIED_BASELINE.md`: evidence ledger, not marketing claims.

## Core principles

- Agent runtime, application runtime, and database are separate concerns.
- Prefer Codex native Termux **after** compatibility and security verification; Debian PRoot is a fallback for Linux-only binaries and tests.
- Android can terminate background processes. `tmux`, wake locks and logs improve recoverability but do not guarantee survival from SIGKILL.
- Never disable tests to obtain green results, never run destructive test fixtures against development/production databases, and never force-push to work around a blocker.
- Do not store secrets, access tokens, connection passwords, or `.env` contents in docs or logs.
- Device-specific state must be verified again after OS, Node, Codex, package or dependency upgrades.

## Agent handoff contract

At the start of a new session, report: device/environment; active branch and HEAD; dirty/protected files; lock status; installed tool versions; test database identity (without credentials); last known passing checks; blockers; exact next action. Never infer completion from process exit code alone: verify test results, commit, push and full-SHA remote parity independently.
