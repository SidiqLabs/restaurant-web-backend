# Payment evidence and Best Seller — Session 5C.4

## Trust and API contract

This increment supports **manual ADMIN settlement attestation**. An authenticated
current ADMIN confirms an order using `POST /api/order/:orderId/payment/confirm`
and `{ "reference": "external-evidence-reference" }`. The operator must first
verify actual settlement through an independent bank/provider record, matching
order identity and the server's amount. A reference alone is not payment proof.
Restrict ADMIN assignment and retain the referenced reconciliation record outside
Foody. This release does not implement provider webhooks or automatic settlement
verification; do not expose manual confirmation to customers or treat it as a
provider integration. Database writers are privileged operators, not clients.

Confirmation requires a positive order amount, positive item quantity, matching
item totals, and a non-cancelled order. Identity, current role, prices and totals
are derived server-side. Strict request validation rejects extra fields.

Refund (`POST /api/order/:orderId/payment/refund`, empty body) records an ADMIN's
attestation of an independently verified refund; it does not transfer money.
Cancellation (`POST /api/order/:orderId/cancel`, empty body) records the actor and
makes cancellation terminal. Completed orders cannot be cancelled through this
API. Payment state remains separate from fulfillment state.

Order row locking serializes competing payment operations. Order and reference
uniqueness rejects duplicates with 409, including concurrent requests. A failed
transaction leaves no payment record. Confirmation facts are immutable; a paid
record can transition only once to REFUNDED with refund actor/time. Payment and
cancellation evidence cannot be deleted. Paid purchase facts and all existing
item snapshots are protected by database triggers. Operators reconcile recorded
confirmations/refunds with their independently held settlement records, investigate
mismatches, and record verified refunds rather than deleting history.

## Ranking

Public `GET /api/resto/best-seller?page=1&limit=20` returns `data.restaurants` and
`data.pagination`. `soldQuantity` is a decimal string from PostgreSQL's bigint
`SUM(quantity)`. Only persisted PAID evidence and non-CANCELLED orders contribute.
REFUNDED orders and unpaid orders (including COMPLETED ones) contribute nothing.
Restaurants without eligible quantities are absent. Sort is quantity descending,
then **numeric restaurant ID ascending** (the schema uses serial IDs, not UUIDs).
Count and page are read in one repeatable-read, read-only transaction. Pagination
bounds are shared with catalog listing: default 20, maximum 100. Separate HTTP
pages can change as settlement changes; a single response has a coherent snapshot.

## Verified isolated execution and recovery

The Session 5C.4 tooling accepts PostgreSQL URLs on `127.0.0.1` or
`localhost`, with port 5432 (explicit or default), naming `foody_5c4_test_20261011131646` by default, without query parameters or
fragments. Additional isolated databases require an explicit `TEST_DATABASE_NAME`
matching `foody_5c4_test_` plus 14 digits and an exactly matching `DATABASE_URL`.
The guard refuses development/production names and mismatched identities.
For example: `postgresql://127.0.0.1:5432/foody_5c4_test_20261011131646`.
A local username may be supplied in the URL or through `PGUSER`; obtain the
existing role locally and verify it using psql rather than hardcoding an
Android username. No cluster creation or service management is needed.

`scripts/isolated-database-guard.ts` verifies `current_database()` on the same
connection before every SQL operation, including migration and HTTP writes. The
only recovery exception is ROLLBACK on an aborted transaction: PostgreSQL cannot
SELECT there, so rollback uses that connection's previously verified identity.
Rollback discards pending writes and cannot switch databases. The guard is
verification tooling and is never loaded by the production application.

Apply with `npx tsx scripts/migrate-payments.ts` and the above environment plus
required application environment configuration. On this shared Android dependency
installation, set `ESBUILD_BINARY_PATH` to the absolute existing
`node_modules/@esbuild/android-arm64/bin/esbuild` path. This runner is restricted
to this session's isolated DB; deployment to another environment requires a
separately reviewed operator migration entry point.

Base migrations retain their original history. Payment SQL is additive and uses
`drizzle.payment_migrations` separately. Verified first application and rerun:
three base migrations and one payment migration, unchanged on rerun. No automatic
startup migration occurs. Production deployment was not attempted. Before future
deployment, take a verified backup, apply during a controlled window, monitor
errors and reconcile evidence. Roll application deployment back if necessary;
retain additive schema/history and payment records, do not delete financial
records or rewrite applied migration history.

Run `npx vitest run --config vitest.session-5c4.config.ts` with the exact DB URL
and PGUSER. It runs the payment/ranking suite and app/OpenAPI/order-schema
regressions. Fixtures are created only in the authorized disposable DB. Teardown
refunds this run's outstanding paid fixtures through valid evidence transitions;
immutable history is retained. Repeated runs therefore leave no eligible fixture
sales. Never seed sales into an application database.

Full regression uses the default Vitest configuration with the same identity guard.
Auth fixtures use unique emails and delete only their own rows. Catalog/search/
recommendation suites verify the configured test identity and retain scoped cleanup.
Set `ORDERS_TEST_DATABASE_URL` to the same URL to run rollback-only storage invariants.
No test setup overwrites `DATABASE_URL`. Provision a clearly named isolated test DB,
verify its identity, and apply migrations before running `npm test`; no suites are
excluded. Payment fixtures retain immutable history and refund eligible evidence
on teardown. Never disable protective triggers to clean test fixtures.

Security review: authentication/current ADMIN role, forged financial input,
transaction conflicts, paid purchase/evidence immutability, refund transitions,
cancellation exclusions and absence of fulfillment-derived payment were checked
by targeted HTTP and PostgreSQL tests. Trust remains manual operator attestation;
provider verification and money movement are outside this increment.
