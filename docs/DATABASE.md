# Foody Backend Database Rules

## 1. Purpose

PostgreSQL is the authoritative persistent database for Foody application
state.

Drizzle ORM is the planned TypeScript database access and migration tool.

The ORM does not replace relational database design, database constraints,
transactions, or deliberate migration planning.

## 2. Core Principles

Database design must preserve business correctness before convenience.

Core rules:

- schema changes use migrations
- critical relationships use constraints
- authoritative money uses integer rupiah
- orders preserve historical purchase facts
- mutable catalog data must not rewrite order history
- transactional invariants use database transactions
- runtime database access follows least privilege
- queries exposed through APIs are bounded
- backup strategy includes restore testing

## 3. Schema Evolution

All schema changes must be represented by migrations.

Do not make undocumented production schema changes manually.

Once a migration has been applied to a shared or production environment,
do not casually rewrite it to change history.

Corrections should normally use a new migration.

Migration review must consider:

- existing data
- constraints
- indexes
- locking behavior
- deployment ordering
- downtime risk
- application compatibility
- rollback or forward-recovery strategy

## 4. Naming Conventions

Initial database naming conventions are:

- tables use snake_case
- table names are plural where practical
- columns use snake_case
- primary keys use id
- foreign keys use <entity>_id
- creation timestamps use created_at
- update timestamps use updated_at
- deleted_at is used only where soft deletion is justified

Do not introduce competing naming conventions without an explicit reason.

## 5. Identity Domain

Target identity persistence includes:

- users
- user addresses
- authentication/session state required by the final auth design

User records must never contain plaintext passwords.

Authentication-sensitive state should be separated from public profile data
when doing so improves security and lifecycle management.

Email or other identity fields requiring uniqueness must be protected by
appropriate database constraints, not application checks alone.

## 6. Merchant Domain

Target merchant persistence includes:

- restaurants
- restaurant staff or membership
- restaurant media associations
- restaurant categories where required

Restaurant ownership and staff relationships must be explicit.

A user role alone does not prove authorization over a particular restaurant.

Membership relationships should support the authorization model without
duplicating security decisions across arbitrary columns.

## 7. Catalog Domain

Target catalog persistence includes:

- menus
- restaurant-category relationships
- optional menu categories when justified

Every menu belongs to the appropriate restaurant relationship.

Authoritative menu prices use integer rupiah.

Availability and lifecycle state should be represented explicitly when those
features are introduced.

Catalog records are mutable business data and therefore must not serve as
the sole historical source for completed orders.

## 8. Cart Domain

Cart state is mutable.

Target persistence includes:

- carts
- cart items

Cart items may reference current menu records.

Stored cart state is not authoritative for final checkout pricing.

During checkout the backend must revalidate relevant menu, restaurant,
availability, quantity, and price information before creating the order.

## 9. Order Domain

Target order persistence includes:

- orders
- per-restaurant order groups
- order items
- order status history

Orders represent historical business facts.

Order items preserve immutable purchase snapshots.

Snapshot information may include:

- menu identifier or reference
- menu name
- unit price
- quantity
- item total
- image/display reference where appropriate

Historical totals must not change when a restaurant later edits or deletes
catalog data.

## 10. Multi-Restaurant Orders

Foody is designed as a multi-restaurant marketplace.

A checkout may contain items from multiple restaurants.

The model must preserve restaurant grouping within the overall order or
transaction context.

This supports:

- restaurant-specific fulfillment
- restaurant subtotals
- merchant authorization
- future platform fees
- future settlement
- future payouts
- restaurant-specific operational status where required

The exact physical schema is finalized during order-domain implementation,
not invented prematurely in this governance document.

## 11. Order Status History

Important order state transitions should be auditable.

A status-history model should preserve, where appropriate:

- previous state
- new state
- timestamp
- responsible actor or system source
- safe operational metadata

Current state may be stored for efficient reads while history preserves
significant transitions.

Clients must not directly author arbitrary historical entries.

## 12. Reviews

Reviews must be connected to legitimate application relationships.

The backend should be able to verify that the customer purchased from the
relevant restaurant and, where required, the relevant menu items.

Target persistence includes:

- reviews
- reviewed purchase/menu relationships or snapshots where required

Review authorization must not depend only on a transaction identifier
supplied by the client.

## 13. Payment Persistence

Target payment persistence may include:

- payment records or attempts
- provider transaction identifiers
- payment state
- payment events
- idempotency data
- refunds

Provider events should support:

- auditability
- duplicate detection
- controlled state transitions
- reconciliation

Payment state is distinct from order fulfillment state.

## 14. Marketplace Finance

Later marketplace phases may introduce:

- platform fees
- settlements
- payouts

Financial history should favor auditable records and explicit state
transitions over destructive rewriting.

A wallet or accounting ledger must not be improvised without a defined
accounting model and invariants.

## 15. Money

Authoritative monetary values use integers.

For the initial Indonesian market, amounts are represented as integer
rupiah.

Never use floating-point values for authoritative:

- menu prices
- item totals
- order totals
- fees
- discounts
- refunds
- settlements
- payouts

If future calculations can produce fractional values, rounding rules must be
explicit and tested.

The backend, not the client, computes authoritative financial totals.

## 16. Constraints

Critical invariants should be protected by database constraints where
practical.

Relevant tools include:

- NOT NULL
- UNIQUE
- FOREIGN KEY
- CHECK constraints
- relationship uniqueness constraints

