# Backend integration readiness — overnight handoff

Date: 2026-10-12 UTC. Repository: SidiqLabs/restaurant-web-backend.
Workspace: `/workspaces/restaurant-web-backend`, GitHub Codespaces, branch `main`.
Mission status: **PARTIAL overall; approved Staff Assignment and existing API
documentation/QA phases complete.** Browser interaction, frontend adapters and
unspecified/provider-dependent features are not claimed complete.

## Baseline, phases and commits

Requested baseline: `9049db84c119d7027bbb06027aac3bab9e9ab62f`.
Actual starting HEAD: `442b72fd8052909a6f27db844db5c8ff684fc918`, the earlier
DRAFT Staff contract/handoff commit. The requested baseline was verified as an
ancestor. Pending scoped implementation was preserved; no unrelated work was
overwritten. No initial active locks existed.

| Order | Phase / acceptance criteria | Outcome |
|---|---|---|
| 0 | Targeted governance, routes, existing contracts, pending changes and dependency discovery | Completed; no separate ordered roadmap found |
| 1 | Approved staff membership and assignment; current role/ownership, active same-restaurant eligibility, revocation, unchanged lifecycle; targeted tests and QA | Feature commit `7341fa60da54e3d1c3619344868d5175b351a86a` |
| 1 correction | Final integration exposed STAFF middleware intercepting public Reviews; scope auth to matching operations and preserve private-route denial | Correction commit `1563da87681381f9c823130471c68ffcd17f0b6c`; affected 64/64 PASS |
| 2 | Document existing manual payment/cancellation and Best Seller routes; verify exact route/spec coverage, responses, auth and Swagger assets | Completed, documentation-only runtime contract changes |
| Final | Full isolated regression, migration compatibility, production compilation and live spec validation | 169/169 PASS; details below |

Only documented, independently specified work was implemented. Generic targets
such as payouts/uploads are not accepted specifications. Every edit phase used
exact-path lock checks/ownership. Locks were released before switching scopes;
the final documentation scope is released at Git closeout. No push or deployment.

## Endpoint inventory

All **34 implemented application operations** are now in OpenAPI. Coverage tests
derive mounted methods/paths from app/router source and compare them with the
spec, including exact dynamic parameter names. `/api-docs`, its assets and
`/api-docs.json` are documentation delivery routes, outside the operation count.

| Method | Path | Access / purpose |
|---|---|---|
| GET | `/health` | Public process health; not DB readiness |
| POST | `/api/auth/register` | Public CUSTOMER registration |
| POST | `/api/auth/login` | Public credential verification |
| GET | `/api/auth/profile` | Authenticated current identity |
| GET | `/api/resto` | Public catalog list |
| POST | `/api/resto` | Current OWNER/ADMIN, caller-derived ownership |
| GET | `/api/resto/search` | Public literal search |
| GET | `/api/resto/recommended` | Public bounded catalog fallback |
| GET | `/api/resto/best-seller` | Public ranking from persisted PAID evidence |
| GET | `/api/resto/{restaurantId}` | Public restaurant detail |
| PATCH | `/api/resto/{restaurantId}` | Owning OWNER/global ADMIN |
| GET | `/api/resto/{restaurantId}/menu` | Public menu list |
| POST | `/api/resto/{restaurantId}/menu` | Owning OWNER/global ADMIN |
| GET | `/api/resto/{restaurantId}/menu/{menuId}` | Public scoped menu detail |
| PATCH | `/api/resto/{restaurantId}/menu/{menuId}` | Owning OWNER/global ADMIN |
| PUT | `/api/resto/{restaurantId}/staff/{staffId}` | Owning OWNER/global ADMIN membership management |
| GET | `/api/cart` | Current CUSTOMER owned cart |
| POST | `/api/cart` | Current CUSTOMER add/increment |
| DELETE | `/api/cart` | Current CUSTOMER clear |
| PUT | `/api/cart/{id}` | Current CUSTOMER owned line quantity |
| DELETE | `/api/cart/{id}` | Current CUSTOMER owned line deletion |
| POST | `/api/order/checkout` | Current CUSTOMER; owned cart + Idempotency-Key |
| GET | `/api/order/my-order` | Current CUSTOMER owned history |
| POST | `/api/order/{orderId}/status` | Owning OWNER/global ADMIN, PAID single-hop lifecycle |
| PUT | `/api/order/{orderId}/staff` | Owning OWNER/global ADMIN assignment/reassignment |
| GET | `/api/order/{orderId}/staff` | Owning OWNER/ADMIN or assigned active same-restaurant STAFF |
| POST | `/api/order/{orderId}/payment/confirm` | Current ADMIN independent manual settlement attestation |
| POST | `/api/order/{orderId}/payment/refund` | Current ADMIN independent manual refund attestation |
| POST | `/api/order/{orderId}/cancel` | Current ADMIN; existing cancellation invariants |
| POST | `/api/review` | Current CUSTOMER owned completed checkout purchase |
| GET | `/api/review/my-reviews` | Current CUSTOMER owned reviews |
| GET | `/api/review/restaurant/{restaurantId}` | Public active reviews/summary |
| PUT | `/api/review/{id}` | Current CUSTOMER active owned review |
| DELETE | `/api/review/{id}` | Current CUSTOMER owned review soft deletion |

