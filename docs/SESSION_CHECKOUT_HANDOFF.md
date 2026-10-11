# Checkout + Order Creation — implementation and QA evidence

Date: 2026-10-11. Feature focus: Checkout + Order Creation only.
Starting local main and fetched origin/main:
`62ad0dc539cf31a4006c9767fa5848685b5a8ee7` (completed Cart feature).
Tracked working tree was clean; only the protected handoff and backup were
untracked. No active locks existed before acquisition.

## Delivered

- Authenticated current-CUSTOMER POST `/api/order/checkout` and GET
  `/api/order/my-order`, with thin controllers, domain services and repositories.
- Single-restaurant selected owned Cart placement; strict bounded validation;
  current catalog availability and authoritative integer-rupiah prices/totals.
- Atomic order/snapshot/idempotency writes and selected-cart consumption.
  Customer locks serialize Cart and checkout; catalog share locks stabilize
  purchases. Persistent customer/key uniqueness and canonical intent hashes
  safely handle same-key retries, conflicting intents and concurrent requests.
- Immutable menu, restaurant, delivery/contact and purchase facts. New orders
  remain PENDING/UNPAID. History reports independent fulfillment/payment state.
  Existing manual-admin payment attestation remains interoperable; no payment
  gateway, fulfillment-transition API, money movement, reviews or payouts added.
- OpenAPI and `docs/CHECKOUT_API.md` document actual observed frontend shapes,
  security-required adapters, errors, state mapping and migration operations.

## Fresh QA

Disposable database `foody_5c4_test_20261011140145` was proven absent before
creation, then verified as the exact connected database with zero public tables.
Native loopback PostgreSQL 18.2 only. Existing user, development, production and
previous-session test databases were not modified.

- Guarded `scripts/migrate-checkout.ts`: initial migration PASS; rerun PASS.
  Final ledger: 3 base, 1 payment, 1 Cart, 1 checkout migration.
- Targeted checkout tests: 28/28 PASS, zero skipped/failed.
- Full `npm test`: 100/100 PASS, 11/11 files, zero skipped/failed; includes
  unchanged 72 existing tests and all 28 checkout tests.
- Native Termux Node v26.4.0: `npm run typecheck`, test TypeScript check
  (`npx tsc -p tsconfig.eslint.json --noEmit`), `npm run lint`,
  `npm run build`: PASS.
- Checkout Drizzle JSON snapshot versus compiled schema comparison: PASS.
- `git diff --check`: PASS. Exact staged-content checks and Git closeout are
  independently verified in the final execution report.

Integration runtime: existing Debian PRoot Node v22.23.3 fallback with the
existing Android esbuild executable. Native Termux argon2 import was freshly
observed failing, so native integration-runtime compatibility is not claimed.
No tools or dependencies were reinstalled. Codex, Git and PostgreSQL stayed on
native Termux. Existing WASI experimental warnings did not fail tests.

Coverage includes HTTP authentication/current-role revocation, cross-customer
cart/history isolation, malformed/forged financial and state input, delivery and
quantity/resource bounds, subset selection, stale quantities, empty/deleted/
unavailable menus, changed catalog prices, zero price, int32 line/aggregate
limits, persistent replay after catalog/cart/state changes, canonical intent,
concurrent same/different-key requests, Cart clear race, catalog-lock waits,
late-failure rollback, immutable snapshots and PostgreSQL constraints, pagination,
state mapping and manual-payment interoperability.

Initial targeted run had 22 PASS / 6 failures: five history failures from an
unaliased Drizzle count subquery, one test expecting 201 instead of the existing
payment endpoint's 200. Both causes were diagnosed and corrected. One synthetic
PAID fixture left by that failed assertion was transitioned to REFUNDED only in
the disposable DB; afterAll now refunds this suite's own settlement fixtures.
No valid tests or security triggers were disabled. Final security review
hardened checkout unexpected-error logging/responses against query/contact-data
leakage; full QA was repeated for that code change.

Raw recoverable execution evidence: ignored `.session-checkout-qa.log`.
Immutable synthetic purchase fixtures remain only in the disposable database.
The temporary failure-injection trigger was verified absent after execution.

## Security and migration review

No client identity, total or payment success is accepted. Current role and
ownership are checked before persistence/replay/history. Strict payloads,
finite item/quantity/page bounds, parameterized DB access and BigInt money
checks prevent ambiguous inputs, overflows and unbounded response pages.
Contact data is returned only to its owner; unexpected checkout errors log only
operation/request ID and return generic errors without raw SQL/parameters.

The migration is additive and uses a separate checkout ledger. Applied
base/payment/Cart migration histories were not edited. FK/uniqueness/checks and
explicit triggers protect placement owner, pending/unpaid initial state,
nonempty unique snapshots, bounded quantity, exact aggregate, immutable purchase
facts and rejection of post-placement item inserts. Established item mutation
and payment protections remain. No security bypass, secret, new dependency or
unrelated feature change was introduced. Production migration execution and
recovery remain operator responsibilities; see the API document.

## Frontend and deployment limitations

The actual frontend requires adapters before using checkout: stable
Idempotency-Key per intent, removal of post-success cart DELETE calls, returned
zero-fee pricing, pending-confirmation UI instead of payment-success claims,
and pending/all history filters. Its current no-key POST deliberately returns
400. No frontend files changed. `on_the_way`/`delivered` are not existing backend
states and return empty pages. Free orders can be placed but this session does
not add a free-order settlement/fulfillment policy. Placement keys are retained
indefinitely; privacy retention/pruning policy is not implemented here.

No deployment or migration against an existing user database occurred. External
clipboard delivery is unverified; this structured evidence is preserved on disk.

## Scope and closeout

Work-lock owner `codex`, scope `checkout-order-creation`; exact owned source,
migration, test, documentation and generated/log paths were checked FREE and
claimed before edits. Release and final lock list are required after Git
closeout. User authorized focused commit/push after all gates; no force, reset,
amend or unrelated staging is permitted. Final commit SHA, normal push and full
local/origin parity are recorded in the execution report rather than inferred
from this pre-commit document.

Protected untracked files remain untouched, with original SHA-256:

- `docs/SESSION_HANDOFF.md`:
  `c362c29e0ffdc84f4531ca9e0e84d61bd8fe62065ecf0f98f17025acafb944f5`
- `tests/orders-storage.test.ts.bak`:
  `bbe6ac7a6e5948a853f5ad6be922b6624ca3ecc6d925651f6933699f2ffd743b`

Stop after closeout. Frontend adapters or the next backend domain require their
own authorized session; do not start them here.
