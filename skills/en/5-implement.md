---
name: 5-implement
description: Use when implementing a decomposed task in the IMPLEMENT phase — one task per clean session with TDD, scope verification, micro-commits, 4-level recovery, and learning loop
---

# 5-implement — Task Implementation Loop

## Core

```
One task. Clean session. Test first. Commit often.
```

### Rules

1. **One task per session.** Start with `/clear`. Load only the current task file and learnings.
2. **Test exists before code.** Write the test (or verify existing coverage) before touching source files.
3. **Micro-commit before each prompt.** `git add -A && git commit -m "wip: T[N] checkpoint"` — makes rollback possible.
4. **Verify scope after every change.** `git diff --stat` must show only files declared in the task.
5. **Fix the implementation, never the test.** If a test fails, change the code — not the assertion.

<HARD-GATE>
If about to write source code without a test covering it: STOP. Write the test first.
</HARD-GATE>

<HARD-GATE>
If about to edit a file outside the feature scope: STOP. Create a separate task or escalate to human.
</HARD-GATE>

<HARD-GATE>
If strike count reaches 3: STOP. Mark task as failed, document what was tried, escalate to human.
</HARD-GATE>

<HARD-GATE>
If about to weaken a test assertion (remove assertion, skip test, loosen matcher): STOP. Fix the implementation instead.
</HARD-GATE>

## Playbook

### Setup

1. `/clear` — fresh session, zero context bleed
2. {{READ_TOOL}} task file (`T{N}-name.md`) — self-contained: files, relevant tests, deps, done criteria
3. {{READ_TOOL}} `learnings.md` if it exists — patterns from prior tasks
4. Snapshot: `git add -A && git commit -m "wip: T[N] start"`

### TDD — Two Valid Approaches

Choose based on complexity:

| Approach | When | How |
|----------|------|-----|
| **Classic RED→GREEN** | Complex logic, unfamiliar area | Write test → run to confirm FAIL → implement → run to confirm PASS |
| **Combined** | Simple task, clear pattern | Write test + implementation → run test separately to confirm PASS |

Non-negotiable: the test must exist BEFORE the task is considered done. Monitor for test weakening — skipped tests, loosened assertions, tautological loops. Adapt patterns to the project's language and test framework.

### Verification

After implementation, in order:

1. {{BASH_TOOL}} — full test suite (not just new tests)
2. {{BASH_TOOL}} — lint / static analysis (no new errors)
3. `git diff --stat` — only declared files touched
4. `git commit -m "feat: T[N] {description}"`

### File Scoping — 3 Tiers

| Tier | Scope | Behavior |
|------|-------|----------|
| **Allow** | Files declared in task | Edit freely |
| **Warn** | Other files in same feature | Proceed only with explicit justification |
| **Block** | Files outside the feature | HARD-GATE: do not touch — create separate task |

### Recovery — 4 Levels (R1 → R2 → R3 → R4)

Each failure increments the task's strike counter (+1 per failure, regardless of R-level reached).

| Level | Action | When |
|-------|--------|------|
| **R1** | Retry with more context (full stacktrace, relevant file, existing pattern) | First failure — usually missing context |
| **R2** | Rollback to checkpoint → re-prompt with different approach | Wrong approach confirmed |
| **R3** | Spawn investigation subagent → return with diagnosis | Systemic or unknown-area problem |
| **R4** | Task = failed. Escalate to human: what was tried, what failed, diagnosis | 3 strikes reached |

Convergence rule: each retry MUST reduce error count. Same or growing → escalate immediately.

A task resolved at R1 → done with strikes=1 (strike recorded, no escalation needed).

### Learning Loop (After Task Done)

1. **AAR micro-retro:** What was planned? What happened? What surprised?
2. **Append to learnings.md:** Pattern, discovery, or gotcha
3. **Scan pending tasks:** Do any deps/interfaces need revision based on what was learned?
4. **Apply:** Mechanical updates (renamed interface, moved file) → auto-apply. Judgment calls → flag HUMAN-GATE.

**Caps (RN06):** Max 3 learning cycles with revisions per feature. 2 consecutive cycles with 0 revisions → skip future cycles. 4th cycle with revisions → STOP: problem is the decomposition, not the execution.

### Mid-Task Escalation

If the task reveals itself as larger than estimated: commit current progress, split remaining work into subtasks, `/clear`, continue with the first subtask.

**Signals that a task needs splitting:**
- Task exceeds ~15 min without nearing completion
- `git diff --stat` shows 2x+ files vs declared in task
- New dependency discovered that was not declared
- Test requires infrastructure or setup not anticipated
- 3+ files outside task scope need changes

If a "Simple" feature reveals itself as "Medium" during implementation: stop, write the missing spec, decompose properly, resume with the correct flow.

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "I'll write the code and test together, it's faster"
- "This extra file is small, I can edit it"
- "The test is failing — let me adjust the assertion"
- "No need to commit now, I'll commit at the end"
- "The learning loop is unnecessary for this task"
- "I'll implement T3, T4, and T5 in this same session"

All of these mean: STOP. You are about to violate a core rule.

### Rationalization Table

| Temptation | Why It Fails |
|------------|--------------|
| "Test + code together is faster" | Produces tautological tests that validate themselves, not behavior |
| "One more file won't hurt" | Silent feature dropout — unexpected file edits are the #1 AI defect pattern |
| "Adjust the assertion, not the code" | AI's top test sabotage: skip, weaken, loop. The test encodes the REQUIREMENT |
| "Commit at the end" | 10 edits without commit = impossible rollback. One bad edit contaminates all |
| "Skip the learning loop" | Pending tasks go stale — T5 still references interface T3 renamed |
| "Continue in this session" | Context rot: AI performance degrades silently after ~3 tasks in same session |
| "I know TDD, skip the ceremony" | AI without methodology = 19% slower (METR Study). The ceremony IS the value |
