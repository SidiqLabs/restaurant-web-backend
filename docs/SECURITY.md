# Foody Backend Security

## 1. Purpose

Security is part of the Foody backend architecture and development lifecycle.

Foody processes identity, authorization, customer data, restaurant data,
orders, marketplace transactions, and eventually payments.

Security controls therefore apply to design, implementation, testing,
deployment, integrations, and operations.

The security model should remain aligned with current established API and
web application security practices, including relevant OWASP guidance.

## 2. Trust Boundary

All data entering the backend from outside its trusted process boundary is
untrusted until validated.

This includes:

- request bodies
- query parameters
- route parameters
- headers
- cookies
- authentication tokens
- uploaded files
- webhook payloads
- third-party API responses
- environment configuration
- persisted values originally derived from external input

Frontend validation never replaces backend validation.

## 3. Authentication

Authentication proves caller identity.

Passwords MUST:

- never be stored in plaintext
- never be logged
- use an approved password hashing algorithm
- use unique salts through the selected hashing mechanism

Argon2id is the preferred initial password hashing strategy.

Hashing parameters must be selected using current security guidance and
measured operational requirements rather than copied permanently from old
examples.

Authentication responses must not expose password hashes, signing secrets,
session secrets, or unnecessary sensitive account information.

Authentication endpoints require abuse protection appropriate to their risk.

## 4. Session and Token Security

Initial implementation may retain compatibility with the existing frontend
Bearer-token contract.

Compatibility does not make browser local storage the final production
security architecture.

Before production authentication is finalized, the design must explicitly
address:

- access-token lifetime
- refresh/session lifetime
- revocation
- rotation where applicable
- logout semantics
- stolen-token impact
- signing and verification key management
- browser storage strategy
- CSRF implications if cookies are introduced

Tokens and authorization headers MUST NOT be logged.

## 5. Authorization

Authentication and authorization are separate controls.

Every protected operation must verify that the authenticated principal may
perform the requested action.

Authorization may depend on:

- role
- ownership
- restaurant membership
- resource relationship
- resource state
- administrative permission

Object identifiers are not authorization credentials.

Knowing or guessing a user, restaurant, cart, order, review, payment, or
other resource identifier must not grant access to that resource.

## 6. Roles and Resource Ownership

Initial roles are:

- CUSTOMER
- RESTAURANT_OWNER
- RESTAURANT_STAFF
- ADMIN

Role checks must be supplemented by resource-level authorization whenever
ownership or membership matters.

Restaurant owners and staff may act only on resources for restaurants for
which they hold the required relationship.

Administrative privileges must be established by trusted server-side state,
never by client input.

## 7. Input Validation

Zod is the planned application validation boundary.

Validation should cover as applicable:

- required fields
- data types
- formats
- allowed values
- string lengths
- numeric ranges
- pagination bounds
- array limits
- nested object structure

Unknown input must not silently become trusted domain data.

Validation does not replace authorization or database constraints.

## 8. Mass Assignment

Request payloads must be mapped to explicitly permitted fields.

Never spread arbitrary client request bodies directly into database create
or update operations.

Sensitive fields such as roles, ownership, administrative flags, payment
state, settlement state, and server-computed totals must not become writable
because a client supplied them.

## 9. Resource Consumption

Public APIs must account for denial-of-service and resource-exhaustion risk.

Controls may include:

- request body limits
- pagination limits
- upload size limits
- timeouts
- endpoint-sensitive rate limiting
- bounded queries
- bounded batch operations

Do not expose intentionally unbounded collection endpoints.

## 10. Rate Limiting

Rate limiting should reflect endpoint risk instead of relying on one
arbitrary global threshold.

Higher-risk candidates include:

- login
- registration
- session operations
- search abuse
- uploads
- checkout
- payment initiation
- sensitive administrative operations

Any IP-based control must account for trusted proxy configuration.

## 11. Database Security

Application database credentials follow least privilege.

Normal application runtime MUST NOT connect as a PostgreSQL superuser.

Production credentials must not be reused by development or test
environments.

Database connections must use secure transport when required by the provider
or when crossing untrusted networks.

Authorization must never rely on obscurity of database identifiers.

## 12. Secrets

Secrets never belong in Git.

Examples include:

