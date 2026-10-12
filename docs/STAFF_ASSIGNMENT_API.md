# Staff Assignment API

**Status: DRAFT — approved business rules and proposed API contract.**
The implementation is uncommitted and integration tests have not run. These
operations are not part of the committed application baseline. This document
does not certify endpoint availability or security behavior.

Restaurant membership and per-order assignment are separate, additive records.
Existing roles, lifecycle transitions, settlement and customer contracts remain
unchanged. STAFF still cannot call the lifecycle status endpoint.

## Operations

All operations require Bearer authentication, strict input and empty query
parameters. Responses use `{success:true,data}` or `{success:false,message}`.

- `PUT /api/resto/{restaurantId}/staff/{staffId}` with
  `{"status":"active"}` or `{"status":"revoked"}` returns HTTP 200
  `data.membership`: restaurantId, staffId, status, updatedAt.
  Only the current owning RESTAURANT_OWNER or global ADMIN manages membership.
  Activation requires an existing RESTAURANT_STAFF account. Revocation requires
  an existing membership and remains possible after the account role changes.
- `PUT /api/order/{orderId}/staff` with
  `{"staffId":"<UUID>","expectedStaffId":null}` assigns; use the previous
  staff UUID as expectedStaffId to reassign. Returns HTTP 200 `data.assignment`
  (orderId, restaurantId, staffId, updatedAt) and `data.repeated`.
  Only the owning OWNER/ADMIN may assign an existing STAFF account with active
  membership in that order's restaurant. STAFF cannot self-assign.
- `GET /api/order/{orderId}/staff` returns HTTP 200 `data.assignment`, or null
  for an unassigned order when read by its OWNER/ADMIN. Assigned STAFF may read
  only their own assignment with current STAFF role and active same-restaurant
  membership. It exposes no customer, delivery or payment details.

Revocation immediately denies subsequent staff reads and assignment retries;
stored assignments remain for reference. Reactivation restores eligibility,
including access to an assignment still referencing that staff account.
Membership is per restaurant; no single-restaurant employment restriction is
introduced. Assignment is administrative metadata at any existing order state;
it does not progress or reopen terminal orders, waive PAID requirements, or
grant STAFF lifecycle permission. No additional order-detail API is introduced.

## Consistency and errors

Current roles and ownership are checked inside the transaction. Users are
locked FOR SHARE in UUID order, then order (if present), then restaurant.
Membership writes and assignments lock the restaurant FOR UPDATE; reads lock
it FOR SHARE, serializing with revocation. Roles, ownership and eligibility
are read after lock acquisition, without cached token permission claims.
Assignment uses expectedStaffId under these locks to reject stale reassignment.
An exact retry to the same staff rechecks eligibility and preserves timestamp.
Repeated membership status writes also preserve timestamp. Failed writes roll
back. Database-superuser bypass is not prevented by application authorization.

HTTP 400 invalid IDs/body/unknown query; 401 absent/invalid identity or deleted
actor; 403 denied role; 404 missing resource/foreign owner scope or inaccessible
staff assignment; 409 ineligible staff or stale assignment; 500 safe internal
error. Only validated identifiers and minimal metadata are returned.

## Persistence and migration

`src/db/staff-schema.ts` defines `restaurant_staff` (restaurantId/staffId
composite primary key, active/revoked check) and `order_staff` (one assignment
per order). Composite foreign keys bind assignment to both the order's
restaurant and an existing membership in that restaurant. Restrictive deletion
preserves references. Active status and current STAFF role are enforced by the
service transaction, not inferred from foreign keys.

Additive migration stream: `drizzle/staff`, ledger `drizzle.staff_migrations`.
Existing applied streams are untouched. `scripts/migrate-staff.ts` is guarded
for an explicitly named loopback isolated test DB and requires existing base
prerequisites. It must not be used for production deployment. Apply this stream
with the normal Drizzle migrator in an authorized deployment process after
prerequisites; verify migration history and take a recovery backup first.
Rollback should revert application routing first and retain assignment data;
dropping tables requires a separately authorized destructive recovery plan.

OpenAPI documents all three operations at `/api-docs.json`.

## Session handoff — 2026-10-12

- Starting baseline: `9049db84c119d7027bbb06027aac3bab9e9ab62f`, `main`, clean
  worktree, no active locks. Discovery confirmed STAFF role exists but membership
  and order assignment were absent; existing lifecycle permits OWNER/ADMIN only.
- Owner approved both membership and per-order assignment, owner-scoped/global
  ADMIN management, no staff self-enrollment/assignment, current STAFF role and
  active same-restaurant membership eligibility, immediate revocation, and
  unchanged lifecycle transition permissions.
- Scoped implementation, additive schema/migration, OpenAPI wiring and focused
  tests were drafted. Application and test-inclusive TypeScript checks and build
  passed before final lint corrections. Initial lint failed; corrections were
  applied, but full lint/typecheck/build were not repeated afterward.
- Existing disposable Codespaces container was restarted; database
  `foody_5c4_test_20261012000000` was verified empty on PostgreSQL 18.6.
  Prerequisite migrations and the additive Staff migration each exited 0 through
  isolated-database guarded scripts. Migration rerun/invariant tests are UNKNOWN.
  No production database was used. Earlier 142/142 results are historical and
  do not validate this feature.
- Latest instruction changed execution to documentation-only. No focused tests
  were run. Runtime authorization, concurrency and regression results remain
  UNKNOWN. Implementation remains uncommitted for a future authorized session;
  only this DRAFT contract/handoff is eligible for the documentation commit.
- Next authorized implementation session must inspect the pending changes and
  reacquire locks, run focused Staff Assignment and lifecycle regression tests,
  repeat final compiler/lint/build checks, and review migration/schema parity
  before committing the feature. No push is authorized by this handoff.
