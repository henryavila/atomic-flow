---
name: status
description: Use when reporting feature status — reads from SQLite and tracking files, never generates from memory or context
---

# status — Deterministic Status Report

## Core

```
Read status, never generate it.
```

### Rules

1. **Read from source.** Status comes from SQLite and tracking.md. Never generate status from conversation memory or context.
2. **Export after read.** After reading, regenerate tracking.md from SQLite to ensure sync.
3. **Report, don't interpret.** Present the data as-is. Flag inconsistencies between SQLite and filesystem, but don't resolve them silently.

<HARD-GATE>
If about to report feature status without reading from SQLite or tracking file: STOP. Read first, then report.
</HARD-GATE>

## Playbook

### What to Report

1. **Feature:** Name, ID, branch
2. **Phase:** Current phase (with sub-state if applicable, e.g., `spec:refinement`)
3. **Gates:** Which approved, which pending (with dates)
4. **Tasks:** Count by status (done/in_progress/pending/failed) + task table
5. **Learnings:** Count of learnings captured
6. **Strikes:** Total strikes across tasks (quality indicator — 0 = perfect decomposition)
7. **Next Action:** Which task to execute, or which gate needs human approval
8. **Blockers:** Anything preventing progress

### Output Format (RN10)

Use block format for multi-section output:
- 📍 Current phase and feature
- 📊 Task progress (table or summary)
- 🟢/🟡/🔴 Gate status
- ❓ Next action needed

### Inconsistency Detection

If SQLite state differs from filesystem (e.g., task marked done but file doesn't exist, or spec_hash mismatch):
- Report the inconsistency explicitly
- Suggest `atomic-flow reconcile` to resolve
- Do NOT silently fix — the human decides

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "I remember the status from earlier in this conversation"
- "I'll summarize based on what we discussed"
- "The tracking file is probably up to date, no need to re-read"

All of these mean: STOP. Memory-based status is unreliable. Read the source.
