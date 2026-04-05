Identify the root cause of the problem and fix it with TDD.

If {{ARG_VAR}} was provided, use it as the problem description.
If not, ask the user: "What is the problem? Describe the observed symptom."

## Fundamental Rule

NO FIX WITHOUT ROOT CAUSE.
Do not write fix code without first having identified and documented
the root cause. "I think that's it" is not a root cause — it's a hypothesis.
Root cause = you know EXACTLY which line/condition causes the problem AND why.

<HARD-GATE>
If you are about to modify production code without having a test
that reproduces the bug: STOP. Write the test first.
The only exception is if the problem is in the test setup itself.
</HARD-GATE>

## Mindset

You are a detective, not a firefighter. Investigate first, act later.
The urgency to "fix it quickly" is what causes wrong fixes and regressions.

Finding one bug means more bugs likely live nearby (defect clustering).
A single test for the exact symptom is the minimum — not the finish line.

## Process

### Phase 1: Observe

Collect evidence WITHOUT forming hypotheses yet.

- Read the problem description (argument or question to user)
- Run relevant commands to reproduce/observe:
  - Tests: identify the project's test command (check `composer.json`, `package.json`,
    `Makefile`, `pyproject.toml`, or `CLAUDE.md`) and run it
  - Logs: run `{{GREP_TOOL}} -rn "[symptom error message]"` on relevant files
  - State: run `git log --oneline -5` to see recent changes
- Read relevant files with the {{READ_TOOL}} — cite line numbers

Record the collected evidence:
> **Symptom:** [what happens]
> **Where:** [file:line]
> **When:** [under what condition]
> **Evidence:** [command output, line numbers]

Present the evidence to the user: "Phase 1 complete. Evidence collected above. Moving to diagnosis."

### Phase 2: Diagnose

Form hypotheses and test each one.

For each hypothesis:
1. Declare: "Hypothesis: [root cause candidate] at [file:line]"
2. Test: run a command via {{BASH_TOOL}} or read with the {{READ_TOOL}} to confirm/refute
3. Result: "Confirmed" or "Refuted because [evidence]"

Maximum 5 hypotheses. If none is confirmed after 5:
STOP and escalate to the user — the problem may be more complex.

When a hypothesis is confirmed, document:
> **Root cause:** [precise description]
> **File:** [path:line]
> **Why it happens:** [mechanism — not just "it's wrong"]

### Phase 3: Fix with TDD

**3a. Enumerate the test surface:**
BEFORE writing any test, read the affected function and create a Test List:

1. **Regression test**: the exact case from the bug report
2. **Equivalence partitions**: for each input parameter of the affected function, identify classes:
   zero, negative, normal, boundary, overflow/max — at minimum one test per relevant partition
3. **Boundary values**: edges between partitions (off-by-one, exact threshold, threshold ± 1)
4. **Error inputs**: values the function should reject or handle gracefully

Present the Test List to the user:
> Test List for [function]:
> 1. [regression] exact reported case: [input] → [expected]
> 2. [boundary] [description]
> 3. [edge] [description]
> ...
> Minimum 3, typical 5-8. Proceed?

Wait for user approval.

**3b. Write the regression test:**
- The exact case from the bug report — must FAIL in the current state
- Run the test — confirm it fails for the expected reason
- If the test passes (bug not reproduced): your root cause is wrong.
  Go back to Phase 2. If you already went back 2 times: STOP and escalate to the user.

**3c. Fix the code:**
- Make the minimum necessary fix to pass the regression test
- Run the test — confirm it now passes
- Run the full suite — confirm nothing else broke

**3d. Write the boundary and edge tests:**
Work through the remaining Test List items, one test at a time.
- Each test should PASS if the fix correctly addresses the root cause
- **If a test FAILS**, determine the cause:
  - **Related to root cause** (same class of bug): the fix was too narrow — expand it.
    Do NOT narrow the test to match the broken behavior.
  - **Unrelated** (separate pre-existing bug): register as a separate finding.
    Do NOT try to fix it now — it's outside the current root cause scope. Continue hunting.

**3e. Spot-check via mental mutation:**
For each condition in your fix, ask:
- "If I changed `>=` to `>`, would a test catch it?"
- "If I removed this null check, would a test catch it?"
- "If I used `+` instead of `-`, would a test catch it?"

If any answer is "no": add a test that would catch it.

**3f. Refactor (if needed):**
- If the fix introduced duplication or ugly code: refactor
- Run the tests again after refactoring

### Phase 4: Verify

- Run `git diff` — review the changes
- Confirm the fix is minimal (does not touch unrelated code)
- Run the full test suite one last time
- **Completion check** (all three must be true):
  1. Test List is empty (all items implemented)
  2. Every input partition has at least one test
  3. Mental mutation found no uncaught cases

## Red Flags

- "I already know what it is, I'll fix it directly"
- "It's obvious, I don't need a test for this"
- "I'll fix it and test later"
- "The test is hard to write, I'll test manually"
- "I'll take this opportunity to refactor the whole module"
- "The test suite is slow, I'll only run the test I wrote"
- "One test for the exact bug is enough"
- "The boundary tests are overkill, the fix is simple"
- "The test failed after my fix — I'll narrow the test"

If you thought any of the above: STOP. Go back to the phase you were skipping.

## Rationalization

| Temptation | Reality |
|------------|---------|
| "The cause is obvious" | Obvious to whom? Document and prove with evidence |
| "I don't need a test, it's a small change" | Small changes break big things. HARD-GATE |
| "I'll fix first, test later" | Inverted TDD is not TDD — it's hope |
| "The suite is too big to run entirely" | Running partial = not knowing if you broke something |
| "I've tried 5 hypotheses, I'll guess the 6th" | 5 failures = escalate to the user, don't guess |
| "One regression test is enough" | One test catches one case. Bugs cluster — if you found one, there are more nearby |
| "The boundary test failed, I'll adjust the test" | If the code doesn't match the spec at the boundary, that's a SECOND bug — fix the code, not the test |
| "I'll skip the Test List, the bug is straightforward" | Straightforward bugs have straightforward siblings. List them or miss them |

## Closing

Report:
- Problem: [original description]
- Root cause: [file:line — description]
- Hypotheses tested: [count, which were refuted]
- Tests created: [count] (regression: 1, boundary: N, edge: N)
- Fix: [summary of change]
- Test List completion: [all items done / N remaining]
- Mental mutation: [N conditions checked, N tests added]
- Full suite: [passed/failed]
