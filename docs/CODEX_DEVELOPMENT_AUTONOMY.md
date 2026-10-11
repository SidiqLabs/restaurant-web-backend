# CODEX DEVELOPMENT AUTONOMY POLICY v1.0

## 1. Primary Objective

Codex operates autonomously to complete the active development
session efficiently while preserving finalized functionality,
project integrity, and recoverability.

Autonomy is granted according to code maturity and risk,
not merely file location.

## 2. Code Maturity Classification

- DRAFT: Experimental or newly created code. Full in-scope autonomy.
- IN_PROGRESS: Active implementation not formally accepted.
  Full in-scope autonomy with regression safeguards.
- FINAL: Accepted, verified, and explicitly marked complete.
  Protected from modification without user approval.
- LOCKED: Owned by another worker or explicitly protected.
  No unauthorized modification.

Unknown status must be investigated. Absence of a FINAL label
does not automatically authorize destructive changes.

## 3. Autonomous Development Permissions

For DRAFT and IN_PROGRESS code, Codex may independently:

- Create, modify, refactor, reorganize, and remove in-scope code.
- Fix defects and improve maintainability.
- Create and update tests.
- Run tests, typecheck, lint, and build.
- Create safe backups and recovery points.
- Commit and push verified changes when repository rules permit.

Routine technical decisions do not require interactive approval.

## 4. Protected Final Code

Codex must request explicit user approval before modifying FINAL
code, including public API contracts, established business rules,
or finalized architecture.

Read-only inspection and regression testing remain permitted.

Before requesting approval, report:

1. Exact protected files or contracts affected.
2. Why modification is necessary.
3. Proposed minimal modification.
4. Regression risks.
5. Backup and rollback strategy.

No approval means no protected modification.

## 5. Backup and Recovery

Before substantial or risky changes:

- Inspect the working tree.
- Preserve unrelated uncommitted work.
- Establish a recoverable baseline.
- Record the original commit SHA.
- Avoid destructive reset, clean, and force operations.
- Never overwrite backups or existing user work.

Rollback must be targeted and preserve unrelated changes.

## 6. Session and Ownership Boundaries

- One session, one feature focus.
- Follow PROJECT_CONTEXT.md and AGENTS.md.
- Respect existing work-lock procedures.
- Acquire ownership of exact target paths before editing.
- Never override another worker's lock.
- Release only locks owned by the current worker.

## 7. Quality Gates

Before declaring completion:

- Run relevant unit and integration tests.
- Verify finalized features still work.
- Run applicable typecheck, lint, and build.
- Inspect the final diff.
- Confirm no unrelated changes.
- Verify commit, push, and remote parity when required.

A failed required gate prevents COMPLETE status.

## 8. Mandatory Approval Boundaries

Explicit user approval remains required for:

- Modifying FINAL code.
- Changing established business rules or API contracts.
- Destructive primary or production database operations.
- Force pushing or rewriting shared Git history.
- Overwriting unrelated work.
- Expanding beyond the authorized session.
- Overriding project locks or security restrictions.

## 9. Blocker Handling

Codex should independently resolve ordinary development failures
within its authorized scope.

When blocked by permissions, sandbox restrictions, missing
credentials, or unresolved decisions:

- Do not bypass security controls.
- Preserve completed work.
- Record the exact blocker.
- Provide the smallest safe corrective action.
- Stop only the operation that cannot safely continue.

## 10. Definition of Complete

A session is COMPLETE only when implementation, required quality
gates, repository operations, and final verification succeed.

Autonomy never overrides data safety, ownership, or FINAL
code protection.

## Governance Compatibility

This policy supplements, but does not override,
PROJECT_CONTEXT.md, AGENTS.md, existing work locks,
or explicit user instructions.

Code maturity must be established using documented acceptance
status and repository evidence, not assumed from file names.

CLI sandbox and authentication restrictions remain in force.
