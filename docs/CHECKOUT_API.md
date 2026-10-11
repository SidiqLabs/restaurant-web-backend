# Checkout + Order Creation API

Scope: placement from persistent customer Cart and owned order history only.
No gateway, money movement, fulfillment transition API, reviews or payouts.

## Observed frontend contract and required adapters

Read the actual SidiqLabs frontend `src/types/order.ts`,
`src/services/queries/orders.ts`, `src/services/adapters/checkout.ts`,
`CheckoutClient.tsx`, `OrdersClient.tsx` and payment-success client. The backend
preserves POST `/api/order/checkout` and GET `/api/order/my-order`, the existing
restaurants/items payload, numeric transaction `id`, UUID `transactionId`,
`data.transaction`, grouped snapshots, pricing, pagination and filter shapes.
Numeric `id` is the checkout record; `transactionId` is the persisted order UUID.
Blank logo/image fields reflect absent catalog media.

Necessary frontend adapters (frontend is not modified in this session):

- Send required `Idempotency-Key`: random UUID (or 16..128 ASCII letters,
  digits, underscore/hyphen) generated once per placement intent and retained
  across retries, network timeouts and double clicks. Persist the key alongside
  that intent until resolved; changed intent needs a new key. Do not reuse a
  successful key for a new purchase. The current frontend sends no key, so it
  requires this adapter before checkout can succeed. Missing/invalid key is 400.
- Remove post-checkout client DELETE calls. The backend consumes selected cart
  rows atomically; a subsequent DELETE could erase newly added cart items.
  Invalidate/refetch Cart and Orders instead.
- Use authoritative returned pricing. No delivery/service fee policy exists in
  the backend; both fees are zero. Frontend's estimated 10,000 + 1,000 rupiah
  fees are not charged. This also preserves the established payment invariant
  that order total equals snapshot item totals. Future fee policy is a separate
  authorized domain change.
- Placement returns `status=pending`, `paymentStatus=UNPAID`. Do not show payment
  success from a successful POST or `last_transaction` browser storage. Present
  pending confirmation. A payment-method string is only a preference.
- Add pending/all history filters. The frontend default `done` is preserved,
  so a newly placed order is not returned by that default filter.

## POST /api/order/checkout

Bearer token required; current database role must be CUSTOMER. Identity and cart
ownership derive exclusively from that token. Request/query fields are strict;
client financial/state/ownership fields are rejected.

```json
{
  "restaurants": [{"restaurantId": 1, "items": [{"menuId": 2, "quantity": 2}]}],
  "deliveryAddress": "Jalan Example number 10",
  "phone": "+628123456789",
  "paymentMethod": "Mandiri",
  "notes": "No chili"
}
```

Exactly one restaurant, 1..50 unique selected menus, integer quantity 1..99.
Selection may be a subset of the cart, but quantities must match the current
owned rows exactly; stale or foreign selections return 409. Unselected items,
including unavailable items, remain in Cart. Empty/deleted selections return
409. Address is trimmed, 10..500 characters; phone trimmed, 8..30 characters
from digits, space, `+()-`, with a digit required; optional trimmed notes <=1000
characters. These checks do not certify deliverability or ownership of a phone.
Payment preferences preserve the observed frontend strings: `Mandiri`,
`BNI Bank Negara Indonesia`, `BRI Bank Rakyat Indonesia`, `BCA Bank Central Asia`.

201 envelope: `{success:true,message,data:{transaction}}`, including:
`id`, `transactionId`, `status`, `paymentStatus`, delivery/contact/preferences,
`pricing:{subtotal,serviceFee:0,deliveryFee:0,totalPrice}`,
`restaurants:[{restaurant:{id,name,logo:""},items:[{menuId,menuName,price,image:"",
quantity,itemTotal}],subtotal}]`, ISO `createdAt` and `updatedAt`.
Current server catalog values are authoritative at placement, including price
changes since Cart display. The client must refresh estimates; this endpoint
has no client-price approval token. BigInt arithmetic validates total <=
2,147,483,647 rupiah before any writes (existing order storage int32 limit).
Zero-priced menu items are supported.

## Transaction and idempotency strategy

