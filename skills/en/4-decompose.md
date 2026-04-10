---
name: 4-decompose
description: Use when decomposing a validated spec into contracts and atomic tasks — contracts-first, human-reviewed task list, self-contained task files with mandatory checkpoint between proposal and detailing
---

# 4-decompose — Contracts-First Task Decomposition

## Core

```
Contracts first. Propose, don't detail. Human approves the list.
```

### Rules

1. **Contracts before tasks.** Generate interfaces, DTOs, and enums from the spec as real code. Commit before creating any task files.
2. **Propose the list, then wait.** Present task names, files, deps, and estimates. Do NOT generate detailed task files until human approves the list.
3. **Human decomposes, AI assists.** The AI proposes a starting list. The human reviews, reorders, and adjusts every task. Accepting without review violates the method.
4. **Each task is self-contained.** 40-80 lines, YAML frontmatter, all context needed to implement — no assumptions about other tasks or the full spec.

<HARD-GATE>
If a contract file contains implementation logic (function body beyond stub/throw): STOP. Contracts are interfaces only.
</HARD-GATE>

<HARD-GATE>
If a task declares more than 3 files: STOP. Split into smaller tasks before continuing.
</HARD-GATE>

<HARD-GATE>
If two tasks declare the same output file: STOP. Resolve the collision — merge tasks or reassign the file.
</HARD-GATE>

<HARD-GATE>
If about to generate detailed task files before human approved the task list: STOP. Present the list first.
</HARD-GATE>

## Playbook

### Step 1: Contracts

1. {{READ_TOOL}} the validated spec (`docs/features/NNN/spec.md`)
2. Extract interfaces, DTOs, enums, and type definitions from RF/RN
3. Generate as real code files — interface-only, no implementation logic
4. Stubs are acceptable: `throw new Error('Not implemented')` or language equivalent
5. `git commit -m "contracts: feature NNN interfaces and types"`

### Step 2: Propose Task List (checkpoint — STOP before detailing)

Propose a summary list. For each task:
- **ID and name** (T1, T2...)
- **Files** to create/modify (max 2-3)
- **Dependencies** (which tasks must complete first)
- **Estimate** (5-15 min each)
- **Done criteria** (deterministic — "if a lazy AI can pass without implementing behavior, REWRITE it")

Present to human. Wait for approval or adjustments.

**Decomposition rules:**
- Each task touches max 2-3 files (ideally 1)
- Each task has a clear, testable deliverable
- Order by dependency: data → domain → application → presentation
- 5-10 tasks per feature. More than 10 → split the feature
- No two tasks produce the same file (collision check)

### Step 3: Generate Task Files (only after human approval)

For each approved task, generate `.ai/features/NNN/tasks/T{N}-name.md`:

```yaml
---
id: T{N}
title: {descriptive name}
estimated: {5-15} min
status: pending
depends_on: [{task IDs}]
blocks: [{task IDs}]
files:
  - path: {exact/path}
    action: {create|modify}
---
```

Required sections: Context, What to Do (WHAT not HOW), Files, Tests to Verify (existing + new), Test Contracts ({input} → {output}), Pattern to Follow, Constraints, Done Criteria.

Target: 40-80 lines per task. Below 40 → AI will guess (BMAD #2003). Above 80 → resolution drops (TDAD).

Adapt the task template to the project's language, test framework, and conventions.

### Validation Checks (before requesting G4)

- [ ] Every task has ≤3 files
- [ ] Every task has Test Contracts with deterministic assertions
- [ ] No file appears as output in two tasks (collision check)
- [ ] Every task is 40-80 lines
- [ ] Dependencies form a DAG (no cycles)
- [ ] Total tasks: 5-10 per feature

### Edge Cases

- **Feature with 2-3 files:** Still minimum 2 tasks. Still needs contracts.
- **Human rejects decomposition 3x:** Escalate — the spec may be too vague. Consider returning to VALIDATE.
- **Contract conflicts with existing code:** Resolve before decomposing. May require spec amendment (update spec_hash).

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "I don't need contracts, I'll go straight to tasks"
- "It's only 3 tasks, I don't need task files"
- "I'll accept the AI's decomposition without reviewing"
- "This task is big but I'll keep it as-is"
- "I'll generate the full task files now, the human can review later"
- "The task file just needs a title and description"

All of these mean: STOP. You are about to skip a checkpoint.

### Rationalization Table

| Temptation | Why It Fails |
|------------|--------------|
| "Skip contracts, go to tasks" | Tasks reference interfaces that don't exist — implementation guesses signatures |
| "Task files are overhead" | Without them, AI starts each /clear with zero context — produces broken code (BMAD #2003) |
| "AI's list looks good, no review needed" | AI decomposition misses human architectural knowledge — vague or overlapping tasks (METR) |
| "Big task, but it's one logical unit" | Tasks >15 min or >3 files = context rot, impossible rollback, no granular progress |
| "Detail everything at once" | 1242 lines of plan without checkpoint (P29). Human can't review what they didn't see proposed |
| "Title + description is enough" | 5-line tasks → superficially correct but broken code. 40-80 lines is the researched sweet spot |
