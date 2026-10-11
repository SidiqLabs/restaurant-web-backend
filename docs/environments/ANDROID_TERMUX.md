# Android / Termux Operating Guide

**Target:** Android 13, ARM64; actual device details and tool versions must be checked locally. **Status: native Codex migration NOT YET VERIFIED.** Do not remove Debian until native setup passes acceptance tests.

## Preferred architecture

- **Host Termux:** Codex CLI (only a vetted Android-compatible build), Git, tmux, logging, PostgreSQL.
- **App Node runtime:** native Termux where dependencies work.
- **Compatibility runtime:** Debian PRoot with Node 22 for tests requiring Linux-native modules (previously `argon2`). Keep Codex itself outside PRoot once native operation is verified.
- **Database:** native Termux PostgreSQL bound to loopback; never start a second cluster inside Debian.

## First-run read-only inventory

Run in native Termux:

```sh
uname -m
getprop ro.build.version.release
node --version
npm --version
command -v codex && codex --version || true
command -v tmux && tmux -V || true
command -v psql && psql --version || true
command -v pg_isready && pg_isready -h 127.0.0.1 -p 5432 || true
command -v proot-distro || true
```

Record results in `VERIFIED_BASELINE.md` after verification. Do not paste secrets or complete environment variables.

## Native Codex acceptance gate

1. Inspect package provenance, maintainer, release history, install scripts, and binary architecture before installing any **community** Android build. A third-party build is not an official OpenAI distribution. Do not blindly run `npm install -g ... --allow-scripts` or pipe unknown install scripts to a shell.
2. Install a vetted compatible build in a testable way, preserving the working Debian fallback.
3. Confirm `codex --version`, authentication, read-only command in a temporary directory, then a read-only repository audit.
4. Run a bounded, non-destructive task inside `tmux` and verify that logs survive a disconnected terminal.
5. Run typecheck/lint/build separately; only then test Debian invocation for `argon2`-dependent suites.
6. Mark native Codex **VERIFIED** only after repeated successful runs, including a session longer than previous failure intervals. Record exact versions and date.

## Runtime practices

- Use one Codex worker at a time; avoid nested Codex, parallel PRoot sessions, or simultaneous resource-heavy builds.
- Use `tmux new -s foody` / `tmux attach -t foody`. `tmux` does not survive a system SIGKILL that terminates its server.
- `termux-wake-lock` can reduce sleep interruptions; release with `termux-wake-unlock` after work. Review battery optimization for Termux.
- Write logs and checkpoints to persistent files; record process exit codes and the final agent response separately.
- Before retrying after `signal 9`, inspect prior log, running workers and Git state; **never** automatically start a second agent.
- Do not assume the Android phantom-process limit is the proven cause. Collect evidence first; ADB/OS-level changes are optional, device-dependent and may have security/power consequences. Record rollback if used.

## Database safety

- Check readiness with `pg_isready -h 127.0.0.1 -p 5432` before launching tests.
- Check database identity through a read-only `SELECT current_database(), current_user;` before migrations or destructive fixtures.
- Only use explicitly authorized isolated test databases. Database names and connection details must not be copied blindly across devices.
- Do not run `initdb`, `pg_ctl`, or `runuser` inside Debian PRoot to manage native PostgreSQL.
- A database restart is not permission to migrate, truncate, drop, or delete records.

## Debian fallback

The earlier evidence shows Debian PRoot Node 22 successfully ran 20/20 Session 5C.4 integration tests while native Termux Node 26 could not load `argon2`. Preserve this fallback until native compatibility is proven. Avoid holding PRoot open throughout the entire Codex session.
