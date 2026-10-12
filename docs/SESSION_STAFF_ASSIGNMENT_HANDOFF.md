# Staff Assignment — implementation and QA handoff

Date: 2026-10-12 UTC. Scope: restaurant-staff membership and per-order assignment.
Repository: SidiqLabs/restaurant-web-backend, GitHub Codespaces, branch `main`.
Requested baseline `9049db84c119d7027bbb06027aac3bab9e9ab62f` is an ancestor of
starting HEAD `442b72fd8052909a6f27db844db5c8ff684fc918` (earlier draft-doc commit).
Pending implementation from the interrupted session was preserved and resumed;
no unrelated dirty files or active locks were found. Exact ownership was acquired
as `codex-overnight-20261012 / staff-assignment` before further edits.

## Ordered execution checklist

1. Staff membership/assignment: implement approved owner/admin scope, current
   STAFF role and active same-restaurant eligibility; test denial, revocation,
   concurrency, rollback and unchanged lifecycle. Run QA, commit, release locks.
2. Existing endpoint documentation: discovery found manual payment confirmation,
   refund, cancellation and public Best Seller routes missing from OpenAPI.
   Document existing contracts only; do not introduce financial behavior.
3. Final integration: check route/spec coverage, validate OpenAPI, exercise Swagger
   delivery and run the isolated integration regression once after all changes.
   Record inventory, frontend adapters and unresolved specification gaps.

No separate ordered backend roadmap was found. Generic architecture targets do
not authorize new features. Gateway/webhooks, payouts, uploads and staff lifecycle
permissions remain outside approved implementable specifications.

## Delivered vertical slice

- `PUT /api/resto/{restaurantId}/staff/{staffId}` manages active/revoked membership.
- `PUT /api/order/{orderId}/staff` assigns/reassigns using expectedStaffId;
  exact retries preserve timestamp after rechecking current eligibility.
- `GET /api/order/{orderId}/staff` returns minimal assignment metadata to the
  owning OWNER/ADMIN or currently assigned active STAFF only.
- Existing route -> controller -> service -> repository flow and safe error
  envelope retained. Strict input, canonical catalog IDs, UUIDs, no client roles.
- Current DB role/ownership/membership checks occur in the service transaction.
  Stable shared user locks, order locks and restaurant serialization protect
  authorization during concurrent revocation. No cross-restaurant inference.
- STAFF cannot self-enroll/self-assign or transition lifecycle; lifecycle code
  remains unchanged. Assignment writes do not modify order/payment snapshots.
- Additive restaurant_staff/order_staff schema, generated SQL/snapshot/journal,
  guarded test migration script and complete OpenAPI request/response contracts.
  Composite FKs enforce restaurant consistency and one assignment per order;
  composite membership PK prevents duplicates. Service enforces current role
  and active status; privileged direct SQL is not protected by that service.

## Actual verification

Codespaces Node v24.21.0, npm 11.19.0; existing container
`foody-validation-20261012`, PostgreSQL 18.6. Database identity verified as
`foody_5c4_test_20261012000000`, loopback 5432, dedicated disposable test DB.
No production/shared database was used; no environment recreated in this phase.

- Initial Staff/lifecycle run: 39/39 PASS, 2 files, zero failures/skips.
- After canonical ID/OpenAPI refinements and added concurrency tests:
  `npm test -- tests/staff-assignment.test.ts tests/order-lifecycle.test.ts`:
  **42/42 PASS** (21 Staff + 21 lifecycle), 2 files, zero failures/skips,
  exit 0, started 15:22:56 UTC, duration 14.08 seconds.
- Final `npm run typecheck`, test-inclusive
  `tsc -p tsconfig.eslint.json --noEmit`, `npm run lint`, `npm run build`:
  all PASS, sequential command exit 0.
- Staff migration rerun PASS, exit 0. Read-only ledger verification:
  3 base + 1 payment + 1 cart + 1 checkout + 1 reviews + 1 staff.
  Initial Staff migration exit 0 was recorded in the earlier interrupted session.
  Existing applied migration streams are untouched.
- Scoped diff reviewed and `git diff --check` PASS before commit. No credentials,
  tokens, external provider behavior or production availability claimed.

Focused security tests cover owner/ADMIN success, missing identity/account/order,
forbidden roles, foreign restaurant membership, stale and duplicate assignments,
target role and ownership changes during waits, membership revocation during
assignment/read waits, rollback/safe errors, FKs and lifecycle STAFF denial.

## Integration and limitations

Contract: [STAFF_ASSIGNMENT_API.md](STAFF_ASSIGNMENT_API.md). New clients need
membership status, assignment expectedStaffId and explicit handling of 409.
Staff account provisioning/role grants are not introduced: existing registration
creates CUSTOMER. Use legitimately provisioned existing STAFF identities; never
add a role-grant bypass for Swagger. Membership can span restaurants but grants
access only to assignments in the specific active restaurant. Reactivation
restores eligibility for retained assignments. Terminal orders remain terminal;
assignment is administrative metadata at any existing order state.

No push/deployment is authorized. Final full regression and Swagger verification
belong to the next integration phase. Commit SHA and final lock release are
verified separately at closeout; this document does not predict those results.

## Routing regression correction

Initial feature commit: `7341fa60da54e3d1c3619344868d5175b351a86a`.
The subsequent full integration run exposed a routing regression: 160/168 PASS,
8 Reviews failures. The STAFF router mounted at `/api` applied authentication
before checking whether a STAFF route matched, intercepting public Reviews.
Its three operations now attach authentication individually. Protected STAFF
operations remain authenticated; unrelated public and unmatched routes proceed
to their own handlers. A new regression test verifies public Reviews HTTP 200,
unknown API HTTP 404, and private STAFF HTTP 401.

Fresh affected-suite run: 64/64 PASS (22 Staff + 21 Reviews + 21 lifecycle),
3 files, zero failures/skips, exit 0, started 15:40:49 UTC, duration 10.06 seconds.
Typecheck, test-inclusive compiler, lint and build PASS after the correction.
The pending OpenAPI documentation phase was preserved separately; only STAFF
route/test and this handoff belong to the correction commit. Final full
integration rerun is recorded in the integration handoff, not inferred here.
