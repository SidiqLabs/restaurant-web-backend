# Foody Backend — Agent Constitution

This document governs humans and automated coding agents working in this
repository.

Read `PROJECT_CONTEXT.md` before making changes.

## 1. Prime Directive

Make the smallest coherent change that satisfies the active task while
preserving security, correctness, domain boundaries, and unrelated work.

Do not turn a focused task into a repository-wide cleanup.

## 2. Required Pre-Edit Protocol

Before modifying files:

1. Run:

   `npm run lock:list`

2. Determine every target path.

3. For every target path run:

   `npm run lock:check -- <path>`

4. If another owner/scope holds a conflicting path:

   STOP.

5. Claim free paths:

   `npm run lock:add -- <owner> <scope> <path...>`

6. Verify ownership before editing.

Never silently bypass the lock protocol.

Read-only audits do not require locks.

## 3. Scope Discipline

One session equals one feature focus.

Do not:

- implement adjacent features because they are convenient
- refactor unrelated modules
- rename unrelated files
- reformat the entire repository
- upgrade unrelated dependencies
- overwrite unrelated dirty work

If required work crosses the declared scope, document the reason before
expanding ownership.

## 4. Architecture Discipline

The default request flow is:

`Route -> Middleware/Validation -> Controller -> Service -> Repository`

Responsibilities:

### Routes

- define HTTP routing
- attach middleware
- connect validation and controller entry points

### Controllers

- translate HTTP input into application calls
- translate application results into HTTP responses
- remain thin

### Services

- own business rules
- enforce business invariants
- coordinate transactional operations
- remain independent of HTTP details where practical

### Repositories

- own database access
- expose persistence operations needed by services
- do not own HTTP behavior

Do not place business logic in route files or database access directly in
controllers.

## 5. Server Authority

Never trust the client for:

- user identity
- roles
- resource ownership
- prices
- discounts
- fees
- totals
- payment success
- order state transitions
- administrative privileges

The server derives or verifies authoritative values.

## 6. Security Rules

Security controls are requirements, not optional polish.

Agents MUST:

- validate untrusted input
- enforce authentication where required
- enforce authorization at resource and function level
- use least privilege
- protect secrets
- avoid sensitive logging
- consider abuse/resource exhaustion
- validate external service responses
- fail safely

Never weaken a security control merely to make a test or client request
pass.

Never add a bypass, hidden admin route, universal token, hard-coded secret,
or temporary production backdoor.

## 7. Authentication

Passwords MUST NOT be stored or logged in plaintext.

Password verification belongs on the server.

Authentication failures MUST NOT expose password hashes, tokens, internal
stack traces, or sensitive account data.

Authentication and authorization MUST remain separate.

## 8. Authorization

Every protected resource operation must answer both:

1. Is this caller authenticated?
2. Is this caller allowed to perform this action on this resource?

Never assume a valid numeric/UUID identifier implies authorization.

Admin/merchant endpoints require explicit server-side permission checks.

## 9. Database Rules

Never modify production data manually as a substitute for a migration or
application fix.

Schema evolution uses migrations.

Do not edit an already-applied production migration to rewrite history.

Use transactions for operations that must succeed or fail atomically.

Use database constraints for critical invariants where practical.

Avoid unbounded queries.

Do not use floating point for authoritative money.

## 10. Payment Rules

Payment code is HIGH risk.

Agents MUST NOT:

- trust client totals
- mark orders paid from frontend claims
- store CVV/raw card secrets
- accept unsigned/unverified provider callbacks
- process duplicate webhook events as new payments

Payment integrations require:

- provider verification
- idempotency
- auditability
- reconciliation strategy
- failure handling

## 11. File Upload Rules

Uploads are untrusted input.

Validate:

- authorization
- file size
- allowed media type
- actual content where appropriate
- generated storage key
- ownership

Do not trust the original filename as a storage path.

Never allow user-controlled paths to escape designated storage locations.

## 12. Error Handling

Public errors must be useful without leaking internals.

Do not expose:

- stack traces
- SQL statements
- database credentials
- internal filesystem paths
- secret values
- raw provider credentials

Unexpected errors are logged internally with safe context.

## 13. Logging

Use structured logging.

Never log:

- passwords
- password hashes
- access/refresh tokens
- authorization headers
- secret keys
- raw payment credentials

Prefer correlation/request IDs for tracing.

## 14. Dependency Rules

Add dependencies only when they provide clear value.

Before adding a package, consider:

- maintenance status
- security history
- transitive dependency cost
- whether the platform already provides the capability
- whether a smaller solution exists

Do not introduce multiple libraries for the same responsibility without
explicit justification.

## 15. Testing

Tests should focus on behavior and invariants.

HIGH-risk changes require targeted tests.

Critical areas include:

- authorization
- authentication
- checkout calculations
- transaction boundaries
- idempotency
- payment webhooks
- order state transitions
- destructive operations

Never delete or weaken a valid test simply to obtain a green build.

## 16. Production Safety

Never perform destructive production actions without explicit owner
authorization.

Examples include:

- dropping tables
- resetting databases
- deleting storage buckets
- rotating live credentials
- destructive migrations
- mass deletion
- force pushing protected history

Production changes require rollback/recovery consideration.

## 17. Secrets and Environment

No real secret belongs in:

- Git
- documentation
- examples
- tests
- screenshots intentionally committed to the repository

Environment variables must be validated at startup when required.

`.env.example` contains names/placeholders only.

## 18. External APIs

Treat third-party responses as untrusted.

Apply:

- timeout
- error handling
- validation
- authentication
- retry only when safe
- idempotency where required

Do not allow provider-specific structures to leak throughout domain code.

## 19. Completion Protocol

Before reporting completion:

1. Run applicable tests.
2. Run type checking.
3. Run linting.
4. Run `git diff --check`.
5. Inspect `git status --short`.
6. Verify no secret/unexpected file is included.
7. Run `npm run lock:list`.
8. Release the completed scope.
9. Run `npm run lock:list` again.

If the repository does not yet have a required QA command, state that
explicitly rather than inventing a passing result.

## 20. No Fabricated Verification

Never claim:

- tests passed when they were not run
- build passed when it was not run
- a deployment succeeded without verification
- an endpoint works without evidence
- a security property exists merely because documentation says so

Report observed state separately from intended design.
