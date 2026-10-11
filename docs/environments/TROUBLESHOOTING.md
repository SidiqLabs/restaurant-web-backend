# Troubleshooting and Recovery

## `Process completed (signal 9)` on Android

**Observed:** long-running Codex through Debian PRoot ended abruptly, sometimes before final reporting. **Root cause: NOT CONFIRMED.** Potential causes include Android process management, memory pressure, and process-tree behavior.

1. Do not restart Codex immediately. Check last persisted log, timestamp, final message, active processes, work-locks and Git status.
2. Check Android memory pressure and battery/process restrictions where accessible. Do not label a guess as a diagnosis.
3. Prefer one native Termux Codex process after it passes the security and compatibility gate; launch heavy tests separately.
4. Use short checkpoints, persistent logs and bounded workloads. `tmux` cannot resurrect killed processes.
5. If using ADB to change Android process management, record device/OS, exact command, before/after observations and rollback. Avoid system tweaks without evidence.

## `argon2` native module fails in Termux

**Observed:** native Termux Node 26 failed to load the installed native binary; Debian Node 22 worked for the targeted test suite. This does not prove all native Node builds are incompatible.

- Avoid random rebuild/reinstall loops against the production checkout.
- Run the affected test suite in the already working Debian environment while keeping Codex native, if validated.
- Consider a controlled native build experiment only in a temporary copy; document compiler, ABI, versions and outcome.

## PostgreSQL `connection refused` at `127.0.0.1:5432`

**Observed:** closeout blocked because native PostgreSQL was unavailable.

- Check `pg_isready` in native Termux and whether the expected data directory exists.
- Start **only the existing authorized native cluster** using its known configuration; do not initialize a new cluster to silence an error.
- Verify current database/user before migrations or destructive test fixtures.
- If PostgreSQL stops again, inspect its own log and resource/process evidence before restarting Codex.

## Legacy regression test conflicts

**Observed:** auth fixture cleanup attempted to delete users referenced by order records; other legacy suites required a database outside the authorized test scope. Targeted 5C.4 tests passed 20/20.

- Repair test isolation/fixtures within authorized test databases only.
- Never point legacy destructive fixtures at development or production data.
- Do not disable assertions, skip failing suites, or declare full regression PASS on targeted tests alone.

## Codex exit code 0 but task blocked

The CLI can exit successfully after reporting `STATUS=BLOCKED`. Always read the final agent response and independently verify QA, commit, push and remote parity.

## Protected files

For Session 5C.4, preserve `docs/SESSION_HANDOFF.md` and `tests/orders-storage.test.ts.bak`. Do not stage or overwrite them. Reconfirm protected paths from current governance before future work.
