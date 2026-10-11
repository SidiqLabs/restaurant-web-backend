# Session 5C.4 — Verified regression isolation closeout

Status: quality gates PASS (2026-10-11). Branch: main.
Baseline: e8ea01f86dabea45755a03da73052aed61e74156.
Owner/scope: codex/session-5c4-regression.
The resulting Session 5C.4 commit is recorded in Git history; push and remote
parity are verified by the closeout report after commit.

## Preserved implementation and focused repair

Preserved and reviewed the IN_PROGRESS payment/Best Seller implementation,
routes, schema, supplemental migration, targeted tests and isolated migration
runner. No runtime code or applied migration was rewritten in this repair.
Manual ADMIN settlement attestation remains the trust contract; provider
verification and money movement are outside this increment.

Default test setup now requires an operator-supplied isolated URL and checks
current_database() before SQL, rather than replacing DATABASE_URL. Additional
test identities require explicit TEST_DATABASE_NAME matching foody_5c4_test_
plus 14 digits. Auth uses per-run unique email fixtures and scoped cleanup.
Catalog and rollback-only storage suites verify the configured test identity.
Assertions and all nine default suites remain enabled. Payment test helper
types were corrected without changing requests or assertions.

## Observed verification

Debian PRoot Node v22.23.3 with existing dependencies. Native Termux PostgreSQL
at 127.0.0.1:5432. No dependency reinstalls or cluster administration.
Verified both database identities before operations:

- foody_5c4_test_20261011073800: newly created isolated TEST database; base and
  payment migrations PASS. Full npm test PASS: 50/50 tests, 9/9 files, no skips,
  including 9 payment/Best Seller integration tests and rollback-only storage.
- foody_5c4_test_20261011131646: existing isolated TEST database; auth regression
  PASS 7/7 after payment history existed. User/order/payment row counts unchanged.
- Focused Session 5C.4 configuration rerun on the existing DB: PASS 20/20,
  4/4 files after payment test typing fixes.
- npm run typecheck, npm run lint, npm run build: PASS.
- Additional test/tooling typecheck: npx tsc -p tsconfig.eslint.json --noEmit
  PASS after correcting three pre-existing payment helper typing errors.
- git diff --check: PASS.
- Guard probes: development name, mismatched URL, remote host and missing URL
  all refused before connection attempts.

For full regression, configure PGUSER locally, TEST_DATABASE_NAME,
DATABASE_URL and ORDERS_TEST_DATABASE_URL (both URLs must name the same isolated
DB). Configure ESBUILD_BINARY_PATH to the existing Android-arm64 binary as
needed. Run npx tsx scripts/migrate-payments.ts, then npm test. Never use native
Termux Node 26 for argon2; Debian Node 22 loads the existing addon.
Payment fixtures intentionally retain immutable history and refund this run's
outstanding paid evidence during teardown. Do not disable triggers for cleanup.

## Security and recovery

Reviewed ADMIN/current-role authorization, strict financial input rejection,
transaction locking, unique reference/order idempotency, immutable purchase and
payment evidence, refund/cancellation transitions and persisted ranking filters.
Targeted integration tests cover these invariants. No production/dev database
was connected to or modified. No production deployment was attempted.

Preserve unrelated work; never reset, clean, rewrite applied migrations, or force
push. Rollback is a targeted revert of the session commit, retaining additive
schema and financial history. Deployment requires independent operational review.

Protected files remain untouched and excluded from staging:

- docs/SESSION_HANDOFF.md SHA256:
  c362c29e0ffdc84f4531ca9e0e84d61bd8fe62065ecf0f98f17025acafb944f5
- tests/orders-storage.test.ts.bak SHA256:
  bbe6ac7a6e5948a853f5ad6be922b6624ca3ecc6d925651f6933699f2ffd743b

No remaining regression blocker. Release only this scope after closeout and
verify lock:list. Production payment-provider work requires a separate session.
