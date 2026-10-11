# Environment Verification Ledger

**Last documentation update:** 2026-10-11. Session 5C.4 finalization entries below are freshly verified; other entries retain historical qualifications.

Legend: **VERIFIED** = test with recorded evidence; **OBSERVED** = reported behavior; **UNTESTED** = planned but not run; **BLOCKED** = attempted but could not complete.

| Area | Device / environment | Status | Evidence / qualification |
|---|---|---|---|
| Codex CLI 0.162.1 | Debian 13 PRoot, Node 22 | OBSERVED | Agent ran and produced final reports; prolonged runs experienced `signal 9` |
| Codex native Termux | Android 13, ARM64 | UNTESTED | Candidate architecture only; no verified package/build or smoke test yet |
| Native Node 26 + `argon2` | Termux | BLOCKED | Native module load failure reported |
| Node 22 + `argon2` | Debian PRoot Node v22.23.3, npm 10.9.9 | VERIFIED (fresh) | Addon load PASS; full regression 50/50, 9 files on 2026-10-11. Historical focused 20/20 was not separately rerun |
| PostgreSQL 18.2 | Native Termux, loopback 5432 | VERIFIED (fresh, bounded) | Readiness/identity PASS; existing isolated DB has 3 base and 1 payment migration; no migrations executed. Persistence across Android termination remains unverified |
| Session 5C.4 typecheck/lint/build | Debian PRoot, existing checkout | VERIFIED (fresh) | All three commands PASS with exit 0 during finalization |
| Full legacy regression | Existing isolated test DB | VERIFIED (fresh) | npm test: 50/50 PASS, 9/9 files, zero failures/skips; previous fixture blocker resolved in committed regression isolation work |
| Session 5C.4 commit/remote | Backend `main` | VERIFIED (fresh) | Implementation commit and actual GitHub main: 6f40488c508f84a1c676725a65c66f715155e8b2. Local HEAD 130652af67e3650de3e808d950a7d0ddad096a62 is one documentation commit ahead; no commit/push performed during finalization |
| External auto-report / clipboard | Existing interactive codex-report wrapper | UNVERIFIED | Last stored report INTERRUPTED with terminal escape sequences; no reliable runner established. Structured report preserved on disk; no clipboard delivery claimed |
| Laptop backend toolchain | Laptop | UNTESTED | No current machine audit supplied |

## Known backend context

- Repository: `SidiqLabs/restaurant-web-backend` (confirm current remote before any push).
- Android checkout previously reported at `$HOME/projects/restaurant-web-backend`.
- Freshly verified finalization test DB: `foody_5c4_test_20261011073800`;
  historical focused DB: `foody_5c4_test_20261011131646`. Verify identity again
  before future tests; never assume availability or authorization on another device.
- Session 5C.4 protected files: `docs/SESSION_HANDOFF.md`, `tests/orders-storage.test.ts.bak`.
- Implementation commit is present on actual GitHub main. Fresh full regression
  is complete; finalization documentation remains uncommitted by authorization.
- Fresh evidence: `docs/SESSION_5C4_FINALIZATION.md`; raw QA log:
  `.session-5c4-finalization.log` (ignored, local only). QA started at
  2026-10-11 10:26:52 UTC / 17:26:52 WIB. Tests took 76.90 seconds.
- Eligible PAID/non-CANCELLED payment count was zero before and after regression.
  Fixtures retain immutable refunded/cancelled evidence in the isolated DB.

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
