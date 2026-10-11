# Cart Persistence + API

Cart is mutable shopping state. This module never creates orders, consumes cart
for checkout, records settlement, or changes payment state.

## HTTP contract

All five endpoints require a valid bearer token and a current CUSTOMER database
role. Missing/deleted identities return 401; other roles return 403. Ownership is
derived exclusively from the token. Query parameters and unexpected body fields
are rejected with 400. Unknown and other-customer item IDs both return 404.

| Endpoint | Request | Success data |
|---|---|---|
| GET /api/cart | No body/query | `{cart: [...], summary: {...}}` |
| POST /api/cart | `{restaurantId, menuId, quantity}` | 201, `{cartItem: {...}}` |
| PUT /api/cart/{id} | `{quantity}` | 200, `{cartItem: {...}}` |
| DELETE /api/cart/{id} | Empty body/query | 200, `{}` |
| DELETE /api/cart | Empty body/query | 200, `{}`; also succeeds when empty |

Responses use `{success: true, message, data}`; controlled failures use
`{success: false, message}`. IDs are positive int32 numbers; path IDs are canonical
decimal strings. Quantities must be JSON integers 1..99. Zero is rejected; use
DELETE to remove a line. No client price, total, identity, role, or state fields
are accepted. Malformed request structure returns 400.

POST increments an existing menu line atomically and preserves its numeric item
ID. PUT replaces quantity. Accumulation beyond 99 returns 409 without mutation.
There are at most 50 distinct menu lines per customer (maximum 4,950 units).
These explicit MVP limits bound response size, locking time and abusive writes;
the 50-line bound is enforced by finite unique slots in PostgreSQL. Adding a
51st line returns 409. Removing a line makes its slot reusable.

An active cart belongs to one restaurant. POST checks that restaurantId matches
the actual menu association. A missing/mismatched menu returns 404. Adding from
another restaurant returns 409 without clearing existing items. The customer
must remove all items or clear the cart before switching restaurants.

GET returns zero or one group:

```json
{
  "cart": [{
    "restaurant": {"id": 1, "name": "Restaurant", "logo": ""},
    "items": [{
      "id": 1,
      "menu": {"id": 1, "foodName": "Nasi", "price": 100, "available": true, "image": "", "type": ""},
      "quantity": 2,
      "itemTotal": 200
    }],
    "subtotal": 200
  }],
  "summary": {"totalItems": 2, "totalPrice": 200, "restaurantCount": 1}
}
```

POST/PUT cartItem has the same item fields plus the restaurant object. Empty
GET is `{cart: [], summary: {totalItems: 0, totalPrice: 0, restaurantCount: 0}}`.

## Catalog and pricing

Prices/names/availability are loaded from the current catalog under shared row
locks. Repricing affects the next response; cart never stores an authoritative
price snapshot. Menu price is nonnegative int32 rupiah. Multiplication and sums
use bigint before conversion to JSON safe integers. The maximum total permitted
by schema bounds is 10,630,044,052,650 rupiah, below Number.MAX_SAFE_INTEGER.
A Cart total may exceed the existing order int32 bound: a future Checkout
service must independently validate its own amount limits, not trust this total.

Unavailable existing items remain visible with `menu.available: false`; GET
totals describe all retained lines at current prices. They are not payable quotes.
POST/PUT for an unavailable menu returns 409; DELETE/clear remain usable.
Physical menu deletion cascades its cart lines. Empty carts return the empty
shape and allow another restaurant on the next add. Referenced order history
still restricts catalog deletion independently; no order constraints are relaxed.

## Frontend compatibility evidence

Read-only inspection used the local SidiqLabs frontend checkout at
`restaurant-web-frontend-sidiqlabs`: `src/types/cart.ts`,
`src/services/queries/cart.ts`, MenuSection, CartClient and CartItemRow.
The five paths, numeric item IDs, request payloads, grouped GET shape and summary
semantics match the observed client. POST add-one increments match MenuSection.
PUT/DELETE optimistic updates roll back on errors; successful mutations invalidate
the cart query, so server repricing is picked up on refetch.

Required frontend adapter changes (no frontend files changed here):

- Handle single-restaurant 409 by offering explicit clear/switch, never silently
  discarding the old cart. Respect quantity 99 and 50-line limits.
- Render unavailable items and disable their increment/checkout selection.
  The existing frontend Menu type needs the additive `available` field.
- Catalog has no image/logo/type persistence. Empty strings represent absence,
  not invented media or categories. CartItemRow passes image directly to
  next/image; adapt it to an existing UI fallback when the string is empty.

## Persistence, concurrency and recovery

`src/db/cart-schema.ts` owns carts/cart_items and imports existing catalog/identity
tables. Customer PK, unique customer/menu and customer/slot indexes, quantity/slot
checks and composite FKs enforce one restaurant, duplicate prevention, bounds,
and menu/cart restaurant consistency. Cascades apply only to mutable cart state.

Every Cart request locks the caller's existing users row FOR UPDATE, including
an empty-cart request. This stable per-customer lock serializes simultaneous
duplicate adds, restaurant switches, quantity updates and clears while holding
current-role authorization stable. Repository writes also filter by customerId.
Different customers use different locks. Catalog rows are held FOR SHARE while
reading/responding, so concurrent catalog changes cannot invalidate a mutation's
validated price/availability. All operations commit or roll back atomically.
GET locks rows but does not insert/update/delete shopping data.

Additive Drizzle migration: `drizzle/cart/0000_cart_persistence.sql`, generated
from the Cart schema with a Cart-only snapshot/journal. The referenced unique
index is ordered before its composite FK. Existing base/payment migration files
and journals are unchanged. Cart uses `drizzle.cart_migrations`, following the
existing supplemental payment pattern, and must be migrated independently.

`scripts/migrate-cart.ts` is an explicit isolated-test entry point, never startup
code. It requires TEST_DATABASE_NAME, reuses the proven identity guard, and
applies base, payment and cart migrations using separate tracking tables.
The reused guard accepts only loopback port 5432 and `foody_5c4_test_` plus 14
digits, hence the compatibility name of this session's newly disposable DB.
Use a newly provisioned disposable DB, verify identity/empty tables first, and
set DATABASE_URL and ORDERS_TEST_DATABASE_URL to it before regression.
Do not point this runner at existing user/development/production data.

Run migrations/tests with documented Debian Node 22 and the existing
Android-arm64 esbuild binary via ESBUILD_BINARY_PATH. Test JWT secrets are
ephemeral; obtain the local PostgreSQL role without committing credentials.
Deployment to another environment needs an independently reviewed operator
entry point and backup. Before application commit, migration failure rolls back.
After application, prefer forward repairs; application rollback can retain the
additive Cart tables. Do not drop financial history or rewrite applied migrations.

Cart schema evolves through its supplemental migration stream; the existing
base `db:generate` configuration covers only the base schema. Future Cart
generation must use Cart schema and Cart snapshot explicitly, as in this session.
