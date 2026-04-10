---
name: 7-ship
description: Use when shipping a reviewed feature — reconcile tracking vs filesystem, run full test suite, commit, create PR. No code changes allowed
---

# 7-ship — Reconcile and Ship

## Core

```
Reconcile, then ship. No last-minute fixes.
```

### Rules

1. **Reconcile before merge.** Verify: all gates approved, all tasks done, spec_hash matches, no orphan files, full test suite passes.
2. **Full test suite, not subset.** Run everything. Tests that passed yesterday may fail today.
3. **No code changes.** If a fix is needed, go back to the previous phase. Ship phase = verification and delivery only.

<HARD-GATE>
If reconcile status is not OK: STOP. Resolve issues before committing.
</HARD-GATE>

<HARD-GATE>
If full test suite has not passed in THIS session: STOP. Run tests before commit.
</HARD-GATE>

## Playbook

### Reconcile Checks

1. **Gates:** G1 through G5 — all approved?
2. **Tasks:** All tasks status = done?
3. **Drift:** Current spec_hash matches baseline from G3?
4. **Orphans:** Files in diff not declared in any task?
5. **Tests:** {{BASH_TOOL}} — full test suite passes?
6. **Lint:** {{BASH_TOOL}} — no new static analysis errors?

Write reconcile results to tracking.md.

### Ship

1. Create commit (conventional commits format, body references spec)
2. Create PR if on feature branch
3. Update tracking: phase = done

### If Issues Found

- Orphan files → investigate: legitimate addition or scope creep?
- spec_hash drift → spec changed after decompose. Re-validate or accept with documented reason
- Test failure → go back to IMPLEMENT phase. Do NOT fix in ship

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "Reconcile is just a formality, I'll skip it"
- "Quick fix before committing"
- "Tests passed last session, no need to re-run"

All of these mean: STOP. You are risking shipping broken or unverified code.
