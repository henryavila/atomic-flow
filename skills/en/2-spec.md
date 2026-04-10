---
name: 2-spec
description: Use when writing a feature specification via interview — one question at a time, ✓/✗ acceptance format, Test Contracts, and decision journal
---

# 2-spec — Specification via Interview

## Core

```
One question at a time. Define WHAT and WHY, never HOW.
```

### Rules

1. **Interview, don't generate.** Ask the human questions one at a time. Never batch multiple questions in one message.
2. **WHAT and WHY only.** Spec defines behavior and rationale. Implementation details (frameworks, function names, SQL) belong in code, not spec.
3. **Test Contracts are mandatory.** Every RF/RN must have at least one TC with {input} → {expected output}. Deterministic — "if a lazy AI can pass without implementing behavior, REWRITE it."
4. **Decision journal alongside spec.** Every problem discovered → P&S entry in `decisions.md`. The spec says WHAT was decided; the journal says WHY.
5. **New session after spec approved.** The spec session consumed context. Start fresh for implementation.

<HARD-GATE>
If about to write the spec without having asked the human at least 3 questions: STOP. Interview first.
</HARD-GATE>

<HARD-GATE>
If the spec has no Test Contracts section: STOP. Add TCs before declaring spec complete.
</HARD-GATE>

<HARD-GATE>
If a requirement contains implementation details (function names, SQL, framework APIs): STOP. Rewrite as behavior — WHAT it does, not HOW.
</HARD-GATE>

## Playbook

### Interview Flow

1. {{READ_TOOL}} research findings (`docs/research/NNN-slug/`) if they exist
2. {{READ_TOOL}} existing decisions (`docs/features/NNN/decisions.md`) if returning to spec
3. Ask questions ONE AT A TIME, covering:
   - Functional requirements (what the user sees/does)
   - Business rules (validations, permissions, states)
   - Edge cases (what happens when X fails?)
   - Data model (entities, relationships)
   - Integrations (external APIs, jobs, events)
4. After each answer, confirm understanding before moving on

### Spec Format

Write to `docs/features/NNN/spec.md` with sections:
- **Objective** (1-2 sentences)
- **Requisitos Funcionais** (RF01, RF02... with ✓/✗ acceptance criteria)
- **Regras de Negócio** (RN01, RN02...)
- **Edge Cases** (EC01, EC02...)
- **Test Contracts** (TC-RF01-1: {input} → {output})
- **Arquivos Envolvidos** (paths)
- **Fora de Escopo** (explicit boundaries)

Each RF/RN uses ✓/✗ format:
- ✓ describes the expected behavior (positive case)
- ✗ describes what must NOT happen or error cases

### Refinement Mode

When returning to an existing spec (after validate/feedback):
1. {{READ_TOOL}} the full spec — transcribe each requirement before discussing
2. Cover ALL RF/RN/EC sequentially — never skip, even if trivial
3. Research decisions.md before raising questions — don't re-litigate settled issues
4. When resolving a question by analysis (without asking human), write BOTH the question and analysis — human validates understanding

### AI-Human Protocol (RN08/RN09)

- Always state the current phase/step explicitly
- Research before proposing — never fabricate from training data
- Recommend with evidence, never self-approve
- When in doubt, re-read METHOD-NATIVE.md principles

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "The requirement is obvious, I don't need to ask"
- "I'll generate the full spec at once"
- "Test Contracts can be added later"
- "I'll include how to implement it to help"
- "This RF is trivial, I'll skip it in the review"

All of these mean: STOP. You are about to produce a vague spec.

### Rationalization Table

| Temptation | Why It Fails |
|------------|--------------|
| "Obvious requirement, no need to ask" | "Obvious" to whom? Implicit assumptions = missing edge cases |
| "Generate full spec at once" | Batch specs have 30-50% lower acceptance rate — interview catches gaps |
| "TCs later" | Without TCs, Layer 1 validation fails. Time lost, not saved |
| "Include implementation details" | Spec with HOW constrains solutions. WHAT + WHY enables better designs |
| "Skip trivial RFs in review" | Gaps come from the trivials. Cover ALL, sequentially, no exceptions (RN09) |
