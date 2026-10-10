# Orders Storage Foundation

Owner decision: DATABASE-FIRST READINESS. Migration 0002 creates persistent
orders and order_items tables even with zero business records. It inserts no
orders, payments, transactions, sales statistics or rankings.

## Storage contract

Each order belongs to one customer and one restaurant. Multi-restaurant checkout
grouping is deferred; no checkout or transaction model is implied by these tables.
UUID order/item IDs follow the existing identity convention. Foreign keys restrict
deletion of referenced customers, restaurants, orders and menus to retain history.
Composite foreign keys ensure both the order and menu belong to the item's restaurant.
The supporting unique menu index changes no existing catalog values.

Fulfillment status is PENDING, CONFIRMED, PREPARING, READY, COMPLETED or CANCELLED.
PENDING is the default. There is no PAID fulfillment state. Payment attempts, payment
state, transition authorization and status history belong to later sessions.

All money is nonnegative PostgreSQL integer rupiah (maximum 2,147,483,647).
Quantity is a positive integer; line total must equal unit price times quantity.
The multiplication uses bigint to avoid intermediate integer overflow.
Names must contain non-whitespace text. Purchase names, quantities, prices, totals,
references and creation timestamps are immutable: a migration-only trigger rejects
every order_items UPDATE or DELETE, including direct SQL. Catalog edits cannot
rewrite snapshots. Catalog deletion is restricted; archival can be designed later.

Orders have timezone-aware created_at and updated_at; updated_at cannot predate
created_at. A future service must maintain updated_at on writes. Items only have
created_at because they cannot be updated. Indexes support customer history,
restaurant status/history, order items and catalog reference checks.

Order totals are stored but aggregate equality to item sums, nonempty orders,
post-creation item insertion rules and fulfillment transition rules are deferred to
the authorized order-creation service and its transaction design. This foundation
does not expose any write API or claim those invariants are already enforced.

## Migration and recovery

0002_orders_storage_foundation.sql and its snapshot were generated with Drizzle's
local API from the compiled schema because the CLI's installed esbuild binary
targets Android rather than the current Linux runtime. The immutable trigger was
appended explicitly; referenced unique indexes were moved before composite foreign keys; Drizzle snapshots do not model triggers. Preserve it in future
migrations and review changes to order_items carefully.

Session execution status: NOT_APPLIED. No explicitly configured, verified isolated
database was available. A placeholder URL used for offline generation was never
connected to. The tables will exist in a database only after migration execution.

Before applying: positively verify isolated development/test ownership, connection
identity, existing migration journal, backup/recovery and available privileges.
Review 0002, then use the existing migration runner against that verified target.
The migration adds tables, enum, indexes, foreign keys, function and trigger without
rewriting or removing rows. The unique menus index can lock catalog writes during
creation; schedule appropriately. Apply transactionally using the migration runner.

Recovery before commit is transaction rollback. After application, prefer a forward
repair migration and preserve any order history. Do not drop tables or reset data.
No production execution is authorized by this session.

## Verification

orders-schema.test.ts checks storage metadata and migration safeguards without a DB.
orders-storage.test.ts is opt-in via ORDERS_TEST_DATABASE_URL and requires the local
restaurant_web_test database plus the migrations already applied. It checks actual
database identity before writing, creates temporary fixtures in a transaction,
tests constraints and snapshot protection using savepoints, and always rolls back.
It never applies migrations, truncates tables or deletes existing business records.

Do not run the legacy auth suite on a database containing business data: its setup
deletes all users. That pre-existing behavior is outside this focused session.

Observed session QA: 11 tests passed (schema, app and OpenAPI), 1 PostgreSQL
invariant test skipped. Typecheck, lint, build, git diff --check and offline
Drizzle snapshot/schema comparison passed. Database constraints and trigger
behavior have not been executed against PostgreSQL in this session.
