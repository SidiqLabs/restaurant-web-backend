# Work Lock Protocol

## 1. Purpose

Work locks protect the repository from overlapping edits by humans, agents,
or parallel work sessions.

The lock system coordinates ownership of project paths.

It does not replace Git.

Git records source history. Work locks coordinate who may modify a path
before those changes are committed.

## 2. State File

Active lock state is stored in:

    docs/.work-locks.json

This file is runtime coordination state and is intentionally excluded from
Git.

The lock state must not become permanent project source.

## 3. Commands

The repository exposes these commands:

    npm run lock:list
    npm run lock:check -- path/to/file
    npm run lock:add -- <owner> <scope> <path...>
    npm run lock:remove -- <owner> <scope>

These commands are the repository interface for lock operations.

Do not manually edit the lock-state JSON during normal work.

## 4. Mandatory Pre-Edit Workflow

Before modifying any project file:

1. Run `npm run lock:list`.
2. Identify the exact target path or paths.
3. Run `npm run lock:check -- <path>` for every target.
4. If any target is owned by another active scope, do not modify it.
5. If all targets are free, register ownership before editing.
6. Modify only paths owned by the active scope.
7. Release ownership after the work is completed, committed, or abandoned.

Read-only inspection does not require ownership.

## 5. Lock Ownership

Every lock has:

- owner
- scope
- one or more owned paths
- creation timestamp

Owner identifies the worker or operator.

Scope identifies the unit of work.

Scopes should be specific enough to communicate the feature or task being
performed.

Example:

    npm run lock:add -- sidiq auth-login src/modules/auth tests/auth

Do not use vague scopes such as `work`, `stuff`, or `changes` when a precise
feature name is available.

## 6. Path Ownership

A lock protects its registered paths.

Path overlap includes:

- exact path equality
- an owned ancestor path
- an owned descendant path

For example, a lock on:

    src/modules/auth

overlaps with:

    src/modules/auth/login.ts

A worker must not bypass an existing lock by registering only a nested file
inside another worker's owned directory.

## 7. FREE Result

A FREE result means no current lock conflicts with the checked path.

Example:

    FREE src/modules/cart/service.ts

FREE means the path may be claimed.

It does not itself create ownership.

Ownership begins only after a successful lock:add operation.

## 8. ACTIVE Result

An ACTIVE result means the checked path overlaps an existing lock.

Example:

    ACTIVE src/modules/cart/service.ts OWNER=sidiq SCOPE=cart-checkout

If the lock belongs to another worker or another scope, do not modify the
path.

Coordinate or wait for the existing ownership to be released.

## 9. Same Owner and Scope

The lock implementation may replace the path set for an existing matching
owner and scope when lock:add is run again.

Therefore, do not casually call lock:add with only one additional path and
assume it appends to the previous set.

When intentionally changing the path set of an existing scope, provide the
complete desired path set and verify it with lock:list.

This prevents accidental loss of previously registered ownership.

## 10. Conflicts

Lock conflicts are safety failures, not inconveniences to bypass.

Do not:

- manually remove another worker's lock without coordination
- edit a conflicting path anyway
- change the owner name merely to evade conflict detection
- move the same edit to a parent or child path to evade the lock

If a stale lock is suspected, establish that the owning work is no longer
active before removing or replacing it.

## 11. Scope Discipline

One session should focus on one feature or governance objective.

A lock scope should reflect that objective.

Do not collect unrelated edits into one broad lock merely because the
repository permits it.

If unrelated work becomes necessary, finish or safely suspend the current
scope before beginning the unrelated scope.

## 12. Lock Lifetime

Acquire ownership as late as practical before editing.

Keep ownership while the work is actively in progress.

Release ownership when the work is:

- completed and committed
- intentionally abandoned
- safely handed off under an agreed process

Do not leave stale locks merely because the terminal session ended.

## 13. Lock Removal

Normal release uses:

    npm run lock:remove -- <owner> <scope>

After removal, verify:

    npm run lock:list

The final list must accurately represent any remaining active work.

Never claim a lock was released without verifying the result.

## 14. Git Relationship

Work locks and Git solve different problems.

Work locks prevent overlapping edits during active work.

