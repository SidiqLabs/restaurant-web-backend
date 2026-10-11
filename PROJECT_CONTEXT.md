# Foody Backend — Project Context

## 1. Purpose

This repository contains the backend service for the SidiqLabs Foody
restaurant marketplace.

Foody is being developed as a production-oriented multi-restaurant
marketplace. It is not designed merely as a bootcamp demonstration.

The backend is responsible for authoritative business rules, persistent
server state, authentication, authorization, marketplace transactions,
and integrations with trusted external services.

Repository:

- Organization: SidiqLabs
- Repository: restaurant-web-backend
- Frontend repository: SidiqLabs/restaurant-web-frontend

## 2. Single Source of Truth

This file is the primary project-level source of truth.

Instruction precedence:

1. Explicit task instruction from the repository owner
2. PROJECT_CONTEXT.md
3. AGENTS.md
4. Domain documentation in docs/
5. README.md
6. Existing implementation patterns

Lower-priority instructions MUST NOT override higher-priority rules.

If implementation and documentation disagree, stop and determine whether
the implementation or documentation is stale before changing behavior.

## 3. Product Direction

Foody targets a real marketplace architecture supporting:

- customers
- restaurant owners
- restaurant staff
- administrators
- restaurants
- menus
- carts
- checkout
- orders
- reviews
- media assets
- payments
- refunds
- marketplace fees
- settlements and payouts

Not every target capability must be implemented immediately.

Features are introduced incrementally and must preserve domain boundaries.

## 4. Architecture Direction

Architecture:

- modular monolith first
- REST API
- independent frontend and backend deployments
- PostgreSQL as authoritative persistent storage
- explicit module boundaries
- external services behind integration boundaries

Initial technology direction:

- Node.js
- TypeScript
- Express
- PostgreSQL
- Drizzle ORM
- Zod
- Pino
- Vitest
- Supertest
- npm

Do not introduce microservices, message brokers, Kubernetes, distributed
transactions, or other infrastructure without a demonstrated requirement.

## 5. Core Engineering Rules

### 5.1 Trust

All client input is untrusted.

The backend MUST independently validate:

- identity
- authorization
- ownership
- input structure
- business invariants
- prices
- totals
- state transitions

The frontend is never authoritative for security-sensitive or financial
decisions.

### 5.2 Domain ownership

Business logic belongs in domain services.

HTTP controllers remain thin.

Database access belongs behind repository/data-access boundaries.

Routes MUST NOT contain substantial business logic.

Database queries MUST NOT be scattered through controllers.

### 5.3 Database

PostgreSQL is the authoritative persistent data store.

Schema changes MUST use migrations.

Business-critical invariants SHOULD be enforced by database constraints
when practical in addition to application validation.

Multi-write operations requiring atomicity MUST use transactions.

Money MUST use integer minor units. For Indonesian rupiah, monetary values
are represented as integer rupiah amounts.

Floating-point values MUST NOT be used for authoritative monetary
calculations.

### 5.4 Orders

Cart state is mutable.

Confirmed order history is historical business data.

Order items MUST preserve immutable snapshots of relevant purchase data,
including names, quantities, and authoritative prices, so historical
orders do not silently change when catalog data changes.

### 5.5 Payments

Payment state and order state are separate concepts.

The backend computes payable amounts.

The client MUST NOT provide an authoritative final price.

Payment provider callbacks/webhooks MUST be authenticated according to
provider requirements and processed idempotently.

Raw card credentials and CVV MUST NOT be stored by Foody.

### 5.6 Authentication and authorization

Authentication proves identity.

Authorization determines permitted actions.

These concerns MUST remain distinct.

Protected operations MUST enforce authorization server-side.

Possession of a valid resource ID does not grant access to that resource.

### 5.7 Secrets

Secrets MUST NOT be committed to Git.

Local secrets belong in ignored environment files.

Production secrets belong in deployment secret management.

`.env.example` may document variable names but MUST NOT contain real
credentials.

### 5.8 Logging

Application logging MUST be structured.

Passwords, authentication tokens, API secrets, raw payment credentials,
and equivalent sensitive values MUST NOT be logged.

Security-sensitive and financial operations require sufficient auditability
without leaking secrets.

## 6. Initial Roles

Target application roles:

- CUSTOMER
- RESTAURANT_OWNER
- RESTAURANT_STAFF
- ADMIN

Role checks alone are not sufficient where ownership or resource-level
authorization is also required.

## 7. API Compatibility

The existing frontend is the initial compatibility consumer.

The backend SHOULD initially preserve compatible endpoint and response
semantics where doing so does not preserve insecure or incorrect behavior.

Existing frontend API patterns include:

