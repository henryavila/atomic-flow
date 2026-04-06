# Pesquisa: Learning Loop Entre Tasks — Implementar, Aprender, Refinar

**Data:** 2026-04-05
**Fontes:** LangGraph, Stanford MemoryArena, BMAD, Superpowers, Intent.dev, Self-Refine, TDAD, Toyota Kata, AAR, PDCA
**Propósito:** Avaliar ciclo implement → validate → save learnings → revise pending tasks → implement next

---

## 1. O Que Ferramentas Existentes Fazem (e Não Fazem)

| Tool | Cria tasks | Learning entre tasks | Revisa tasks pendentes |
|---|---|---|---|
| BMAD | Batch upfront | Implícito (lê codebase) | Não |
| Superpowers | Plan upfront | **Explicitamente previne** ("never inherit context") | Não |
| Kiro | Batch da spec | Hooks event-driven | Sem mecanismo formal |
| Intent.dev | Coordinator decompõe | Living spec updates | Sim (Coordinator) |
| LangGraph | Planner | Replanner acumula past_steps | Sim (Replanner) |
| METHOD-NATIVE | Batch upfront | Session Log + strikes | Só mid-feature escalation |

**Achado crítico:** BMAD NÃO tem learning loop explícito. Superpowers PROÍBE propagação de contexto entre tasks. O ciclo proposto seria genuinamente diferenciador.

## 2. Evidência a Favor do Learning Loop

### Stanford MemoryArena
Agents com memória inter-task superam agents sem. "Agents acquire knowledge through interaction, then apply those learnings to solve subsequent challenges."

### Self-Refine (Carnegie Mellon)
5-40% melhoria com refinamento iterativo. Mas: diminishing returns após 2-3 iterações. Qualidade DEGRADA após 3-4.

### PDCA Aplicado a AI Coding (InfoQ)
61% redução de defeitos com reflexão estruturada. Act phase = 5-10 min.

### LangGraph Plan-and-Execute
Replanner acumula `past_steps` e revisa plano restante. Exatamente o padrão proposto.

### Intent.dev Living Specs
"Without bidirectional updates, specifications are just elaborate prompts." Mudanças de implementação fluem DE VOLTA para a spec.

## 3. Evidência de Limites

### Self-Refine / FAIR-RAG
- Optimal: 2-3 iterações
- Após 3-4: qualidade degrada (informação ruidosa)
- Custo escala linearmente

### Toyota Kata
- Favor smaller/shorter cycles (1-5 min)
- Se demora mais, o plano era vago demais → re-decompor

### AAR (After Action Review)
- 3-5 min micro-retro imediatamente após evento
- Time-boxed é essencial

## 4. O Que Capturar Entre Tasks (por impacto)

1. **Decisões arquiteturais executadas** (não planejadas) — ex: "singleton, não factory como planejado"
2. **Mudanças de interface/contrato** — assinaturas reais vs spec assumptions
3. **Constraints descobertas** — "índice unique no email que spec não previa"
4. **Padrões escolhidos** — "repository pattern, remaining tasks devem seguir"
5. **Infra de teste criada** — "TestHelper que T3 e T4 devem usar"
6. **Arquivos realmente modificados** — pode diferir do planejado
7. **Gotchas e workarounds** — "Filament v3 não suporta nested tabs"

## 5. Revisão: Automática vs Gated

| Tipo de Learning | Revisão | Gate |
|---|---|---|
| Correção de file paths | Automática | Nenhum |
| Interface/contrato mudou | Automática | Nenhum |
| Nova dependência descoberta | Auto-sugestão | Humano aprova |
| Escopo da task mudou | Auto-sugestão de split/merge | Humano aprova |
| Padrão arquitetural mudou | Flag para humano | Humano decide |
| Task nova necessária | Proposta | Humano aprova |

**Princípio:** Atualizações mecânicas = automáticas. Decisões de julgamento = gate humano.

## 6. Safeguards (Anti-Loop Infinito)

| Safeguard | Threshold | Ação |
|---|---|---|
| Max ciclos de revisão/feature | 3 com revisões | Para, segue linear |
| Max tempo capture+revise | 5 min | Escalar para re-decomposição |
| Convergência | 2 ciclos com 0 revisões | Skip futuras revisões |
| Escopo de revisão | Só tasks dependentes + que compartilham arquivos | Nunca tasks sem relação |

## 7. Ciclo Proposto (Validado pela Pesquisa)

```
implement task → validate → AAR micro-retro (2-3 min)
  → save to LEARNINGS.md
  → scan pending tasks (deps + file overlap)
  → revise: mechanical = auto, judgment = human gate
  → implement next task
```

Overhead: ~5 min/task × 6 tasks = 30 min para feature de 90 min (~33%). Aceitável se prevenir 1 task implementada contra suposições stale.

## Fontes

- Stanford MemoryArena: digitaleconomy.stanford.edu
- Self-Refine: arXiv:2303.17651
- LangGraph: blog.langchain.com/planning-agents
- Intent.dev: augmentcode.com/guides/living-specs
- BMAD: github.com/bmad-code-org, Issue #2003
- Superpowers: github.com/obra/superpowers, Issue #528
- Toyota Kata: danlebrero.com, infoq.com
- AAR: Wharton, Thayer Leadership
- PDCA: InfoQ, Agile Alliance
- TDAD: arXiv:2603.17973