- database credentials
- signing secrets
- payment provider secrets
- webhook secrets
- object-storage credentials
- private API keys

Production secrets belong in deployment secret management.

Secrets must be replaceable and rotatable.

.env.example may contain variable names and safe placeholders only.

## 13. CORS

CORS policy must be explicit and environment-specific.

Production must not default to arbitrary origins for sensitive or
credentialed APIs.

CORS is a browser control. It is not an authentication or authorization
mechanism.

## 14. HTTP Security

The HTTP layer should apply appropriate security headers and safe request
limits.

Security headers supplement rather than replace authentication,
authorization, validation, and secure application design.

## 15. Error Handling

Production responses must not expose sensitive implementation details.

Do not expose:

- stack traces
- SQL statements
- database credentials or connection details
- filesystem paths
- secret values
- signing material
- provider credentials

Unexpected failures should return stable safe responses while retaining
sufficient internal diagnostic information.

## 16. Logging and Auditability

Security-sensitive operations should be auditable.

Relevant events may include:

- authentication failures
- authorization failures
- session lifecycle events
- administrative changes
- merchant membership changes
- payment state changes
- refunds
- settlements
- payouts
- invalid webhook attempts

Logs MUST NOT contain:

- passwords
- password hashes
- access tokens
- refresh tokens
- authorization headers
- payment secrets
- raw card data

Structured logs should include request or correlation identifiers where
useful.

## 17. File and Image Uploads

Uploads are untrusted input.

The server must validate as applicable:

- authenticated and authorized uploader
- permitted upload purpose
- maximum size
- allowed media type
- content characteristics
- generated storage identifier
- ownership or resource association

Original filenames must not become trusted storage paths.

The existing frontend historically applies a 5 MB avatar limit. The new
backend must define and enforce its own server-side limits.

## 18. Object Storage

Object-storage credentials follow least privilege.

The database should store canonical application metadata and storage keys
rather than depending on permanent provider URLs as asset identity.

Private assets require controlled access where appropriate.

Replacement and deletion operations require authorization.

## 19. Payment Security

Payment-related implementation is HIGH risk.

Foody MUST NOT store raw card credentials or CVV.

The backend is authoritative for:

- item prices
- quantities accepted for checkout
- subtotal
- service/platform fees
- discounts when introduced
- final payable amount

Client-calculated financial values are never authoritative.

Payment state and order fulfillment state are separate concepts.

## 20. Webhook Security

Provider webhooks are hostile external input until authenticated and
validated.

Webhook processing must include as supported by the provider:

- authenticity or signature verification
- schema validation
- event identification
- duplicate and replay protection
- idempotent processing
- controlled state transitions
- audit logging
- safe failure behavior

Receiving an HTTP request is not evidence that a payment succeeded.

## 21. Idempotency

Operations capable of producing duplicate business or financial effects
require an idempotency strategy.

Important candidates include:

- checkout
- payment initiation
- webhook processing
- refunds
- settlements
- payouts

Where correctness must survive process restarts, idempotency must be backed
by persistent state.

## 22. External Services

Third-party responses remain untrusted.

Integrations require appropriate:

- authentication
- timeouts
- response validation
- safe retry behavior
- error handling
- secret management
- observability

Retries must not duplicate non-idempotent financial actions.

## 23. Dependency Security

Dependencies must be intentionally selected and maintained.

Security work includes:

- minimizing unnecessary packages
- reviewing package purpose
- monitoring known vulnerabilities
- applying appropriate security updates
- avoiding abandoned packages for critical responsibilities

A clean dependency scan is supporting evidence, not proof of application
security.

## 24. Production Operations

Production access follows least privilege.

Security-sensitive or destructive production actions require explicit
authorization.

Production planning must include:

- credential rotation
- environment isolation
- monitoring
- backup and recovery
- incident investigation
- patching
- rollback strategy

Development convenience must not silently weaken production controls.

## 25. Security Review Triggers

Explicit security review is required for HIGH-risk work including:

- authentication
- authorization
- sessions and tokens
- protected-data migrations
- uploads
- checkout
- payments
- webhooks
- refunds
- settlements and payouts
- secrets
- production infrastructure

Security review must inspect actual implementation and relevant tests.
The existence of this document alone is not evidence that the application
is secure.
