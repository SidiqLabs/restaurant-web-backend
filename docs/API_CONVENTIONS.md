# Foody Backend API Conventions

## 1. Purpose

Foody exposes a JSON REST API.

The existing restaurant frontend is the first compatibility consumer of the
new backend.

Initial routes retain the /api prefix while the backend internals are
redesigned around cleaner domain boundaries.

Compatibility is important, but security, data integrity, and financial
correctness take precedence over historical behavior.

## 2. Compatibility Surface

Known frontend endpoint families include:

- /api/auth/*
- /api/resto/*
- /api/cart/*
- /api/order/*
- /api/review/*

Observed frontend code and observed live API behavior are compatibility
evidence.

Legacy or unused frontend code does not automatically create a backend
requirement.

In particular, a historical hook referencing an endpoint is not sufficient
reason to implement that endpoint if current application behavior does not
require it.

## 3. Transport

Deployed APIs use HTTPS.

JSON is the default representation for ordinary application endpoints.

Multipart requests are used only where explicitly required, such as
supported file uploads.

Transport security does not replace authentication or authorization.

## 4. Response Envelope

Initial compatibility follows the general response structure:

    {
      "success": true,
      "message": "Success",
      "data": {}
    }

Endpoint-specific application data belongs under data.

Pagination and other endpoint-specific metadata may be included in the
documented data contract.

Production error responses must not expose sensitive implementation details.

## 5. HTTP Methods

Use HTTP methods consistently.

General conventions:

- GET reads resources
- POST creates resources or performs documented creation-style actions
- PUT supports replacement or compatibility update semantics where required
- PATCH represents partial updates when adopted by the endpoint contract
- DELETE removes or deletes resources where permitted

GET must not perform state-changing business operations.

## 6. HTTP Status Codes

Use meaningful and consistent HTTP status codes.

Typical categories include:

- 200 for successful reads, updates, or actions
- 201 for successful resource creation
- 204 for successful operations intentionally returning no body
- 400 for malformed or invalid requests
- 401 when authentication is missing or invalid
- 403 when an authenticated principal lacks permission
- 404 when a resource is unavailable to the caller
- 409 for applicable resource or state conflicts
- 422 for semantic validation errors if adopted consistently
- 429 for rate limiting
- 500 for unexpected server failures

Do not return HTTP 200 merely to hide an application failure inside the JSON
body.

## 7. Request Validation

Every external request boundary is validated server-side.

Validate as applicable:

- route parameters
- query parameters
- request bodies
- relevant headers
- uploaded metadata
- webhook payloads

Validation should reject malformed input before it reaches domain business
logic.

Validation must not silently authorize the caller.

## 8. Query Parameters

Query parameter naming should remain consistent across related endpoints.

Existing compatibility concepts include:

- page
- limit
- q
- range
- priceMin
- priceMax
- rating
- category
- location coordinates where required

Numeric and enum-like parameters must be parsed and validated explicitly.

Unknown parameters may be rejected or ignored according to the documented
endpoint contract, but they must not become arbitrary database filters.

## 9. Pagination

List endpoints must be bounded.

Initial frontend compatibility uses page and limit pagination.

A typical pagination object contains:

    {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }

The backend enforces maximum page sizes.

Do not provide intentionally unlimited collection responses by default.

Cursor pagination may be introduced later when scale and access patterns
justify it.

## 10. Authentication

Protected endpoints require server-side authentication.

Initial frontend compatibility may use the Bearer authorization scheme:

    Authorization: Bearer <token>

Authentication middleware establishes trusted request identity for
downstream layers.

A request body, query parameter, or route parameter must never override the
authenticated identity.

## 11. Authorization

Authorization is enforced after identity is established and before the
protected business operation is executed.

Resource-level authorization is required whenever ownership, restaurant
membership, order ownership, administrative permission, or another resource
relationship matters.

A valid identifier does not imply access.

## 12. Resource Identifiers

Resource identifiers are references, not credentials.

Clients must not infer authorization from predictable or opaque identifier
formats.

Changing from sequential IDs to UUIDs would not eliminate the requirement
for resource-level authorization.

Identifiers supplied by clients must be validated before use.

## 13. Server Authority

The server owns authoritative business state.

Clients do not control authoritative values such as:

- user roles
- ownership
- merchant membership
- average ratings
- review counts
- menu counts
- authoritative prices
- order totals
- fees
- payment state
- settlement state

The presence of such a value in a request does not make it trustworthy.

## 14. Checkout Contract

Checkout input expresses purchase intent.

Existing frontend compatibility includes concepts such as:

- restaurant grouping
- menu identifier
- quantity
- delivery address
- phone
- payment method
- optional notes

The backend reloads and validates authoritative restaurant/menu data and
computes financial totals.

The new backend must not trust client-calculated totals.

The server should make order creation and corresponding cart consumption a
consistent server-controlled operation.

The historical pattern of successful checkout followed by separate
best-effort frontend cart deletion is not the target architecture.

## 15. Order Responses

Order responses preserve historical purchase information.

They must not depend on current menu names or current menu prices to
reconstruct completed order history.

Order response contracts may expose restaurant grouping and immutable item
snapshots required by the frontend.

Internal financial or security metadata must not be exposed merely because
it exists in the database.

## 16. Order State

Order state transitions are controlled by backend business rules.

Clients cannot assign arbitrary states.

Allowed transitions may depend on:

- current state
- caller role
- resource ownership
- restaurant membership
- fulfillment rules

Payment state remains separate from order fulfillment state.

## 17. Cart API

Cart endpoints operate on the authenticated customer's cart.

The backend must verify ownership of cart resources.

Quantity changes require server-side validation.

Cart totals returned to clients are server-computed.

Cart contents remain mutable until checkout creates immutable historical
order data.

## 18. Review API

Review operations require server-side authorization.

The backend should verify the relationship between:

- authenticated customer
- completed purchase
- restaurant
- applicable menu items

A transaction or restaurant identifier supplied by the client is not
sufficient proof of review eligibility.

## 19. Search and Filtering

Search and filter inputs are validated and bounded.

Distance-based filtering is server-side when distance determines which
restaurants qualify for the result.

Search behavior and ranking should be deliberately specified.

Do not invent backend ranking behavior solely to reproduce incidental
frontend presentation.

## 20. Error Model

Expected application errors should map to stable safe responses.

An error representation may include:

- stable application error code
- safe human-readable message
- safe validation details
- request or correlation identifier where appropriate

Production errors must not expose:

- stack traces
- SQL statements
- filesystem paths
- credentials
- tokens
- provider secrets

Internal diagnostic context belongs in protected structured logs.

## 21. Request and Correlation IDs

Requests should receive a request or correlation identifier.

The identifier should support tracing through structured application logs.

It may be returned to clients for support and troubleshooting.

A client-provided identifier must not automatically be trusted as globally
unique or safe arbitrary log content.

## 22. Content Types

JSON endpoints should require and return appropriate JSON content types.

Multipart handling must be explicitly configured for supported upload
endpoints.

Do not manually force an incorrect multipart boundary.

Unsupported content types should fail safely and predictably.

## 23. Upload API

Upload endpoints require controls appropriate to the resource.

These include:

- authentication where required
- authorization
- size limits
- media validation
- generated storage identifiers
- safe error responses

Original filenames are metadata at most.

They must not become trusted filesystem or object-storage paths.

## 24. Idempotency

Operations capable of producing duplicate business or financial effects
require an idempotency strategy.

Important candidates include:

- checkout
- payment initiation
- webhook processing
- refunds
- settlements
- payouts

The exact public idempotency-key contract will be defined with the relevant
feature.

Idempotency must be enforced server-side.

## 25. Webhooks

Webhook routes are external integration boundaries.

They are not trusted internal callbacks.

Provider-specific authenticity or signature verification must occur before
a webhook event changes trusted business state.

Webhook processing must account for:

- duplicate delivery
- retries
- replay attempts
- event ordering where relevant
- controlled state transitions
- idempotency

Webhook response behavior should cooperate with legitimate provider retry
semantics without duplicating financial effects.

## 26. External API Calls

Outbound integrations require explicit:

- timeout behavior
- authentication
- response validation
- retry rules
- failure handling
- observability

Retries must distinguish safe retryable operations from actions capable of
creating duplicate side effects.

Third-party success responses do not bypass local business validation.

## 27. API Versioning

Do not introduce API versioning merely for appearance.

When incompatible public contracts require parallel support, adopt an
explicit versioning and migration strategy.

Until then, contract changes must be coordinated with known consumers,
especially the existing frontend.

## 28. Deprecation

Deprecated endpoints require an intentional migration and removal plan.

Do not preserve unused legacy behavior forever merely because old source
code once referenced it.

Compatibility decisions should distinguish:

- current frontend usage
- observed live behavior
- historical implementation
- intended product behavior

## 29. API Documentation

Every significant endpoint should document:

- HTTP method
- path
- authentication requirement
- authorization requirement
- request parameters
- request body where applicable
- response shape
- expected errors
- important side effects
- idempotency behavior where applicable

Documentation must describe implemented behavior.

A planned endpoint must not be documented in a way that falsely implies it
already exists.

## 30. Contract Changes

Contract changes affecting the frontend must be explicit.

A change should identify:

- old behavior
- new behavior
- affected consumer
- compatibility impact
- migration requirement
- security impact where relevant

Security and financial correctness override backward compatibility when the
two cannot safely coexist.

## 31. Compatibility Verification

When reproducing an existing endpoint, verify against authoritative evidence
available for that endpoint.

Useful evidence may include:

- current frontend types
- current frontend query/mutation code
- observed live API responses
- explicit product requirements

Do not fabricate undocumented fields to make a response appear complete.

Known mismatches should be documented and resolved deliberately.

## 32. API Review Checklist

Endpoint work should verify, as applicable:

- route is intentional
- authentication requirement is correct
- authorization is resource-aware
- input is validated
- response is safe
- query size is bounded
- server-computed values remain authoritative
- errors do not leak internals
- side effects are transactionally safe where required
- idempotency exists where duplicate effects are dangerous
- documentation matches implementation
