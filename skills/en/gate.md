---
name: gate
description: Use when a phase transition requires human approval — runs preflight checks, presents results, and guides the human through gate approval or rejection
---

# gate — Human Gate Approval

## Core

```
Preflight, present, wait. AI never approves a gate.
```

### Rules

1. **Gates are human-only.** AI runs preflight checks and presents results. The human decides and executes approval via CLI.
2. **Preflight before approval.** Every gate has automated precondition checks. Run them first — don't ask for approval blind.
3. **Rejection is valid.** If preflight fails or human rejects, the feature stays in the current phase. No persuasion, no workarounds.

<HARD-GATE>
If about to declare a gate as approved without the human having executed the CLI command: STOP. Only human CLI execution approves gates.
</HARD-GATE>

## Playbook

### Preflight Checks by Gate

| Gate | Phase Transition | Checks |
|------|-----------------|--------|
| **G1** | Research → Spec | Research docs exist, findings documented |
| **G2** | Spec → Validate | Spec exists with RF/RN/EC, decisions.md updated |
| **G3** | Validate → Decompose | L1 pass, L2 approved, L3 no CRITICAL, spec_hash baseline |
| **G4** | Decompose → Implement | Contracts committed, tasks created (5-10), collision-free |
| **G5** | Implement → Review | All tasks done, tests pass, learnings documented |
| **G6** | Review → Ship | Zero CRITICAL, convergence achieved, spec completeness verified |
| **G7** | Ship → Done | Reconcile OK, full test suite, commit + PR created |

### Flow

1. Run preflight for the requested gate
2. Present results using block format (RN10):
   - 🟢 Checks that passed
   - 🔴 Checks that failed (with details)
   - 🟡 Warnings (non-blocking)
3. If all pass → inform human they can approve: `atomic-flow gate approve G{N}`
4. If any fail → report what needs fixing. Do NOT suggest approving anyway.

### Gate Commit

Gate approval automatically commits the artifacts of the phase being approved. The commit happens BEFORE the SQLite update — ensuring artifacts are persisted even if the session crashes.

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "All checks passed, I'll mark the gate as approved"
- "The failure is minor, I'll approve anyway"
- "I'll skip preflight, the human already reviewed"

All of these mean: STOP. Gates exist precisely to prevent AI self-approval.
