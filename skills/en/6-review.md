---
name: 6-review
description: Use when reviewing a complete feature implementation against its spec — convergence-tracked review with severity classification, max 3 rounds, zero CRITICAL to advance
---

# 6-review — Execution vs Specification Review

## Core

```
Review execution against specification, not process. Converge or stop.
```

### Rules

1. **Spec is the reference.** Read `docs/features/NNN/spec.md` before reviewing any code. Review without spec = review blind.
2. **Convergence is mandatory.** CRITICAL+HIGH count MUST decrease each round. Same or growing → stop immediately.
3. **Max 3 rounds.** After 3 rounds of review-fix: accept with caveats or rollback. Diminishing returns proven after 3.
4. **No new features.** Fixes only. Adding improvements during review = scope creep.

<HARD-GATE>
If CRITICAL+HIGH count increased this round compared to previous: STOP. Rollback and re-prompt from scratch.
</HARD-GATE>

<HARD-GATE>
If 3 rounds completed without reaching zero CRITICAL: STOP. Accept with documented caveats or rollback the feature.
</HARD-GATE>

<HARD-GATE>
If about to review code without having read the spec first: STOP. Read spec, then review.
</HARD-GATE>

## Playbook

### Setup

1. {{READ_TOOL}} spec (`docs/features/NNN/spec.md`) — this is the truth
2. {{READ_TOOL}} learnings.md — context from implementation
3. Determine diff scope: `git diff` against base branch

### Review Dimensions (5 areas)

Review the diff against these areas, report findings with severity:

1. **Security:** Input validation, authorization per endpoint, injection (SQL/XSS), exposed secrets, mass assignment
2. **Edge Cases:** Null handling, empty arrays, unicode, concurrency, timeouts, duplicates
3. **Performance:** N+1 queries, missing indexes, unbounded queries, memory loads
4. **Consistency:** Project patterns, naming, imports, no dead code
5. **Completeness:** Every RF/RN in spec → implemented and tested

Severity levels: **CRITICAL** (must fix) / **HIGH** (should fix) / **MEDIUM** (consider) / **LOW** (nitpick)

### Convergence Tracking

After each round of fixes:
- Count CRITICAL + HIGH findings
- Compare to previous round
- If count decreased → continue
- If count stayed same or grew → STOP, rollback
- If same MEDIUM appears in 3+ files → promote to HIGH (systemic issue)

### Optional: Dual Subagent Review (critical features)

Spawn two subagents with different focus areas:
- **Subagent 1:** Security + Performance
- **Subagent 2:** Logic + Completeness (against spec)

Both flag same issue → probably real. Only one flags → investigate before acting (shared model bias).

### Exit Criteria

- Zero CRITICAL findings
- All HIGH findings resolved or justified
- Full test suite passes
- Request human gate approval (G5) via CLI

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "The code looks good, I don't need to check against the spec"
- "I'll add this improvement while reviewing"
- "The issue is MEDIUM, I don't need to fix it"
- "One more round might catch something"

All of these mean: STOP. You are deviating from the review protocol.

### Rationalization Table

| Temptation | Why It Fails |
|------------|--------------|
| "Code looks good, skip spec check" | Spec drift: code works but doesn't match requirements. Only spec comparison catches this |
| "Add improvement during review" | Scope creep during review introduces untested changes. Fixes only |
| "MEDIUM can wait" | Same MEDIUM in 3+ files = systemic HIGH. Promote and address |
| "One more round" | Diminishing returns after 3 rounds (Self-Refine research). Stop or rollback |