Git provides:

- version history
- diffs
- commits
- branches
- merge behavior
- remote synchronization

A successful lock does not prove that changes are correct.

A successful Git commit does not prove that parallel edits were coordinated.

Both controls are required where applicable.

## 15. Dirty Worktree Protection

Before editing, inspect repository state.

Existing unrelated dirty work belongs to its current owner and must be
preserved.

Do not:

- reset unrelated changes
- stash unrelated changes without authorization
- overwrite unrelated files
- include unrelated changes in the current commit

Locks supplement this rule but do not replace worktree inspection.

## 16. Read-Only Audits

Read-only inspection does not require a lock.

Examples include:

- reading files
- searching source
- viewing Git history
- listing locks
- checking repository status
- running non-mutating diagnostics

The moment a task needs to modify a project file, the pre-edit lock protocol
applies.

## 17. Generated Files

Generated files must be considered before claiming a scope.

If a command predictably modifies tracked generated files, those paths
belong in the planned ownership scope where appropriate.

Do not run broad auto-fix or generation commands that mutate paths owned by
another active worker.

## 18. Formatting and Auto-Fix Tools

Formatting, lint auto-fix, code generation, and migration generation can
modify files beyond the obvious target.

Before running mutating tools:

- understand their expected write scope
- check relevant locks
- avoid broad repository-wide mutation during parallel work

Read-only linting or validation does not require ownership unless the tool
itself writes files.

## 19. Database Migrations

Migration work must claim the migration paths it will modify.

If schema source and generated migration output are both changed, both must
be protected by the active scope.

Parallel schema changes require deliberate coordination because independent
migration generation can create ordering or compatibility problems even when
the source files differ.

## 20. Governance Files

Governance documents are ordinary protected project files.

Changes to files such as:

- PROJECT_CONTEXT.md
- AGENTS.md
- docs/ARCHITECTURE.md
- docs/SECURITY.md
- docs/DATABASE.md
- docs/API_CONVENTIONS.md
- docs/work-locks.md

require the same lock discipline as source code.

Governance must not be silently rewritten as a side effect of feature work.

## 21. Bootstrap Exception

A new repository may need to create the lock tooling before the lock system
can protect itself.

That is a bootstrap exception only.

Once the lock commands exist and operate correctly, normal project
modifications follow the lock protocol.

The bootstrap exception must not become a permanent excuse for unlocked
work.

## 22. Failure Handling

If lock tooling fails unexpectedly:

1. Stop planned mutations.
2. Inspect the error.
3. Preserve existing work.
4. Repair or restore coordination safely.
5. Verify lock state.
6. Resume only after ownership is clear.

Do not interpret a broken lock command as permission to edit without
coordination.

## 23. Abandoned Work

If a task is abandoned:

- preserve or intentionally revert only the abandoned scope's own changes
- do not damage unrelated work
- document important incomplete state where needed
- remove the abandoned scope's lock
- verify the remaining lock list

Never leave repository ownership ambiguous.

## 24. Commit Boundary

Before committing:

- verify the intended scope
- inspect changed files
- run appropriate validation
- exclude unrelated changes
- ensure the commit message describes the actual change

After a successful commit, release the completed scope unless more work
under the same scope is intentionally continuing.

## 25. Completion Reporting

Any task that modifies project source or governance files must report the
final lock state.

The final task report must include the result of:

    npm run lock:list

Completion must not be reported while an unintentionally stale lock remains.

If a scope intentionally remains active for the next step, report that fact
explicitly.

## 26. No Fabricated Lock State

Never claim:

- a path is free without checking it
- ownership was acquired without successful lock:add
- ownership was released without successful lock:remove
- no active locks exist without checking lock:list

Lock state is repository state, not an assumption.

## 27. Protocol Summary

The normal mutation sequence is:

    inspect repository
    npm run lock:list
    identify exact targets
    npm run lock:check -- <target>
    npm run lock:add -- <owner> <scope> <targets...>
    modify only owned paths
    validate the work
    inspect the final diff
    commit the intended scope
    npm run lock:remove -- <owner> <scope>
    npm run lock:list

This sequence is the default safety protocol for project modifications.
