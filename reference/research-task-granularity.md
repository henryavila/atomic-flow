# Pesquisa: Granularidade e Formato de Tasks para AI Agents

**Data:** 2026-04-05
**Fontes:** TDAD Paper (arXiv), Superpowers, BMAD, spec-kit, Kiro, Anthropic, Osmani, JetBrains
**Propósito:** Definir formato ideal de task files para agents que começam com /clear (zero context)

---

## 1. O Problema: /clear = Zero Context

Após `/clear`, a AI não tem memória. O arquivo da task É o único contexto. Isso significa:
- Task breve demais → agent adivinha, código superficial (BMAD Issue #2003)
- Task verbosa demais → agent perde foco (TDAD Paper: 107 linhas → 12% resolução vs 20 linhas → 50%)
- Sweet spot: **40-80 linhas por task**

## 2. Evidência: Individual Files vs Single List

| Tool | Formato | Resultado |
|---|---|---|
| Kiro | Single tasks.md com checkboxes | Funciona mas limita detail level |
| spec-kit | Single tasks.md com IDs | Limita contexto por task |
| BMAD | Individual story-{slug}.md | Melhor contexto mas Issue #2003 |
| Superpowers | Single plan.md, mas extrai task text para subagent prompt | Isolamento efetivo |
| Manus | Single file, mas UUID dirs para sessões paralelas | Minimal |

**Consenso:** Mesmo tools com single file ISOLAM tasks na execução. Superpowers: "Never inherit session's context — construct exactly what they need."

## 3. TDAD Paper (Achado Crítico)

**arXiv:2603.17973, 2026:**
- Vanilla (sem contexto): 6.08% regressões
- TDD verboso (procedural HOW): 9.94% regressões — **PIOR que nada**
- Targeted (WHICH tests): 1.82% regressões — **70% melhor**
- 107 linhas → 12% resolução; 20 linhas → 50% resolução (4x melhor)

**Lição:** Informar QUAIS testes existem funciona. Prescrever COMO fazer TDD piora.

## 4. BMAD Issue #2003

Agent recebe "only task titles" → produz "código superficialmente correto mas quebrado".
**Prova:** Tasks com apenas título/descrição breve são insuficientes.

## 5. Template Recomendado (~40-80 linhas)

```markdown
---
id: T2
title: Create auth service
estimated: 10 min
status: pending
depends_on: [T1]
blocks: [T3, T4]
files:
  - path: app/Services/AuthService.php
    action: create
  - path: tests/Unit/Services/AuthServiceTest.php
    action: create
---

# T2: Create auth service

## Context
Feature: User Login (spec: ../spec.md)
[2-3 linhas: onde essa task se encaixa]

## What to Do
[O QUE fazer + quais RF/RN implementar. NÃO como.]

## Files
- Create: `exact/path/to/file.ext`
- Modify: `exact/path/to/existing.ext`
- Reference (read-only): `path/to/dependency.ext`

## Tests to Verify
- Existing: `tests/path/to/existing_test.ext` (must still pass)
- New: `tests/path/to/new_test.ext`

## Test Contracts (from spec)
- TC-RF01-1 [business]: {input} → {output}
- TC-RF01-2 [error]: {input} → {output}

## Pattern to Follow
See existing: `path/to/similar/file.ext` (same project pattern)

## Constraints
- Do NOT touch files outside this task's scope
- Do NOT weaken existing test assertions
- Do NOT add features beyond declared RF/RN

## Done Criteria
- `test command --filter=NewTest` passes
- `test command` (full suite) passes
- `git diff --stat` shows only declared files
```

## 6. Seções e Evidência

| Seção | Propósito | Evidência |
|---|---|---|
| YAML frontmatter | Machine-parseable | Schema B (state-tracking-patterns.md) |
| Context | Onde a task se encaixa | Superpowers implementer-prompt |
| What to Do | O QUE + quais RF/RN | BMAD story files (prevent Issue #2003) |
| Files | Paths exatos | Superpowers, spec-kit |
| Tests to Verify | QUAIS testes | TDAD Paper (70% menos regressões) |
| Test Contracts | {input} → {output} | Atomic Flow design |
| Pattern to Follow | Referência a código similar | Osmani, JetBrains |
| Constraints | O que NÃO fazer | Superpowers anti-scope-creep |
| Done Criteria | Comando determinístico | METHOD-NATIVE.md |

## 7. Estrutura de Diretórios

```
.ai/features/NNN-slug/
  tasks/
    index.md              # Coordenação: IDs, status, deps (~20 linhas)
    T1-create-model.md    # Execução: self-contained (~40-80 linhas)
    T2-create-service.md
    T3-create-resource.md
```

AI lê index.md (qual task?) → lê TN-name.md (o que fazer?). Dois reads focados.

## 8. O que NÃO incluir na task

| Excluir | Por quê | Evidência |
|---|---|---|
| Instruções procedurais de TDD | Aumenta regressões em 63% | TDAD Paper |
| Spec completa inline | Polui contexto | Anthropic context engineering |
| Descrições de outras tasks | Context pollution | Manus research |
| Regras genéricas de código | Já no CLAUDE.md | Martin Fowler tiers |
| Placeholders ("add error handling") | Vago, agent adivinha | Superpowers |

## Fontes

- TDAD Paper: arXiv:2603.17973
- Superpowers: subagent-driven-development, implementer-prompt.md, writing-plans
- BMAD: Issue #2003, story files
- spec-kit: tasks-template.md
- Kiro: kiro.dev/docs/specs/best-practices
- Anthropic: context engineering article
- Osmani: addyosmani.com/blog/good-spec
- JetBrains: coding guidelines for AI agents
- Martin Fowler: context engineering for coding agents
- Manus: context engineering lessons
