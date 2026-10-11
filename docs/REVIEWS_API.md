# Restaurant Reviews & Ratings API

Scope: Reviews only, following completed Cart/Checkout/Payment sessions.
`PROJECT_CONTEXT.md` includes reviews in backend direction; no separate ordered
roadmap file was found. This explicitly authorized session adds the Reviews
module without changing existing Cart, Checkout, Payment or catalog contracts.

## Eligibility and ownership

Authenticated current CUSTOMER only for create, own listing, update and delete.
A review requires a real persisted checkout order owned by that customer, for
that restaurant, in the existing `COMPLETED` fulfillment state. Checkout metadata
must exist: a legacy foundation row without placement evidence does not qualify.
Cart presence and frontend payment/status claims never establish eligibility.
Payment state is separate: completion is the eligibility signal; no payment
attestation is inferred, and no PAID requirement is invented. Later refunds or
fulfillment changes do not retroactively delete a valid historical review.

The backend already stores COMPLETED, but has no authorized fulfillment-transition
API in this baseline. Ordinary newly placed PENDING orders cannot yet qualify
through a complete customer-facing workflow. This session adds no bypass, seed,
completion endpoint or order/payment change. Tests transition only synthetic
orders in an explicitly guarded disposable database.

One review per order (orders already represent one restaurant), backed by a
persistent unique order index. A second completed purchase at the same restaurant
may be reviewed separately. Duplicate POST returns 409 rather than creating
another row. Serial customer locks plus database uniqueness protect concurrent
submissions. Only the current CUSTOMER owner may edit/delete; ADMIN, owner and
staff have no moderation bypass in this increment.

DELETE is terminal soft delete. Deleted rows disappear from both listings and
aggregate, but keep the unique reservation; re-reviewing that order and restoring
or editing deleted rows are not permitted. Missing and other-customer review/order
references produce the same 404, preventing private resource enumeration.

## Actual frontend contract

Read SidiqLabs frontend `src/types/review.ts`, `src/services/queries/reviews.ts`,
`src/components/orders/ReviewModal.tsx` and restaurant `ReviewSection.tsx`.
No frontend file was modified.

POST `/api/review`, bearer required:

```json
{
  "transactionId": "00000000-0000-4000-8000-000000000001",
  "restaurantId": 1,
  "star": 4,
  "comment": "Great meal",
  "menuIds": [2]
}
```

`transactionId` is the order UUID returned by Checkout; restaurant/menu IDs are
positive int32 numbers. `star` integer 1..5. Trimmed comment 1..2000 characters.
`menuIds` is a nonempty unique subset of 1..50 menus actually purchased in that
order, never an arbitrary current catalog selection. A menu may now be unavailable
or repriced: names/prices/quantities are immutable order snapshots. No client
identity, price, ownership, timestamps, deletion or internal fields accepted.
Strict validation also rejects unknown query fields and coerced numeric bodies.

201 `{success:true,message,data:{review}}`. Owned review includes numeric `id`,
`star`, `comment`, UUID `transactionId`, ISO `createdAt`/`updatedAt`,
`restaurant:{id,name,logo:""}`, and `menus:[{menuId,menuName,price,quantity,type:"",
image:""}]`. Current restaurant name and purchased menu snapshots are used.
Blank media/taxonomy fields reflect absent backend catalog media.

PUT `/api/review/{id}`, bearer required: `{star,comment}` only, both required;
200 `{success:true,data:{review}}` includes the existing frontend's required
id/star/comment/updatedAt/restaurant plus owned review details. Order, restaurant,
owner and selected menus remain unchanged.

DELETE `/api/review/{id}`, bearer required: empty body/query;
200 `{success:true,message}`. Repeated DELETE returns 404.

GET `/api/review/my-reviews`, bearer required:
200 `{success:true,data:{reviews:OwnedReview[],pagination}}`.

GET `/api/review/restaurant/{restaurantId}`, public:
200 `{success:true,data:{reviews:PublicReview[],pagination,
summary:{reviewCount,averageRating}}}`. Missing restaurant returns 404; an existing
restaurant with no active reviews returns empty list/count 0/average 0.

Privacy adjustment to the frontend declaration: public reviews omit
`transactionId` and `user.id`; attribution exposes only `user:{name,avatar:""}`.
The current frontend declarations require these unused fields (including a
numeric user ID incompatible with backend UUID identities). Update those types
to omit the private identifiers. Inspected review display uses name/avatar and
review ID, not customer/order identifiers. Owned results retain the order UUID.
This is an explicit privacy contract adjustment, not a fabricated numeric ID.
Public reviewer display name and selected purchased-menu details are visible
with the review; email/contact, role, password, customer UUID and order UUID are
not exposed. Render comments as text; rich HTML is not a supported contract.

## Pagination and ratings

Both listings accept only `page` (default 1, 1..10000) and `limit` (default 10,
1..100), rejecting duplicate/unknown query values. Newest `createdAt DESC,
id DESC` provides deterministic ties. Pagination is `{page,limit,total,totalPages}`;
beyond-last pages retain total and have no rows. Empty totalPages is 0.

Public summary uses **all active** reviews, not just the page, computing count
and numeric average rounded to 2 decimal places. This is a rating, not money.
Count, average, page and selected snapshot data use one repeatable-read read-only
transaction, so update/delete races cannot yield mixed aggregate/page evidence.
No denormalized rating cache or counters need reconciliation. Existing catalog
endpoints are unchanged; authoritative ratings for this increment are returned
by the Reviews restaurant endpoint, not silently invented in catalog responses.

## Persistence, errors and safety

`src/db/review-schema.ts`, `drizzle/reviews/0000_restaurant_reviews.sql` add
reviews/review_menus and a separate `drizzle.review_migrations` ledger, after
base/payment/Cart/Checkout. Applied migration files are never rewritten.

FKs preserve customer/restaurant/order integrity and order restaurant matching.
Constraints enforce stars/comments/timestamps; indexes cover customer/restaurant
pagination and order/menu uniqueness. Triggers verify current CUSTOMER and owned
COMPLETED checkout at creation, purchased menu membership and <=50 selected menus.
Deferred commit validation requires at least one selected menu. Review identity
and created time cannot change, soft deletion is terminal, physical deletion is
rejected, and selected-menu UPDATE/DELETE is rejected. API offers no operation
that adds selection links after creation. Direct privileged SQL can add another
purchased menu within the bound; DB ownership privileges remain an operator duty.

Mutation transactions lock customer/current role, owned order eligibility and
owned review as needed, preserving atomic review + menu writes and rollback.
No Cart consumption, order state change or payment write occurs. Unexpected
errors return generic 500 and log only operation/request ID, not raw SQL,
parameters or review text. 400 invalid input/selection; 401 authentication;
403 current role; 404 absent/foreign resource; 409 incomplete/duplicate order.

`scripts/migrate-reviews.ts` is a disposable-test-only guarded entry point. It
requires explicit loopback DATABASE_URL and TEST_DATABASE_NAME matching the
established `foody_5c4_test_` + 14-digit convention and verifies connection identity
before each operation. It applies all five streams in order; it is not a
production migration command. No existing shared/user/production DB was migrated.
Production rollout requires operator backup, forward migration and recovery
review. Application rollback can disable new routes while retaining review data;
never drop purchased evidence or rewrite applied migrations as recovery.

No moderation workflow, deletion retention/anonymization job, delivery API,
frontend adapter or catalog-rating integration is implemented in this session.
Executed evidence is recorded in `docs/SESSION_REVIEWS_HANDOFF.md`.