- `/api/auth/*`
- `/api/resto/*`
- `/api/cart/*`
- `/api/order/*`
- `/api/review/*`

Compatibility MUST NOT override security, data integrity, or financial
correctness.

Breaking changes require an explicit migration plan.

## 8. External Services

External providers may eventually include:

- object storage
- email
- geocoding/maps
- payment gateways
- monitoring/error reporting

Provider-specific code MUST remain behind integration boundaries whenever
practical.

Core domain logic SHOULD NOT depend directly on provider-specific response
formats.

## 9. Media

Binary media MUST NOT be stored directly in normal relational columns.

Object storage holds file content.

PostgreSQL stores application metadata and references.

Uploads require server-side authorization and validation.

Provider URLs are not assumed to be permanent identifiers.

## 10. Environments

Development, staging, and production are separate environments.

Production credentials MUST NOT be reused as development defaults.

Production databases MUST NOT be casually used for local development or
automated tests.

## 11. Session Discipline

One session has one feature focus.

Do not combine unrelated feature work.

Do not perform opportunistic refactors outside the active scope.

Unrelated dirty work MUST be preserved.

Cross-domain changes require explicit justification.

## 12. Work Locks

Before modifying project files:

1. Run `npm run lock:list`.
2. Identify exact target paths.
3. Run `npm run lock:check -- <path>` for each target.
4. Do not modify a path owned by another active scope.
5. Claim free paths with `npm run lock:add`.
6. Perform the scoped work.
7. Run required verification.
8. Release ownership with `npm run lock:remove`.

Read-only inspection does not require ownership.

Lock implementation details are documented in `docs/work-locks.md`.

## 13. Risk Classification

### LOW

Examples:

- documentation
- tests that do not alter runtime behavior
- isolated non-security refactors

### MEDIUM

Examples:

- normal endpoint implementation
- repository/query changes
- backward-compatible domain behavior changes

### HIGH

Examples:

- authentication
- authorization
- database migrations
- destructive data operations
- file uploads
- checkout
- payments
- webhooks
- refunds
- settlements
- production infrastructure
- secrets
- security middleware

HIGH-risk work requires targeted tests and explicit security review before
completion.

## 14. Definition of Done

A change is not complete merely because it appears to work.

Applicable completion criteria include:

- scope respected
- active ownership respected
- TypeScript checks pass
- lint checks pass
- relevant tests pass
- security implications reviewed
- database migrations reviewed when applicable
- no secrets committed
- no unrelated modifications
- documentation updated when contracts or architecture change
- `git diff --check` passes
- work locks are released when work is complete or abandoned

Production-critical changes additionally require appropriate deployment,
rollback, monitoring, and recovery consideration.

## 15. Current Phase

Current phase:

`Backend application development`

Completed sessions:

- Session 1 — Governance
  - Commit: `7260b7a`
  - Status: COMPLETE
- Session 2 — Backend Foundation
  - Commit: `39b3408`
  - Status: COMPLETE
- Session 3 — PostgreSQL + Drizzle Foundation
  - Commit: `b69d832`
  - Status: COMPLETE
- Session 4 — Auth + Identity
  - Implementation commit: `837ebef`
  - Status: COMPLETE
  - Auth integration tests: 7/7 PASS
  - Full test suite: PASS
  - Typecheck: PASS
  - Lint: PASS
  - Build: PASS
  - Security review: PASS
  - Production dependency audit: 0 vulnerabilities

Historical implementation baseline before Orders Storage Foundation:

`ca0b17d` (verified local main; remote synchronization not checked in this session)

Current documentation/tooling session:

- Session 4.5 — Swagger / OpenAPI
  - Status: COMPLETE
  - Scope: API documentation tooling only
  - Swagger UI: `/api-docs`
  - OpenAPI JSON: `/api-docs.json`
  - Initial documented domain: Auth

Subsequent completed implementation sessions (verified local Git history):

- Session 4.5 CSP correction — `ee06635`
- Session 5b — Restaurant + Menu catalog — `e28efd7`
- Session 5c1 — Restaurant search — `a101382`
- Session 5c2 — Restaurant recommended — `ca0b17d`

Historical Orders Storage Foundation closeout (2026-10-10):

- Orders Storage Foundation; owner `codex`, scope `orders-storage-foundation`.
- Owner decision: **DATABASE-FIRST READINESS**. Real PostgreSQL structures must
  exist independently of business records; never seed fake orders, sales or rankings.
- Adds Drizzle orders/order_items, migration 0002, relational/money checks,
  immutable purchase snapshots and focused schema/database invariant tests.