Application validation complements database constraints. It does not replace
them.

Race-sensitive uniqueness must not rely solely on a read-before-write
application check.

## 17. Foreign Keys

Relational references should use foreign keys unless a documented
architectural reason justifies otherwise.

Deletion behavior must be intentional.

Do not apply broad cascading deletion to financial or historical business
records without analyzing the consequences.

Completed orders and payment history must not disappear because current
catalog records are removed.

## 18. Transactions

Use database transactions whenever partial success could violate business
invariants.

Likely transactional boundaries include:

- checkout
- order creation
- cart consumption tied to checkout
- multi-record order transitions
- payment event application
- refund bookkeeping
- settlement bookkeeping
- payout bookkeeping

Transactions should remain as short as correctness permits.

Avoid holding a database transaction open across slow external network calls
unless the design explicitly requires it and handles the consequences.

## 19. Checkout Consistency

Checkout must become server-controlled.

The intended transaction boundary should ensure that order creation and the
corresponding cart mutation cannot silently diverge through ordinary partial
application failure.

This replaces the historical frontend behavior where successful checkout
could be followed by a separate best-effort cart deletion.

Exact transaction design is finalized with the checkout implementation and
tested for rollback behavior.

## 20. Concurrency

Correctness must account for concurrent requests.

Do not assume requests execute serially.

Concurrency-sensitive operations may require:

- unique constraints
- atomic updates
- transaction isolation
- row locking
- idempotency keys
- state predicates
- compare-and-set style updates

The selected mechanism must protect a defined invariant rather than being
added ceremonially.

## 21. Indexes

Indexes must follow actual access patterns.

Likely candidates include:

- foreign keys used heavily in joins or lookups
- authentication lookup fields
- restaurant and menu filtering
- order ownership/history queries
- provider transaction identifiers
- idempotency keys

Do not add indexes blindly to every column.

Every index has storage and write costs.

Query plans and measured behavior should guide optimization when performance
work begins.

## 22. Pagination

List queries exposed through APIs must be bounded.

Initial frontend compatibility may use page and limit pagination.

The backend must enforce maximum page-size limits.

Cursor pagination may be introduced later when data volume and access
patterns justify it.

## 23. Derived and Aggregate Data

Not every API response field belongs as a permanent database column.

Fields that may be derived or aggregated include:

- average rating
- review count
- menu count
- price range
- total menus
- total reviews
- distance

Materialization or caching should be introduced only when justified by
measured requirements and with a defined consistency strategy.

## 24. Location

Initial location storage may use latitude and longitude.

Server-side distance computation is authoritative when distance affects
filtering or result selection.

PostGIS is optional.

Introduce PostGIS when real geospatial requirements justify the additional
capability and operational complexity.

## 25. Media Metadata

Binary image/file contents belong in object storage rather than ordinary
relational columns.

Database media metadata may include:

- storage key
- MIME type
- byte size
- checksum
- ownership or association
- created timestamp
- deletion state where required

Provider URLs should not be treated as permanent canonical asset identity.

## 26. Runtime Privileges

The normal application runtime database role follows least privilege.

The application runtime MUST NOT connect as a PostgreSQL superuser.

Where the deployment environment permits it, migration or administrative
privileges should be separated from ordinary runtime privileges.

Application runtime credentials should have only the permissions required
for normal application behavior.

## 27. Environment Isolation

Development, test, staging, and production databases are separate
environments.

Automated tests MUST NOT target production.

Development must not casually reuse production database credentials.

Seed data must not contain real secrets or unnecessary real personal data.

Environment-specific identifiers and credentials belong in configuration,
not hard-coded source.

## 28. Backup and Recovery

A backup is valuable only when it can be restored.

Production planning must define:

- backup mechanism
- retention
- encryption where appropriate
- recovery point objective (RPO)
- recovery time objective (RTO)
- restore procedure
- restore-testing cadence

Managed PostgreSQL backup and point-in-time recovery capabilities should be
used where available and appropriate.

Periodic independent exports may complement provider-managed recovery.

Object storage requires its own versioning, retention, or recovery strategy.

## 29. Restore Drills

Restore procedures must be tested periodically.

A successful backup job alone does not prove recoverability.

Restore drills should verify:

- database restoration succeeds
- application can connect to restored data
- critical relationships remain intact
- expected historical records exist
- recovery documentation is still accurate

Restore testing must avoid overwriting production data.

## 30. Destructive Operations

Destructive production database operations require explicit authorization.

Examples include:

- DROP
- TRUNCATE
- destructive bulk DELETE
- destructive migrations
- production resets

Agents must not execute destructive production operations merely because
they simplify development or testing.

Production recovery implications must be understood before destructive
schema work is approved.

## 31. Migration Safety

HIGH-risk migrations require additional review.

Examples include migrations that:

- rewrite large tables
- remove data
- change financial fields
- change authentication data
- change authorization relationships
- alter order history
- alter payment history
- introduce incompatible constraints

Migration plans should consider staged rollout when a one-step deployment
would create unnecessary operational risk.

## 32. Database Review Checklist

Database changes should verify, as applicable:

- migration exists
- migration is forward-safe
- existing data is considered
- constraints are intentional
- foreign keys are intentional
- transaction behavior is correct
- concurrency invariants are protected
- money remains integer-based
- queries remain bounded
- indexes match access patterns
- runtime privileges remain least-privilege
- backup and recovery impact is understood
