# Foody Backend Architecture

## 1. Architectural Goal

Foody uses a modular monolith as its initial production architecture.

The goal is to provide clear domain boundaries and production-quality
engineering without introducing distributed-system complexity before it
is justified by scale or organizational needs.

A modular monolith is not permission to build a single giant module.
Boundaries remain explicit inside one deployable backend service.

## 2. System Context

High-level topology:

```text
Client
  |
  | HTTPS
  v
Frontend
  |
  | HTTPS / REST
  v
Foody Backend API
  |
  +--------------------+
  |                    |
  v                    v
PostgreSQL         Object Storage
  |
  +---- external integrations as required
        |
        +-- payment provider
        +-- geocoding/maps
        +-- email
        +-- observability
````

The frontend and backend are independently deployable.

The backend is the authority for business rules and persistent marketplace state.

## 3. Planned Runtime Stack

Initial direction:

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


Technology choices may change only through an explicit architectural decision with migration impact considered.

## 4. Module Boundaries

Target modules include:

```text
auth
users
restaurants
menus
cart
orders
reviews
media
merchants
payments
admin
```

Additional modules should be introduced only when a distinct business responsibility exists.

Do not create modules solely to make the directory tree appear more "enterprise".

## 5. Request Lifecycle

Default flow:

```text
HTTP request
    |
    v
Route
    |
    v
Cross-cutting middleware
    |
    +-- request ID
    +-- security controls
    +-- authentication where applicable
    |
    v
Input validation
    |
    v
Controller
    |
    v
Service
    |
    v
Repository
    |
    v
PostgreSQL
```

Response flow returns through the same boundary in reverse.

## 6. Layer Responsibilities

### Route

Routes know:

- URL
- HTTP method
- middleware chain
- validation entry point
- controller


Routes do not own business rules.

### Controller

Controllers know:

- HTTP request/response semantics
- validated input
- authenticated request context
- service invocation
- response mapping


Controllers should not contain database queries.

### Service

Services own:

- business rules
- domain authorization decisions where applicable
- calculations
- state transitions
- orchestration
- transaction boundaries


Services should not depend on Express request/response objects.

### Repository

Repositories own persistence details.

They may know:

- Drizzle
- SQL concepts
- database schema


They do not know HTTP status codes or Express response objects.

## 7. Dependency Direction

Preferred dependency direction:

```text
HTTP boundary
     |
     v
application/domain logic
     |
     v
persistence/integrations
```

Domain/business rules should not become dependent on HTTP implementation details.

Provider-specific SDK objects should not become domain models.

## 8. Authoritative State

PostgreSQL is authoritative for persistent application state.

Examples:

- users
- restaurant ownership
- menus
- carts
- orders
- reviews
- payment records


React/Next.js client state is not authoritative backend state.

External providers may be authoritative for provider-owned facts, such as the provider's payment transaction state. Foody persists and reconciles the application representation of those facts.

## 9. Identity and Authorization

Target roles:

```text
CUSTOMER
RESTAURANT_OWNER
RESTAURANT_STAFF
ADMIN
```

Authorization may depend on:

- authentication
- role
- ownership
- restaurant membership
- resource relationship
- current resource state


RBAC alone is not sufficient for all operations.

Example:

A RESTAURANT_STAFF user must not gain access to every restaurant merely because the user has the RESTAURANT_STAFF role.

## 10. Marketplace Data Model Direction

Major domain groups:

### Identity

- users
- addresses
- authentication/session data


### Merchant

- restaurants
- restaurant staff/membership
- restaurant images


### Catalog

- restaurant categories
- menus


### Shopping

- carts
- cart items


### Ordering

- orders
- per-restaurant order groups
- order items
- order status history


### Reviews

- reviews
- reviewed purchased items


### Payments

- payment attempts
- provider events
- refunds


### Marketplace Finance

Later phases may include:

- platform fees
- settlements
- payouts


### Media

- media asset metadata
- object-storage references


## 11. Cart and Checkout

A cart is mutable working state.

The backend must support carts containing items while maintaining restaurant association for every menu item.

Checkout is a server-authoritative operation.

The server must:

1. authenticate the customer
2. load authoritative cart/menu data
3. verify item availability
4. calculate authoritative prices
5. calculate applicable fees
6. validate checkout input
7. create immutable order snapshots
8. update/consume cart state consistently
9. establish payment state when payment integration applies


Operations that must be atomic belong in a database transaction.

The existing frontend's historical behavior of creating checkout and then separately deleting cart items must not dictate the final backend transaction model.

## 12. Order Immutability

Catalog records change over time.

Order history must remain historically meaningful.

Order items therefore preserve snapshots such as:

- menu name
- unit price
- quantity
- item total
- relevant display metadata


Historical order totals must not be recalculated from current menu prices.

## 13. Payment Boundary

Payment is its own bounded concern.

Conceptually:

```text
Order
  |
  +-- expected payable amount
  |
  v
Payment attempt
  |
  v
Payment provider
  |
  v
Verified webhook/event
  |
  v
Payment state transition
  |
  v
Allowed order transition
```

A frontend redirect or success screen is not proof of payment.

Payment events must be safely replayable/idempotent where required.

## 14. Media Boundary

Application tables reference media metadata.

Object storage contains binary objects.

Conceptual flow:

```text
authorized upload request
        |
        v
server validation
        |
        v
generated object key
        |
        v
object storage
        |
        v
media metadata/reference in PostgreSQL
```

Provider-specific public URLs should not become the canonical identity of an asset.

## 15. Location and Distance

Initial location representation may use latitude and longitude in PostgreSQL.

Distance filtering/calculation belongs on the server when it affects query results.

PostGIS should be introduced only when geospatial requirements justify the additional complexity.

## 16. Transactions

Transactions are required when partial success would violate invariants.

Typical candidates:

- checkout/order creation
- cart consumption tied to checkout
- multi-record state transitions
- financial ledger/state changes
- operations coupling inventory/availability where applicable


Do not wrap unrelated slow external network calls inside database transactions without understanding locking and failure consequences.

## 17. External Integration Boundary

Third-party systems are adapters, not the domain.

Examples:

```text
domain/service
     |
     v
integration interface
     |
     v
provider adapter
     |
     v
external provider
```

This permits provider replacement and isolates provider-specific behavior.

## 18. Error Boundary

Expected domain failures should become controlled application errors.

Unexpected failures are handled by centralized error handling.

Public responses must not expose implementation details.

Internal logs retain enough safe context to investigate failures.

## 19. Observability

Production architecture should support:

- structured logs
- request/correlation IDs
- health endpoint
- readiness considerations
- error monitoring
- security-relevant audit events
- payment/integration diagnostics


Observability must not become a channel for leaking secrets.

## 20. Scaling Strategy

Scale the modular monolith before distributing it unnecessarily.

Likely progression:

1. optimize queries and indexes
2. scale application instances
3. introduce caching only where justified
4. isolate expensive asynchronous work where justified
5. split services only when operational/domain evidence supports it


Microservices are not a maturity badge.

## 21. Compatibility Strategy

The existing frontend is the first migration consumer.

Compatibility adapters/mappers may preserve old response shapes while the new internal data model remains cleaner.

Known compatibility issues should be documented rather than hidden.

Security and financial correctness override backward compatibility.

## 22. Architecture Change Protocol

A significant architectural change must document:

- problem being solved
- current limitation
- proposed solution
- alternatives considered
- security impact
- data/migration impact
- operational impact
- rollback implications


Large architectural changes must not enter as incidental refactors.
