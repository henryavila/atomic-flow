---
name: 1-research
description: Use when starting a new feature — explore the codebase before any plan or code, save granular findings, never propose solutions
---

# 1-research — Codebase Exploration

## Core

```
Discover and document. Do not decide or implement.
```

### Rules

1. **Read-only mode.** Do not create or modify any code files. Only write to research docs.
2. **Codebase first, external second.** Explore existing code for patterns and constraints before searching the web. Never rely on training data alone.
3. **Findings, not solutions.** Present what you found — patterns, constraints, risks, dependencies. Do NOT propose how to build the feature.
4. **Save granularly.** Each research topic → separate file in `docs/research/NNN-slug/`. Findings that survive only in conversation context are lost after `/clear`.

<HARD-GATE>
If about to create or modify a file outside of research docs: STOP. This phase is read-only.
</HARD-GATE>

<HARD-GATE>
If about to propose a solution or architecture: STOP. Present findings only — decisions happen in the SPEC phase.
</HARD-GATE>

## Playbook

### Exploration Strategy

1. Enter Plan Mode (read-only) or use subagents for broad exploration
2. Investigate systematically:
   - **Existing patterns:** How does the project handle similar features? ({{READ_TOOL}} + search 2-3 examples)
   - **Dependencies:** Which models, services, configs will this feature touch or extend?
   - **Constraints:** Schema limitations, API contracts, permission models
   - **External docs:** Use web search for lib documentation when codebase has no examples
3. Use subagents for exploration spanning 5+ files — saves context window
4. {{READ_TOOL}} directly only when scope is already narrow

### Output Format

Save to `docs/research/NNN-slug/{topic}.md`:
- One file per research topic (not one monolith)
- Each file: what was found, where (file paths), and implications
- Shared research (cross-feature) goes to `docs/research/shared/`

### When to Skip

Feature is trivial (1-2 files) AND you already know the exact pattern → skip research, go to spec. But if there is any uncertainty about patterns, dependencies, or constraints — research first.

### Escalation

If research reveals an architectural blocker (fundamental constraint that makes the feature impossible or requires system-level changes): escalate to human immediately with evidence.

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "I already know how to solve this, I'll skip research"
- "It's simple, no need to explore"
- "I'll create the file while researching, to save time"
- "I'll propose the architecture now based on what I found"

All of these mean: STOP. You are skipping the discovery phase.

### Rationalization Table

| Temptation | Why It Fails |
|------------|--------------|
| "I know the answer already" | Training data ≠ this codebase. Patterns diverge. Check first |
| "Too simple to research" | Simple features in complex codebases have hidden constraints |
| "Create file to save time" | Premature files bypass the spec phase — decisions made without evidence |
| "Propose solution now" | Solutions without full research miss constraints discovered later |