Every request locks the current customer row FOR UPDATE, matching the Cart
repository's lock order. It rechecks current role, then looks up a persistent
(customer, key) record before requiring cart rows. The canonical SHA-256 intent
hash includes validated/trimmed delivery/preferences/notes, restaurant and
menu-sorted selection. Same key/hash replays the original 201 placement body,
even after cart consumption, catalog changes, payment or fulfillment updates.
Replay always represents the original PENDING/UNPAID placement, not current
status; GET history provides current state. Different hash returns 409.
Keys have no expiration or pruning in this increment.

Within the same PostgreSQL transaction: share-lock current menus/restaurant,
validate availability/ownership/range, insert PENDING order, immutable item
snapshots, immutable checkout facts/key, then delete only selected cart rows.
Delete the empty parent Cart only when no rows remain. Any failure rolls back
all writes and leaves the key available for a retry. No payment is inserted.
Different keys competing for the same consumed cart cannot create two orders.
Concurrent Cart operations serialize on the same customer lock. Different
customers remain independent. Direct SQL writers must respect ownership and
lock discipline; schema invariants additionally protect finalized purchases.

## GET /api/order/my-order

Current CUSTOMER only; returns only orders created via checkout by the caller,
with immutable menu/restaurant/delivery snapshots, current fulfillment and
separate `paymentStatus` (UNPAID/PAID/REFUNDED). Pre-existing storage-foundation
fixtures without checkout metadata are not customer placements and are omitted.

Query: `status=done` default, `page=1` (1..10000), `limit=10` (1..100).
Response `{success:true,data:{orders:Transaction[],pagination:{page,limit,total,
totalPages},filter:{status}}}`. Stable newest placement/id ordering; page/count
come from one MVCC query, snapshot items are immutable. Out-of-range pages keep
the total; empty result has totalPages 0. Unknown/duplicate query fields rejected.

| Filter | Existing fulfillment states |
| --- | --- |
| all | all six states |
| pending | PENDING |
| preparing | CONFIRMED, PREPARING, READY |
| done | COMPLETED |
| canceled | CANCELLED |
| on_the_way, delivered | empty: not modeled in existing domain |

Checkout does not introduce any status transitions or payment-success claims.
400 invalid input; 401 authentication; 403 current role; 409 cart/key/range
conflict. Unexpected failures return the established safe internal-error
response. Responses never expose another customer's order or contact details.

## Additive migration and operational safety

`src/db/checkout-schema.ts` and `drizzle/checkout/0000_checkout_placement.sql`
use a separate `drizzle.checkout_migrations` ledger. Existing base, payment and
Cart migrations are unchanged. Apply after those streams. SQL trigger additions
are explicit supplemental objects not modeled by the Drizzle JSON snapshot.

Constraints/FKs enforce unique customer/key and unique order placement,
bounded metadata/quantity/count, existing restaurant consistency and integer
money. Placement validates ownership, PENDING/unpaid state, nonempty unique
snapshots and exact aggregate total. Checkout facts cannot UPDATE/DELETE;
finalized order identity/customer/restaurant/created time/total cannot change;
new snapshot INSERTs after finalization are rejected. Existing item UPDATE and
DELETE protections remain. Fulfillment/payment updates continue independently.
Triggers apply purchase-specific rules only to orders with checkout metadata.

`scripts/migrate-checkout.ts` is a guarded **disposable test** entry point,
requiring an explicit loopback database named `foody_5c4_test_` plus 14 digits
(the established test guard naming convention), checked on every connection
operation. It applies base/payment/Cart/checkout streams in order. It is not a
production deployment command. No production or existing user database was
migrated in this session. Production deployment requires an operator-reviewed
backup/restore and forward-migration plan. Do not drop immutable purchases or
rewrite applied migrations as a rollback; restore an isolated backup or apply a
reviewed forward fix. Disable new checkout routing on application rollback while
retaining placed orders and their evidence.

Tests deliberately retain immutable synthetic fixtures only in a disposable
isolated database, without disabling security triggers. An injected late-delete
failure trigger is created/removed only there to prove transaction rollback.
See `docs/SESSION_CHECKOUT_HANDOFF.md` for executed QA evidence and limitations.
