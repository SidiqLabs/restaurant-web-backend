# Cart Persistence + API — session handoff

Date: 2026-10-11. Status: implementation and QA complete; Git closeout evidence
is supplied by the final session report after commit/push. User authorized focused
Cart implementation and normal push to main only after all required QA passes.
Starting baseline: `0a8342af0c789809dcd5a9718da5fd1f514a3f6b`.
Owner/scope: codex/cart-persistence-api.

## Delivered scope

- GET/POST/DELETE `/api/cart`, PUT/DELETE `/api/cart/{id}`, bearer authenticated
  with current CUSTOMER role and token-derived ownership.
- Persistent carts/cart_items, atomic duplicate increments, replacement PUT,
  scoped remove/clear, one restaurant per active cart, maximum 50 distinct menu
  lines and quantity 1..99. Current catalog pricing with bigint intermediate
  arithmetic and JSON safe-integer totals; no client financial authority.
- Shared catalog locks, stable per-customer row lock, relational/duplicate/slot
  constraints. Deleted menus cascade only mutable cart lines; unavailable lines
  remain readable/removable. No order/payment writes.
- Frontend request and response shapes inspected in local SidiqLabs checkout;
  compatibility limitations documented in `docs/CART_API.md`: clear/switch UX,
  availability handling and fallback for absent catalog media/type.
- OpenAPI documentation for all five endpoints. No frontend files modified.
- Cart-only Drizzle snapshot/journal and additive migration; existing base,
  payment and order-domain code/migration histories preserved.

## Fresh observed QA

Environment: native Termux PostgreSQL 18.2, loopback 5432; Debian PRoot
Node v22.23.3 / npm 10.9.9. Existing dependencies and Android-arm64 esbuild
binary reused. No tool reinstalls or database cluster administration.

New disposable DB: `foody_5c4_test_20261011112500`, positively verified before
writes with zero public tables. Its legacy-compatible name is required by the
existing proven isolated test guard; it is not a previous user/test database.
DATABASE_URL and ORDERS_TEST_DATABASE_URL both selected this exact database;
TEST_DATABASE_NAME matched. No credentials or persistent JWT secrets recorded.

- Guarded `npx tsx scripts/migrate-cart.ts`: PASS; identical rerun PASS.
  Real final history: 3 base migrations, 1 payment migration, 1 Cart migration.
- Initial focused test run: 18/20 PASS, 2 failures from test assertions expecting
  POST's extra restaurant field inside GET items. Assertions corrected to check
  each actual frontend response shape; no runtime contract weakened.
- Focused rerun: 20/20 PASS. Two additional role/catalog concurrency tests added.
- Full `npm test`: **72/72 PASS, 10/10 files, zero failures/skips**;
  includes all 22 Cart tests and unchanged legacy regressions. Duration 51.69s,
  start 2026-10-11 11:59:54 UTC / 18:59:54 WIB.
- `npm run typecheck`: PASS. `npx tsc -p tsconfig.eslint.json --noEmit`: PASS.
- `npm run lint`: PASS after fixing three typing issues in new Cart tests;
  no lint suppression or weakened assertions. `npm run build`: PASS.
- Cart Drizzle schema/snapshot comparison PASS; additive SQL review PASS.
  Referenced cart unique index created before its composite FK.
- Final database read-only check: carts=0, cart_items=0, Cart fixture users=0,
  eligible PAID/non-CANCELLED payment evidence=0. Financial test evidence from
  the legacy payment suite is intentionally retained in this disposable DB.
- Raw recoverable QA log: `.session-cart-qa.log` (ignored local artifact).
  WASI experimental warnings occurred; no required gate failed after repairs.

## Security, recovery and operational limits

Reviewed current-role locking, missing identities, cross-customer 404 parity,
strict input/price rejection, quantity and line bounds, bigint math, transaction
rollback and serialization, catalog revalidation and absence of order/payment
side effects. Integration tests execute these controls against PostgreSQL.

Existing tests, authentication, catalog and payment functionality were preserved.
Only additive Cart route/OpenAPI composition touched existing runtime files.
No new dependency added. No production/development/user database modified.

Test migrations are operator-only, not automatic startup behavior. Future Cart
migrations must use the supplemental Cart stream, not rewrite applied SQL. Any
deployment needs backup, identity verification and separately reviewed operator
entry point. Application rollback can use a targeted revert while retaining
additive Cart tables; never reset user work or delete financial history.

Protected file SHA256 values remain unchanged:

- docs/SESSION_HANDOFF.md:
  c362c29e0ffdc84f4531ca9e0e84d61bd8fe62065ecf0f98f17025acafb944f5
- tests/orders-storage.test.ts.bak:
  bbe6ac7a6e5948a853f5ad6be922b6624ca3ecc6d925651f6933699f2ffd743b

Git closeout must stage only owned Cart paths, review contents, recheck main
remote for divergence and push normally. Stop on divergence. Release only this
scope, verify lock:list and full-SHA parity, and report actual results.
No next feature is authorized. Clipboard delivery is not claimed by this handoff.
