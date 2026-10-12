# Order Lifecycle API

## Contract

`POST /api/order/{orderId}/status`, authenticated Bearer token, JSON body:

```json
{"expectedStatus":"PENDING","status":"CONFIRMED"}
```

UUID order ID and both case-sensitive existing enum values are required.
Unknown body/query fields are rejected, including actor, ownership, payment,
totals and timestamps. This is an additive endpoint; existing Checkout,
customer history, manual Payment, cancellation and Reviews contracts are intact.
No frontend integration is included.

HTTP 200:

```json
{"success":true,"data":{"order":{"id":"<order UUID>","restaurantId":1,"status":"CONFIRMED","paymentStatus":"PAID","updatedAt":"<ISO timestamp>"},"repeated":false}}
```

Only minimal fulfillment fields are returned, without customer identity,
delivery details, payment reference or settlement actors. OpenAPI describes
the same operation at `/api-docs.json`.

## State machine and authorization

`PENDING → CONFIRMED → PREPARING → READY → COMPLETED`, exactly one hop.
No skips, reversal, self-transition or transition out of terminal states.
Cancellation remains the existing ADMIN `POST /api/order/{orderId}/cancel`;
its existing service rejects COMPLETED/CANCELLED orders.

The current database role must be RESTAURANT_OWNER with
`restaurants.owner_id` equal to the authenticated actor, or explicitly ADMIN
with global administrative authority. JWT only establishes identity; payload
claims confer no permission. CUSTOMER and RESTAURANT_STAFF are denied.
There is no staff-to-restaurant assignment relation in the current model;
staff access requires a separately authorized assignment capability, never
inference from role alone.

Every forward hop and repeat requires current `order_payments.status=PAID`.
Checkout PENDING does not imply settlement. Only the existing independently
authorized ADMIN manual settlement operation creates that evidence, with its
purchase-fact checks. Lifecycle never changes payment, totals, purchase items
or checkout snapshots. REFUNDED, missing evidence and free orders without a
defined settlement policy cannot progress through this endpoint. No gateway,
refund implementation or production settlement is introduced here.

## Idempotency, transactions and concurrency

`expectedStatus → status` must itself be a valid edge. If current order status
is expectedStatus, update status/updatedAt atomically. If current status is
already the target, return `repeated=true` without writing or changing time.
A retry whose target has been passed is stale and conflicts. A self-transition
is not a retry. Repeats revalidate current role, restaurant ownership and PAID;
after a refund even an earlier successful hop's repeat returns conflict.

The repository transaction locks current actor FOR SHARE, order FOR UPDATE,
and restaurant FOR SHARE, then reads settlement evidence. This follows the
existing Payment actor/order lock order. Payment confirm/refund/cancellation
serialize on the same order lock. Role/ownership changes wait or are observed
after the lock wait. Compare-and-swap UPDATE additionally requires expected
status. This prevents duplicate writes and stale overwrites; a valid next-hop
request may succeed if its expected predecessor commits before it gets the
lock. Response describes the transaction's state, not future refund activity.

Exceptions roll back the transaction. Only status and updatedAt are written.
Existing PostgreSQL enums, foreign keys, total/timestamp checks, purchase
immutability and paid/checkout identity protection remain unchanged.
No new schema or migration is required; applied migrations are not rewritten.
The state machine is enforced by this official application service, not a new
global SQL trigger. Privileged SQL operators remain responsible for avoiding
direct status edits; no database-superuser security guarantee is claimed.
No durable transition-event ledger is added in this session.

## Reviews eligibility

An owned checkout-backed order reaching COMPLETED through this endpoint
satisfies existing Reviews eligibility. Reviews' CUSTOMER/order/purchased-menu
checks and one-review-per-order policy remain unchanged. Legacy orders without
checkout metadata remain ineligible. Refund policy after completion remains
the existing separate domain: refund does not rewind completion or retroactively
change Reviews eligibility in this session.

## Errors

All errors use `{success:false,message}` (unexpected errors may include a
requestId). HTTP 400 invalid UUID/schema/unknown input; 401 missing/invalid
identity; 403 denied role; 404 missing order or foreign restaurant scope;
409 illegal/stale edge or unsettled payment; 500 safe internal error with
rollback. No SQL, stack trace, credentials or sensitive request body is logged
by the controller.
