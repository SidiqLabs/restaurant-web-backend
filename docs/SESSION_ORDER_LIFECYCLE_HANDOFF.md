# Order Lifecycle — implementation and QA evidence

Date: 2026-10-12 (Asia/Jakarta). Scope: Order Lifecycle only.
Baseline main/origin: `f6d81dfa70bef4269e1d5da7fc2565c426b9bc68`.
Tracked tree clean at discovery; the two protected untracked files were preserved.
No active locks before exact `codex / order-lifecycle` ownership.
No separate ordered roadmap exists; the explicitly authorized session follows
Reviews and enables its already established COMPLETED-order eligibility.

## Implementation

- Additive POST `/api/order/{orderId}/status`, strict expectedStatus/status
  request, thin controller/service/repository, existing auth and safe errors.
- Existing graph PENDING → CONFIRMED → PREPARING → READY → COMPLETED.
  Current restaurant OWNER or explicit global ADMIN only. STAFF denied because
  no verified restaurant assignment relation exists. Foreign owner sees 404.
- Current PAID required on every forward hop and exact repeat. No lifecycle
  writes to payment, totals, item/checkout snapshots or customer identity.
- Actor/order/restaurant locks inside one PostgreSQL transaction; shared
  Payment order lock, post-wait payment read and compare-and-swap status update.
  Exact repeats do not mutate timestamps; older/illegal targets conflict.
- Existing Checkout, Payment/cancellation and Reviews implementation unchanged.
  A real API-created order is manually settled by the existing ADMIN operation,
  advanced officially to COMPLETED, and reviewed by its customer in tests.
- No schema change or migration needed. Existing constraints and immutable
  purchase protections remain in force; no applied migration was rewritten.
  Contract, error cases and limitations: `docs/ORDER_LIFECYCLE_API.md`.

## Fresh execution evidence

Existing native Termux Node 26.4.0 used for compiler/lint/build; existing Debian
PRoot Node 22.23.3 fallback used for argon2-dependent integration. No tools or
dependencies reinstalled. Native PostgreSQL loopback readiness verified.

New disposable database `foody_5c4_test_20261011161300` was absent before CREATE
DATABASE and verified empty/current_database before migration. Its historical
name pattern is required by the existing isolated-database guard; no shared
Session 5C.4, development, existing user or production database was modified.
The existing guarded `scripts/migrate-reviews.ts` applied all prerequisite
streams and reran successfully: 3 base + 1 Payment + 1 Cart + 1 Checkout +
1 Reviews migration. Migration count assertions passed.

- Initial targeted run: 20 PASS / 1 FAIL (21). The failed assertion treated
  Zod's syntactically valid nil UUID as malformed; corrected to expected 404,
  preserving malformed UUID 400 checks. Targeted rerun: 21/21 PASS.
- Full `npm test`: 142/142 PASS, 13 files, zero failures/skips, exit 0;
  2026-10-11 23:22:40 UTC, duration 82.35 seconds. Includes existing Cart,
  Checkout, Payment/Best Seller, Reviews, Auth and catalog/storage suites.
- Native application and test-inclusive typechecks PASS. Initial lint failed
  only on expect.any(String)'s unsafe test assignment. Replaced the matcher
  with exact persisted timestamp comparison; implementation code unchanged.
- Final native `npm run typecheck`, `npx tsc -p tsconfig.eslint.json --noEmit`,
  `npm run lint`, `npm run build`: all PASS, combined exit 0.
- Final affected suite after the lint-only assertion change: 21/21 PASS,
  zero failures/skips, exit 0; 2026-10-11 23:26:38 UTC, duration 18.73 seconds.
  Unaffected regression suites were not unnecessarily repeated.
- `git diff --check` PASS; final staged whitespace/scope/secret checks precede
  authorized commit. Raw execution/exit evidence: `.session-lifecycle-qa.log`
  (ignored, persistent local log). This document preserves structured evidence;
  external clipboard delivery is not claimed.

## Security, persistence and limitations

Tests cover auth/current role, customer/unassigned staff/foreign owner denial,
forged fields, validation, illegal/stale transitions, exact retries, missing
and refunded settlement, completed Reviews eligibility, minimal response,
immutable snapshots, PostgreSQL enum/immutability constraints, eight concurrent
duplicate requests, ownership revocation during lock wait, refund before
completion during lock wait, safe failure rollback and recovery.

Synthetic payment evidence used the existing ADMIN confirmation API; refund
fixtures use the existing authorized API or a verified isolated transaction
with the existing DB guard/actor constraints. No customer settlement claims,
trigger bypass or weakened Reviews policy were used. Test failure trigger was
removed; isolated DB inspection found zero remaining lifecycle failure triggers
and zero PAID lifecycle references after fixture refunds.

State machine enforcement is application-level, not a new global SQL trigger;
privileged SQL must not bypass the official API. No durable event ledger,
staff assignment management, free-order settlement policy, gateway, frontend
integration, dashboard, payout, deployment or production migration is included.
Existing post-completion refund/Reviews policy remains separate and unchanged.

## Git and ownership closeout

Only the 12 lifecycle implementation, test, API/session documentation, project
context and additive route/OpenAPI wiring files are eligible for the commit.
Remote main was re-fetched and matched baseline before closeout. Normal push,
full-SHA parity and final lock release are independently verified/reported at
Git closeout; this pre-commit document does not claim a future push result.

Protected SHA-256 values remain:

- `docs/SESSION_HANDOFF.md`:
  `c362c29e0ffdc84f4531ca9e0e84d61bd8fe62065ecf0f98f17025acafb944f5`
- `tests/orders-storage.test.ts.bak`:
  `bbe6ac7a6e5948a853f5ad6be922b6624ca3ecc6d925651f6933699f2ffd743b`

Stop after Order Lifecycle Git closeout. Any next feature requires its own scope.