New Swagger payment schemas describe actual returned payment evidence and full
cancelled-order data, not a hypothetical provider payload. Confirmation requires
reference, refund/cancel accept absent or empty body. All are explicitly ADMIN
operations. Best Seller documents decimal-string soldQuantity, numeric ID tie
ordering, bounded pagination, and empty results. No financial behavior changed.

## Actual QA evidence

Environment: Node v24.21.0, npm 11.19.0, PostgreSQL 18.6, existing disposable
container `foody-validation-20261012`. Identity verified as
`foody_5c4_test_20261012000000` on loopback 5432. Tests use the existing same-
connection isolated-database guard. No shared/production DB or frontend was used.

| Check | Observed result |
|---|---|
| Staff + lifecycle initial/final scoped runs | 39/39, then 42/42 PASS before full integration |
| API-contract/OpenAPI/payment-ranking scoped tests | 17/17 PASS, 3 files |
| First full integration | 160/168 PASS; 8 public Reviews failures from overbroad STAFF auth |
| Staff routing fix affected regression | 64/64 PASS (22 Staff + 21 Reviews + 21 lifecycle), 3 files |
| Final full `npm test`, with ORDERS_TEST_DATABASE_URL set to the same isolated DB | **169/169 PASS**, 15/15 files, zero failures/skips, exit 0; start 15:42:11 UTC, duration 28.76 s |
| Final application typecheck | `npm run typecheck` PASS |
| Final test-inclusive typecheck | `tsc -p tsconfig.eslint.json --noEmit` PASS |
| Final lint | `npm run lint` PASS; earlier OpenAPI any-inference failures corrected |
| Production compilation | `npm run build` PASS |
| Generated staff schema/snapshot comparison | PASS |
| Staff additive migration rerun | PASS, exit 0; histories unchanged |
| Route/OpenAPI method-path coverage | PASS, all 34 operations |
| Formal OpenAPI validation | PASS using @apidevtools/swagger-parser 13.1.0 |
| Live served OpenAPI validation | HTTP 200, formal validator PASS, 34 operations |
| Swagger delivery | HTTP 200 UI HTML, CSS, bundle/init JS; all Swagger assets also covered by contract tests |
| Browser rendering, console, interactive Authorize/Try it out | **UNVERIFIED**; no browser runner available |
| Scoped/staged diff whitespace and file review | `git diff --check`/staged checks before commit; final Git result reported separately |

The validator was installed only in `/tmp/foody-api-validation-20261012`; no
package/dependency files in the repo changed. Sandbox DNS initially blocked the
install; authorized network retry succeeded. No provider credentials were used.
Live spec artifact: `/tmp/foody-openapi-20261012.json` (temporary, not committed).
Live smoke checks: health/UI/assets/Best Seller HTTP 200; unknown public Reviews
restaurant HTTP 404; unauthenticated STAFF assignment read HTTP 401.

## Migration and recovery state

Staff adds `restaurant_staff` and `order_staff`, with unique membership identity,
active/revoked constraint, one assignment per order, restrictive FKs and composite
restaurant consistency. Current STAFF role and active membership are checked in
transactions rather than trusted from JWT/client fields. STAFF lifecycle access
remains denied. Revocation/reassignment races and rollback were tested.

