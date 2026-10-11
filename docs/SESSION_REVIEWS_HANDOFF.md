# Reviews API — session evidence

Date: 2026-10-11. Scope: Restaurant Reviews & Ratings only.
Baseline main and fetched origin/main:
`ddabc1893551319bca439702572e2f1aea411c38` (Checkout CLOSED).
No active locks; tracked tree clean; only the two protected untracked files.
Actual roadmap authority is PROJECT_CONTEXT backend direction plus this explicit
Reviews authorization; no standalone ordered roadmap document was present.

## Implementation

Five routes: POST `/api/review`, GET `/api/review/my-reviews`, public GET
`/api/review/restaurant/{restaurantId}`, PUT/DELETE `/api/review/{id}`.
Thin controller/Zod validation, service eligibility/ownership/presentation,
repository transactions and Drizzle PostgreSQL storage. No Cart/Checkout/Payment
feature logic, frontend, dashboard, gateway or payout change.

Current CUSTOMER with an owned COMPLETED checkout order is eligible; selected
menus must be actual immutable purchased snapshots. One review per order, unique
even after terminal soft deletion. Only the customer owner may edit/delete.
Stars 1..5, trimmed bounded text, strict payloads and bounded deterministic
pagination. Public summary computes all active count/average in the same snapshot
as its page. Public identifiers/contact/credentials are suppressed, with only
reviewer display name and blank avatar exposed for attribution.

Actual frontend types, query hooks, create/update payloads and display components
were inspected. Core request and owned-response shapes are preserved. Public
`user.id` and `transactionId` are intentionally omitted for privacy; frontend
declarations need adjustment for those unused fields. No frontend code changed.
Full contract and operational limitations: `docs/REVIEWS_API.md`.

## Database safety and migration

Fresh disposable `foody_5c4_test_20261011153706` was verified absent, created,
and verified as the connected identity with zero public tables before migrations.
Native loopback PostgreSQL 18.2. No previous test, user, shared development or
production database was modified. Every integration query uses the existing
explicit isolated database guard.

Additive `src/db/review-schema.ts`, `drizzle/reviews/0000_restaurant_reviews.sql`
and `drizzle.review_migrations`. Guarded test-only `scripts/migrate-reviews.ts`
applies base/payment/Cart/Checkout/Reviews streams. Initial and rerun migrations
PASS; final history 3 base + 1 payment + 1 Cart + 1 Checkout + 1 Reviews.
Applied older migration histories are untouched. SQL triggers supplement the
Drizzle JSON snapshot and are reviewed explicitly.

FKs/unique/checks enforce parent relationships, one order review, rating/text/
time bounds and selected-menu uniqueness. Triggers enforce current CUSTOMER,
owned COMPLETED checkout, purchased-menu membership/count, immutable references,
terminal soft delete and rejection of physical deletion/selection mutation.
Deferred commit check prevents a review with zero selected menus. Mutations
serialize per customer, lock order eligibility and atomically persist review and
selection. Unexpected errors do not expose/log raw query parameters or text.

Synthetic completed checkout/review fixtures remain only in this disposable DB;
security triggers were never disabled. A temporary menu-insert failure trigger
proved rollback and was removed, with absence verified. No production migration
or deployment was performed; operator backup/forward-migration/recovery review
remains required.

## Executed QA

- Targeted HTTP/real-PostgreSQL Reviews: 21/21 PASS; zero failed/skipped.
- Final full `npm test`: 121/121 PASS, 12/12 files, zero failed/skipped.
  Final run started 15:52:54 UTC; duration 143.54 seconds.
- Native application/test typecheck, lint and production build: PASS.
- Drizzle schema/snapshot comparison: PASS.
- `git diff --check`: PASS. Exact staged scope/secrets and Git closeout are
  independently verified in the final execution report.

An initial lint gate flagged a Vitest matcher as an unsafe any assignment;
the test now explicitly checks numeric ID type, preserving the same assertion.
Native gates reran PASS. Full regression reran after moving all listing
authorization decisions into the service; no valid test/security check removed.

Coverage: private authentication, current role, completed-purchase eligibility,
foreign order/review isolation, missing/invalid IDs, rating/text/quantity/resource
bounds, mass assignment, duplicate/concurrent submissions, another valid purchase,
update/delete ownership and races, terminal soft delete, active aggregates and
pagination, timestamp ties, snapshot persistence after catalog changes, public
privacy, direct PostgreSQL invariants/deferred constraint, rollback, queued order
state revocation, all frontend routes and migration history.

Existing Debian PRoot Node v22.23.3 was used for integration tests with the
existing Android esbuild executable, per the documented native argon2 limitation.
Native Termux Node v26.4.0 was used for compiler/lint/build gates. No dependency
or tool reinstall. Git/Codex/PostgreSQL stay native; no background process
survival guarantee is claimed. Recoverable raw log: `.session-reviews-qa.log`
(ignored). External clipboard delivery is unverified; evidence is preserved here.

## Review and closeout

Security/migration review checks server identity/eligibility/ownership, strict
assignment, least data disclosure, response/query bounds, transaction/duplicate
invariants and additive scope. No secrets or new dependencies introduced.

Owner `codex`, scope `reviews-api`; exact source/migration/test/doc/generated/log
paths checked FREE and claimed before edits. Final release/list is required
following authorized normal commit/push and full local/origin SHA verification.
Those Git results are independently recorded in the execution report, not
inferred from this pre-commit document. No reset/amend/force/unrelated staging.

Protected checksums remain original:

- `docs/SESSION_HANDOFF.md`:
  `c362c29e0ffdc84f4531ca9e0e84d61bd8fe62065ecf0f98f17025acafb944f5`
- `tests/orders-storage.test.ts.bak`:
  `bbe6ac7a6e5948a853f5ad6be922b6624ca3ecc6d925651f6933699f2ffd743b`

Limitations: no fulfillment completion API yet (new PENDING checkout cannot
be reviewed); no moderation, retention/anonymization job, catalog ratings wiring
or frontend E2E. Eligibility is checked at creation, not recalculated from later
refunds/state changes. Private listing authorization uses its request's database
snapshot. Direct privileged SQL may add other purchased menu links within the
bound; no API permits this, and DB privileges remain operational responsibility.

Stop after verified Reviews Git closeout. Any next feature needs a new session.
