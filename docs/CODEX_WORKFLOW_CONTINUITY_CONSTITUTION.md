# CODEX WORKFLOW CONTINUITY CONSTITUTION v1.0

## Purpose

Prevent repeated environment mistakes, context loss,
unnecessary audits, wasted model quota, and unsafe
changes during autonomous Codex development.

This constitution supplements existing project governance.

## Article 1: Historical Success First

Before changing the Codex launcher, CLI flags,
sandbox configuration, runtime, or execution strategy:

1. Read the latest session handoff.
2. Identify the last verified successful workflow.
3. Identify the exact CLI version and environment.
4. Preserve working configurations unless evidence
   demonstrates they must change.

Never replace a proven workflow with an unverified
alternative merely because the alternative appears standard.

Historical claims must be supported by logs, documentation,
or reproducible results.

## Article 2: Handoff First

Before each development session, read:

- PROJECT_CONTEXT.md
- AGENTS.md
- docs/CODEX_DEVELOPMENT_AUTONOMY.md
- This constitution
- The relevant session handoff, if available

Preserve the active feature, baseline commit,
prior decisions, environment details, known failures,
successful workarounds, and unresolved blockers.

Do not restart a completed investigation without
a concrete reason.

## Article 3: Environment Compatibility

The project may be managed through Termux and
Debian PRoot on Android.

Do not assume conventional Linux sandbox behavior
works identically inside PRoot.

Known historical observations:

- Codex CLI 0.162.1 was used.
- Bubblewrap failed to execute basic programs
  in the tested Debian PRoot environment.
- The combination of --approve-for-me and
  --sandbox workspace-write was rejected by the CLI.
- Earlier sessions reported successful Codex execution
  using a different execution configuration.

These observations are environment-specific.
Verify current conditions before relying on them.

A Bubblewrap failure does not prove that all Codex
execution methods are unusable.

## Article 4: Controlled Execution

Prefer the last verified successful and authorized
execution method.

Disabling sandbox or approval protections is a
high-risk action, not a routine troubleshooting step.

Any execution mode granting unrestricted filesystem
or process access requires explicit user authorization
for that execution context.

Before using such a mode:

- Verify repository and branch.
- Identify allowed paths and operations.
- Preserve a recovery point.
- Protect FINAL code and unrelated changes.
- Respect all work locks.
- Prohibit destructive database operations.
- Prohibit force pushes and credential exposure.
- Document the risk and rollback procedure.

Governance rules do not replace operating-system
security boundaries.

## Article 5: Token Budget Protection

Treat Codex quota as a limited project resource.

Before launching a costly agent task:

- Reuse previous audit findings.
- Review existing logs and handoffs.
- Perform inexpensive local diagnostics first.
- Estimate the task's quota risk.
- Keep the objective narrowly scoped.

Do not spend model tokens repeatedly rediscovering
facts already established in verified records.

If a command cannot execute, resolve the environment
blocker before launching another full agent session.

## Article 6: Autonomous Development

Apply CODEX DEVELOPMENT AUTONOMY POLICY v1.0.

- DRAFT: autonomous in-scope development.
- IN_PROGRESS: autonomous in-scope development.
- FINAL: protected; modification requires approval.
- LOCKED: respect ownership and restrictions.

Never infer that code is editable merely because
it lacks an explicit FINAL label.

One session must remain focused on one feature.

## Article 7: Repository Safety

Before editing:

1. Inspect the working tree.
2. Run npm run lock:list.
3. Identify exact target paths.
4. Run npm run lock:check for each target.
5. Acquire ownership with npm run lock:add.
6. Preserve unrelated user changes.

Before release:

- Run required QA.
- Inspect staged changes.
- Stage only authorized files.
- Commit only verified changes.
- Push without force.
- Verify remote parity.
- Release only owned locks.

Never overwrite user backups or unrelated files.

## Article 8: Diagnostic Discipline

When troubleshooting:

- State the observed failure.
- Separate evidence from hypotheses.
- Prefer the smallest decisive test.
- Avoid repeating already failed experiments.
- Do not claim success based only on process exit code.
- Preserve relevant logs.
- Record the final resolution.

A failed implementation session must not be reported
as COMPLETE merely because Codex exited successfully.

## Article 9: Terminal Automation Standard

User-facing Termux scripts should:

- Be executable through one paste.
- Show numbered progress stages.
- Use verified absolute paths where required.
- Apply timeouts to potentially blocking diagnostics.
- Preserve detailed logs.
- Print a concise final summary.
- Attempt Android autoclipboard with a timeout.
- Report failures without concealing their cause.

Never require manual script editing when an automated
replacement can safely be provided.

## Article 10: Continuity and Recovery

Each session handoff must preserve:

- Current repository and branch.
- Verified baseline commit.
- Completed work.
- Pending work.
- Known blockers.
- Successful environment configuration.
- Failed configurations to avoid.
- Relevant test results.
- Backup and recovery information.
- Next safe action.

When a failure is resolved, update the relevant
documentation so future sessions do not repeat it.

## Article 11: Authority and Conflict Resolution

This constitution supplements:

1. Explicit user instructions.
2. PROJECT_CONTEXT.md.
3. AGENTS.md.
4. Existing work-lock governance.
5. CODEX DEVELOPMENT AUTONOMY POLICY v1.0.

It does not override higher-priority rules.

Conflicting requirements must be surfaced rather
than silently ignored.

## Article 12: Definition of Operational Success

Operational success requires:

- The authorized feature is implemented.
- Required QA passes.
- FINAL functionality remains protected.
- Unrelated work is preserved.
- Required commit and push operations succeed.
- Remote parity is verified.
- Owned locks are released.
- The next session can resume without rediscovering
  the same environment or project context.

The objective is reliable completion, not merely
successful agent startup.
