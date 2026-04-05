# Pesquisa: Enforcement de Metodologia em Desenvolvimento com AI

**Data:** 2026-04-05
**Propósito:** Fundamentar a diferença entre "metodologia documentada" e "metodologia enforçada" no Atomic Flow

---

## 1. O Espectro de Enforcement

| Nível | Mecanismo | Compliance | Exemplo |
|---|---|---|---|
| 0 | Documentação (CLAUDE.md, README) | ~60-80% | METHOD-NATIVE.md |
| 1 | Skills com HARD-GATE, Red Flags | ~80-96% | Superpowers, atomic-skills |
| 2 | File-based state + SessionStart | ~90-95% | Kiro tasks.md, tick-md |
| 3 | Hooks determinísticos (exit 2 = block) | ~95-100% | ECC hooks |
| 4 | Contratos formais (ABC/Sanna) | 88-100% | Acadêmico/enterprise |

## 2. Evidência de Falha em Prompt-Only

### Superpowers (Issue #528)
Claude escolhe skippar spec e code quality reviews, admitindo "querer ir mais rápido". Compliance degrada com context pressure. Solução da comunidade: gates EXTERNOS ao contexto do LLM.

### BMAD (Issue #1473)
Agentes pulam passos, executam diretamente em vez de spawnar subagents, marcam steps como completos sem evidência. Proposta: verification gates com enforcement opcional.

### CSDD Paper (arXiv 2602.02584v1)
- 96% compliance com 3-5 princípios targeted por request
- 78% compliance com documento constitucional inteiro
- **Lição:** Cada skill deve ter APENAS as regras relevantes para aquela fase

### ABC Paper (arXiv 2602.22302v1)
- Sem recovery: 99% per-step → 36.6% em 100 steps (decaimento exponencial)
- Com recovery ativo: 95% sustentado
- **Prova matemática** que documentação-only degrada; enforcement com recovery mantém

## 3. Como Tools Bem-Sucedidos Enforçam

### Kiro (AWS)
- Enforcement ESTRUTURAL: IDE força fluxo Requirements → Design → Tasks
- Specs automaticamente incluídas no contexto do agent
- Steering rules no repo guiam comportamento

### ECC (132K stars)
- 30+ hooks configurados
- PreToolUse com exit code 2 = block
- 100% compliance para file operations
- Gap: não enforça workflow, só file ops

### FORGE
- Constitutional governance: princípios inegociáveis em markdown
- 73% redução em CWE violations vs unconstrained
- 4.3x melhoria em compliance documentation

## 4. Mecanismos de Hooks (Claude Code)

### O que hooks PODEM enforçar:
- **SessionStart:** Injetar tracking state, lembrar fase, detectar sessões stale
- **PreToolUse (Write/Edit):** Bloquear implementação antes de spec aprovada; enforçar TDD
- **PreToolUse (Bash):** Bloquear git commit se gates pendentes
- **PostToolUse:** Auto-lint, verificar spec_hash drift
- **Stop:** Verificar obrigações da fase, TDD compliance

### O que hooks NÃO podem:
- Sequenciamento de fases diretamente
- Compliance semântica (só padrões)
- Intenção do agent (hooks veem tools, não reasoning)
- Enforcement retroativo (só PreToolUse pode bloquear)

### Pattern de 4 camadas (CodeToDeploy):
1. Context re-injection (SessionStart/PreCompact)
2. Deterministic validators (PreToolUse)
3. Periodic nudges (Stop event, a cada N respostas)
4. Judgment checks (prompt-type hooks via modelo leve)

## 5. File-Based State: Consenso Emergente

Múltiplos projetos independentes convergiram em markdown no filesystem:
- Atomic Flow: `.ai/tracking/{feature}.md`
- Kiro: `tasks.md`
- tick-md: `TICK.md` (com file locking)
- Manus ($2B, Meta): `task_plan.md` + `notes.md`
- Beads (18.7K stars): SQLite + markdown

Rationale: sobrevive /clear, compaction, troca de sessão, troca de modelo.

## 6. O Gap do Atomic Flow

### O que a spec atual cobre (Nível 0-1):
- Instalar skills (prompts)
- Instalar templates
- Annotation tool

### O que FALTA (Nível 2-3):
- Tracking como state machine que IMPEDE phantom completion
- Hooks que enforçam transições de fase
- SessionStart que injeta estado automaticamente
- Gates como precondições de hooks (G1 ≠ approved → bloqueia Write em src/)
- Recovery em 4 níveis
- Convergence rule no review
- spec_hash drift detection enforçado (não só documentado)

## 7. Recomendação

Layered enforcement:
```
Nível 0: METHOD-NATIVE.md           (referência, não enforcement)
Nível 1: af1-af7 skill files        (loaded per phase, 3-5 regras targeted)
Nível 2: .ai/tracking/{feature}.md  (file-based state machine)
Nível 3: Claude Code hooks          (deterministic gates on tool calls)
Nível 4: (futuro) ABC/Sanna         (formal contracts)
```

Cada nível reforça o anterior. Skills sozinhas ~80-96%. Com hooks ~95-100%.

## 8. Fontes

- BMAD: github.com/bmad-code-org/BMAD-METHOD, Issue #1473
- Superpowers: Issue #528 (Claude skips reviews)
- CSDD: arXiv 2602.02584v1 (constitutional constraints)
- ABC: arXiv 2602.22302v1 (behavioral contracts)
- Kiro: morphllm.com, prommer.net, InfoQ
- ECC: 132K stars, hooks enforcement
- tick-md: markdown-based multi-agent coordination
- Sanna: sanna.dev (YAML constitutions)
- Microsoft Agent Governance Toolkit: April 2026
- CodeToDeploy: Medium (hooks as law)
- Claude Code Hooks: Anthropic docs, Pixelmojo reference
