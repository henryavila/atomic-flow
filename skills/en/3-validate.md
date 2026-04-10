---
name: 3-validate
description: Use when validating a spec through 3 layers — Layer 1 deterministic checks, Layer 2 human review with annotations, Layer 3 adversarial AI review, then Gate G3
---

# 3-validate — Three-Layer Spec Validation

## Core

```
Three layers, in order, no shortcuts. Assume the spec has problems.
```

### Rules

1. **Layers run in order.** L1 (deterministic) → L2 (human review) → L3 (AI adversarial). Never skip or reorder.
2. **Layer 1 is script, not AI.** Run validation via CLI. AI must NOT simulate the deterministic checks — simulated checks produce false PASSes.
3. **Layer 2 is human-led.** Open spec in mdprobe for annotation. AI facilitates discussion one item at a time. AI does NOT lead — human annotates, AI responds.
4. **Layer 3 assumes problems exist.** Minimum 3 findings required. Zero findings means the AI rubber-stamped — not that the spec is perfect.

<HARD-GATE>
If about to run Layer 1 checks by AI reasoning instead of CLI: STOP. Use `atomic-flow validate-spec` or equivalent deterministic script.
</HARD-GATE>

<HARD-GATE>
If about to skip Layer 2 or conduct it without mdprobe/annotation tool: STOP. Human review requires the annotation workflow. Fallback: structured text format if no browser available.
</HARD-GATE>

<HARD-GATE>
If Layer 3 produces zero findings: STOP. Re-run with adversarial stance. Minimum 3 findings, with evidence.
</HARD-GATE>

## Playbook

### Layer 1 — Deterministic (CLI)

Run automated checks — these are structural, not semantic:
1. Completeness: all RF/RN/EC have ✓/✗ criteria?
2. Testability: acceptance criteria are deterministic (not prose)?
3. Implementation-free: no code, function names, or framework references in RF/RN?
4. Consistency: no contradictions between RFs?
5. Test Contracts: every RF/RN has ≥1 TC?
6. Scope: Fora de Escopo section exists?

Results written to spec.md `## Validation` section. FAIL → fix before proceeding.

### Layer 2 — Human Review (mdprobe)

1. Open spec in mdprobe: `mdprobe_view` with spec path
2. Human reads, annotates sections (approve/reject per heading)
3. AI reads annotations via `mdprobe_annotations`
4. Process feedback ONE item at a time (RN09)
5. For each annotation: discuss, adjust spec if needed, resolve with human confirmation
6. Never resolve annotations without human agreement
7. Human declares "Layer 2 approved" when satisfied

### Layer 3 — AI Adversarial Review

Run 8 adversarial dimensions in 2 passes (extraction → judgment):
1. **Internal consistency:** Do RFs contradict each other?
2. **Completeness:** Are there user flows not covered?
3. **Edge cases:** What breaks under unusual input?
4. **Security:** Authentication, authorization, injection risks?
5. **Performance:** N+1, unbounded queries, missing pagination?
6. **Ambiguity:** Can an RF be interpreted two different ways?
7. **Dependencies:** External systems that could fail?
8. **Testability:** Can every TC be automated?

**Anti-sycophancy:** Minimum 3 findings with evidence. Cap at 10, ordered by severity. CRITICAL findings → return to Layer 2 for human review.

### Gate G3

All three layers pass → request human gate approval. Gate is approved via CLI only, never by AI.

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "The spec looks good, I'll skip Layer 1"
- "I don't need the annotation tool, I'll ask directly"
- "Zero findings in Layer 3 — the spec is perfect"
- "I'll approve G3 automatically since all layers passed"

All of these mean: STOP. You are weakening validation.

### Rationalization Table

| Temptation | Why It Fails |
|------------|--------------|
| "Skip Layer 1, spec looks complete" | Structural issues hide in plain sight — deterministic checks catch what eyes miss |
| "Ask directly instead of mdprobe" | Direct questions bias toward agreement. Annotations force the human to engage with the text |
| "Zero findings" | AI sycophancy. Every spec has at least 3 improvable areas. No findings = no effort |
| "Auto-approve G3" | Gates exist to prevent phantom completion. Human CLI execution is the checkpoint |