- One order represents one restaurant; multi-restaurant checkout grouping is deferred.
- Fulfillment status is separate from future payment persistence.
- No Cart, Checkout API, Payments, Best Seller or frontend changes.
- Migration status: **NOT_APPLIED**; no verified isolated database was configured.
  Source/migration readiness does not assert tables already exist in a running DB.
- Migration execution and database invariant verification remain pending.
- Baseline worktree contained only untracked `docs/SESSION_HANDOFF.md`; preserved.
  That older handoff is historical and does not describe the verified current baseline.
- Observed QA: 11 tests passed, 1 opt-in database test skipped; typecheck,
  lint, build, git diff --check and Drizzle snapshot/schema comparison passed.
  Full DB-dependent suites were not run; PostgreSQL execution is unverified.
- Schema/migration review checked restrictive deletion, restaurant consistency,
  integer bounds, snapshot mutation protection and additive migration scope.
- No automatic commit or push. See `docs/ORDERS_STORAGE.md` for limitations,
  migration safety, recovery and opt-in database tests.

Historical Session 5C.4 finalization evidence (2026-10-11):

- Orders Storage Foundation committed as `852cc55`; Payment + Best Seller
  committed as `6f40488c508f84a1c676725a65c66f715155e8b2`.
- Session 5C.4 implementation is complete. Payment confirmation and refund use
  manual current-ADMIN settlement attestation; provider integration and money
  movement remain outside this increment. Best Seller uses persisted PAID
  evidence and excludes cancelled/refunded orders. See `docs/PAYMENT_BEST_SELLER.md`.
- Fresh finalization QA on Debian PRoot Node v22.23.3: full regression 50/50
  tests, 9/9 files, zero failures/skips; typecheck, lint and build PASS.
- Verified existing isolated DB `foody_5c4_test_20261011073800` on loopback
  PostgreSQL 18.2: three base migrations and one payment migration already
  present. Rollback-only storage invariants PASS. No migration ran during
  finalization; no production/development database was used.
- Local main remains `130652af67e3650de3e808d950a7d0ddad096a62`.
  Actual GitHub main verified read-only with `git ls-remote` at
  `6f40488c508f84a1c676725a65c66f715155e8b2`; local main is one documentation
  commit ahead. This is point-in-time remote evidence, not assumed parity.
- Historical focused regression 20/20 is recorded in `docs/SESSION_5C4_HANDOFF.md`;
  it was not separately rerun during finalization. Fresh evidence and reporting
  limitations are recorded in `docs/SESSION_5C4_FINALIZATION.md`.
- Protected untracked handoff/backup files remain preserved. No commit or push
  is authorized for this finalization; documentation awaits owner review.

Session 5C.4 Git closeout subsequently completed at
`0a8342af0c789809dcd5a9718da5fd1f514a3f6b`, with local/remote parity verified.
The above pre-closeout evidence and handoff remain historical records.

Current authorized session — Cart Persistence + API (2026-10-11):

- Starting baseline `0a8342af0c789809dcd5a9718da5fd1f514a3f6b`; verified main,
  origin/main parity and no active locks before scoped ownership acquisition.
- Implementation and QA complete: authenticated CUSTOMER Cart persistence;
  GET/POST/DELETE `/api/cart`, PUT/DELETE `/api/cart/{id}`. No Checkout,
  Orders, Payments, Reviews or frontend implementation changes.
- Preserves observed SidiqLabs frontend request/grouped-response contract and
  numeric item IDs. Add increments duplicates; update replaces quantity.
  MVP limits: one restaurant, 50 menu lines, quantity 1..99 per line.
  Prices are current server catalog values in integer rupiah. See
  `docs/CART_API.md` for availability, concurrency and frontend adapter needs.
- Additive Cart schema/migration uses `src/db/cart-schema.ts` and
  `drizzle/cart/0000_cart_persistence.sql`, tracked by `drizzle.cart_migrations`.
  Existing applied base/payment migrations remain unchanged.
- Newly created disposable DB `foody_5c4_test_20261011112500` verified empty
  before migrations. Migration and rerun PASS; final history 3 base, 1 payment,
  1 cart. No existing user/development/production database was modified.
- Fresh Debian Node v22.23.3 full regression: 72/72 PASS, 10/10 files, zero
  failures/skips, including 22 Cart integration/constraint/concurrency tests.
  Typecheck, test typing, lint and production build PASS. Security review
  covered current-role/ownership checks, forged financial fields, resource
  bounds, transactional conflicts and separation from order/payment writes.
- Protected handoff and backup remain untouched. User explicitly authorized
  focused Cart commit/push after QA; Git closeout/parity is reported separately
  in the final session response. See `docs/SESSION_CART_HANDOFF.md` for evidence.

Next safe step after Git closeout: obtain authorization for the next domain
session. Deployment to any user database requires separate operational review.
