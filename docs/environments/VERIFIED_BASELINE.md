# Environment Verification Ledger

**Last documentation update:** 2026-10-11. This ledger records prior reported evidence, not a fresh machine audit.

Legend: **VERIFIED** = test with recorded evidence; **OBSERVED** = reported behavior; **UNTESTED** = planned but not run; **BLOCKED** = attempted but could not complete.

| Area | Device / environment | Status | Evidence / qualification |
|---|---|---|---|
| Codex CLI 0.162.1 | Debian 13 PRoot, Node 22 | OBSERVED | Agent ran and produced final reports; prolonged runs experienced `signal 9` |
| Codex native Termux | Android 13, ARM64 | UNTESTED | Candidate architecture only; no verified package/build or smoke test yet |
| Native Node 26 + `argon2` | Termux | BLOCKED | Native module load failure reported |
| Node 22 + `argon2` | Debian PRoot | VERIFIED (targeted) | Session 5C.4 tests 20/20 across four files at 2026-10-11 14:15 WIB |
| PostgreSQL 18.2 | Native Termux, loopback 5432 | OBSERVED | Isolated migration succeeded earlier; later connection refused; persistence unresolved |
| Session 5C.4 typecheck/lint/build | Existing backend checkout | VERIFIED (historical) | PASS in previous closeout; must rerun after changes |
| Full legacy regression | Backend checkout | BLOCKED | Auth/order fixture conflict; additional DB authorization/isolation work needed |
| Session 5C.4 commit/push | Backend `main` | NOT DONE | Last reported HEAD and tracking ref `e8ea01f`; do not treat as fresh remote parity |
| Laptop backend toolchain | Laptop | UNTESTED | No current machine audit supplied |

## Known backend context

- Repository: `SidiqLabs/restaurant-web-backend` (confirm current remote before any push).
- Android checkout previously reported at `$HOME/projects/restaurant-web-backend`.
- Previously authorized isolated test database: `foody_5c4_test_20261011131646`; **do not assume it still exists or is appropriate on another device**.
- Session 5C.4 protected files: `docs/SESSION_HANDOFF.md`, `tests/orders-storage.test.ts.bak`.
- No final commit/push verified. Full regression remains outstanding.

## Verification record template

```text
DATE/TIME:
DEVICE/OS/ARCH:
ENVIRONMENT: native Termux | Debian PRoot | laptop
NODE/NPM/CODEX VERSIONS:
POSTGRES VERSION AND TEST DATABASE IDENTITY (NO PASSWORD):
BRANCH/HEAD:
WORK-LOCK STATUS:
COMMANDS EXECUTED:
TEST RESULTS AND LOG PATHS:
SIGKILL/PROCESS BEHAVIOR:
STATUS: VERIFIED | OBSERVED | UNTESTED | BLOCKED
ROLLBACK / KNOWN LIMITATIONS:
NEXT ACTION:
```

Update only after checking real outputs. Do not promote an untested native Codex package to VERIFIED merely because installation succeeds.