Verified migration histories: 3 base + 1 payment + 1 cart + 1 checkout + 1 reviews
+ 1 staff. Existing applied SQL/journals were untouched. Initial Staff application
occurred in the earlier resumed session; its rerun and all constraints/integration
were verified here. No production migration occurred. Deployment requires its
own authorization, backup and recovery plan; retain additive data/history during
application rollback. Test fixtures remain only in the disposable database.

## Swagger access and manual verification

The production build was smoke-tested at `http://localhost:3001/api-docs/` and
the JSON contract at `http://localhost:3001/api-docs.json`.

In Codespaces: open **Ports**, forward **3001**, keep it private, and use **Open
in Browser**, then append `/api-docs/` to that forwarded URL. The exact forwarded
hostname and browser accessibility are UNVERIFIED; no remote deployment exists.
If the verification process has stopped, use the repository's normal startup:
configure DATABASE_URL for an authorized non-production DB, JWT_SECRET with a
locally generated secret, and optionally PORT=3001 in your shell/ignored local
environment, then run `npm start` (build already passed). No secrets belong in
this handoff. No environment file was created by this session.

For Swagger, register/login a CUSTOMER for customer operations, copy the returned
accessToken into **Authorize**, and use real catalog IDs. OWNER/ADMIN/STAFF flows
require legitimately provisioned accounts with those current DB roles. Registration
does not grant roles; no hidden role-grant endpoint or universal token exists.
Integration tests prove roles using isolated fixtures; those fixture password
hashes are not a provisioned interactive-account strategy. Role provisioning
policy remains a gap, not an implicit authorization to edit application data.

## Frontend integration checklist

- Configure the API origin and allowed CORS origin; send Bearer tokens only to
  authenticated operations and handle 401/403/404/409 explicitly.
- Catalog/search/recommendation DTOs contain persisted fields. Adapt `address`
  versus client `place`; handle absent media/categories/rating metadata without
  fabricated values. Recommended is an ID-ordered fallback, not personalization.
- Cart: single restaurant, max 50 menu lines, quantities 1..99; show unavailable
  items and explicit clear/switch choice on 409. Refetch server catalog prices.
- Checkout: generate/reuse Idempotency-Key for retries of the same purchase;
  do not delete cart again after success. Server consumes selected lines only.
  Render server zero fees and pending/unpaid state; add pending/all history
  filters and use the server-calculated rupiah totals and immutable snapshots.
- Reviews: use public summary/count; public identity omits user.id and order
  transactionId for privacy. Only owned COMPLETED checkout purchases qualify.
- Staff: activate membership through OWNER/ADMIN, assign with expectedStaffId
  null initially or the prior UUID on reassignment; refetch on 409. Revoked or
  role-changed staff lose read access; assignment grants no transition permission.
- Best Seller: keep soldQuantity as a decimal string; do not infer settlement
  from fulfillment. Administrative payment attestation is not customer checkout
  success and must never be driven by client financial claims.
- No frontend files changed; actual frontend end-to-end behavior is UNVERIFIED.

## Remaining gaps and next safe actions

| Gap | Reason / next decision |
|---|---|
| Gateway, webhooks, automatic settlement, refunds that move funds, payouts | Provider choice/credentials, verification, reconciliation and financial policy unspecified; blocked, no simulated success |
| Zero-price order fulfillment | Lifecycle requires PAID; free-order settlement policy unspecified |
| STAFF lifecycle transitions | Explicitly not granted; separate permission decision required |
| Interactive privileged account provisioning | No approved role-grant/onboarding workflow; use existing legitimately provisioned accounts |
| Uploads/media/categories/distance/personalized recommendations/admin dashboards | Broad target ideas lack independently approved contracts/provider setup; not implemented |
| Staff lists/unassignment, durable lifecycle audit ledger, review moderation/retention jobs | Not in approved scope/specification; require explicit requirements |
| Browser/manual Swagger and frontend adapters | User can verify through private Codespaces port; adapters tracked above |
| Production migrations/deployment/push | Not authorized; no remote synchronization claimed |

All currently documented frontend backend operation paths were found implemented;
the concrete missing contract gap was Swagger coverage, which is now filled.
Frontend-integration-ready means the verified API contracts and adapter checklist
are available, not that the unchanged frontend already works end to end.
Do not rerun setup or broad audits in the next session: inspect final Git/locks,
reuse this evidence, and select only an approved independent specification.
