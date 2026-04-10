# Handoff: Criação dos 10 Skill Playbooks do Atomic Flow

## Missão

Criar os 10 skills do `@henryavila/atomic-flow` como **playbooks** — não checklists. Cada skill é um artefato de primeira classe com pesquisa, design e revisão humana dedicados. Uma skill por vez, em ordem de prioridade.

## Contexto essencial

### O que é o Atomic Flow
Sistema de desenvolvimento AI-assisted com 7 fases: ① Research → ② Spec → ③ Validate → ④ Decompose → ⑤ Implement → ⑥ Review → ⑦ Ship. Cada transição tem um gate humano. O sistema tem 3 camadas: METHOD (skills ensinam), ENFORCER (SQLite + MCP + hooks garantem), DISTRIBUTION (npm entrega).

### O que são as skills
As skills são **o produto**. São playbooks que ensinam a AI a trabalhar corretamente em cada fase. Sem elas, a infra (SQLite, hooks, MCP) é inútil — enforcement sem direção. A infra será construída DEPOIS.

### Onde mora a base de conhecimento
- **Método:** `reference/METHOD-NATIVE.md` — 200+ fontes, técnicas por fase, anti-patterns, prompt templates
- **Spec do sistema:** `docs/specs/2026-04-05-atomic-flow-mvp.md` — RF01-RF22, RN01-RN11, EC01-EC08
- **Análise por skill:** `docs/specs/skill-requirements-analysis.md` — enforcement mapping, Hard Gates, Red Flags, edge cases por skill
- **Decisões:** `docs/specs/decisions.md` — 28 P&S, especialmente P23 (formato das skills baseado em evidência)
- **Implementation plan (rascunho):** `docs/specs/2026-04-05-atomic-flow-mvp-tasks.md` — contém contracts (schema.sql, interfaces) úteis como referência

### Formato das skills (RN02 + evolução)
Formato definido em P23, baseado em evidência de prompt engineering:

**Anatomia em 3 camadas (não 5 seções planas):**

```
CORE (3-5 rules — CSDD Paper: 96% compliance)
├── Iron Law: code block, sentence case (ALL CAPS overtriggers no Claude 4.6)
├── HARD-GATE: <HARD-GATE> XML tag (ÚNICA seção em XML — Claude fine-tuned)
│   Formato: "Se prestes a [ação] sem [condição]: PARE. [Correção]."
└── Constraint count: max 3-5 regras invioláveis

PLAYBOOK (técnicas — profundidade, NÃO limitado a 3-5)
├── Process: markdown numerado, framing positivo ("faça X" não "não faça Y")
├── Decision trees: quando usar qual abordagem
├── Templates: prompts/patterns exatos
└── Anti-patterns com exemplos concretos

DEFENSE (auto-detecção de falha)
├── Red Flags: 1ª pessoa ("Já sei a resposta...") — few-shot negativo
└── Rationalization table: 2 colunas (Tentação | Por que falha)
```

**Por que 3-5 rules no CORE mas skill pode ser maior:** O CSDD Paper limita rules invioláveis. O playbook carrega em momento específico (invoke da skill), não competindo com CLAUDE.md (~100-150 slots). Context loading é em 3 camadas:
1. SessionStart → 3 rules + status (~200 tokens)
2. Skill → playbook completo (~2000-3000 tokens)
3. Task file → contexto específico (~500-800 tokens)

**Tamanho alvo:** ~80-120 linhas para skills críticas, ~30-40 para utilitárias.

**Template vars:** Skills usam `{{BASH_TOOL}}`, `{{READ_TOOL}}`, etc. — nunca hardcode tool names.

### Evidências-chave para grounding
- CSDD Paper: 3-5 rules = 96% compliance vs 78% com constituição
- TDAD Paper (arXiv 2026): Instruções procedurais verbosas de TDD sem contexto de testes AUMENTARAM regressões 6%→10%. O que funciona: informar QUAIS testes existem, não HOW to TDD
- Pink Elephant Problem: framing negativo pode induzir o comportamento indesejado
- Reflexion framework: Red Flags em 1ª pessoa = few-shot negativo eficaz
- METR Study: AI sem metodologia = 19% mais lento, gap de percepção 43 pontos
- Anthropic: ALL CAPS reduzir para Claude 4.6 (overtriggering)
- Bache (2026): 2 abordagens TDD válidas — clássico RED→GREEN e combinado

### Lição desta sessão (P29)
Na fase DECOMPOSE, a AI escreveu 1242 linhas de plano sem checkpoint humano na lista de tasks. Método diz "AI propõe, humano julga." A skill `4-decompose` DEVE forçar pausa entre proposta e detalhamento.

---

## Ordem de criação (prioridade)

### Tier 1 — Críticas (onde o trabalho real acontece)
1. **5-implement** — Loop TDD, recovery, learning, micro-commits
2. **4-decompose** — Contracts-first, task splitting, checkpoint humano
3. **2-spec** — Entrevista one-at-a-time, formato ✓/✗, Test Contracts

### Tier 2 — Importantes (qualidade depende delas)
4. **1-research** — Exploração antes de decidir, findings granulares
5. **3-validate** — 3 layers em ordem, adversarial review
6. **6-review** — Convergence rule, execução vs spec

### Tier 3 — Utilitárias (operacionais)
7. **7-ship** — Reconcile, merge, cleanup
8. **new** — Criar feature, worktree, dirs
9. **gate** — Preflight + approve/reject
10. **status** — Ler SQLite, formatar output

## Processo por skill

1. **Research focado**: Ler as seções relevantes do METHOD-NATIVE.md + skill-requirements-analysis.md + decisões. Pergunta específica: "O que faz esta fase funcionar? O que faz falhar?"
2. **Propor playbook**: Core (rules) + Playbook (técnicas) + Defense (auto-detecção). Apresentar ao humano.
3. **Revisão humana**: Uma skill por vez. Humano valida técnicas, ajusta, aprova.
4. **Salvar**: `skills/en/{name}.md` — formato final pronto para render via template vars.

## MCP tools que cada skill chama (referência)

| Skill | MCP tools |
|---|---|
| 5-implement | task_done, learn, transition, status |
| 4-decompose | transition, status, preflight |
| 2-spec | transition, status |
| 1-research | transition, status |
| 3-validate | validate_spec, transition, status |
| 6-review | preflight, status |
| 7-ship | reconcile, transition, status |
| new | new_feature |
| gate | gate_approve, preflight |
| status | status |

## Começa por: `5-implement`

A skill mais crítica. Onde código é produzido. Onde a AI mais falha (testes tautológicos, context rot, feature dropout silencioso).

Research focado para `5-implement`:
- METHOD-NATIVE.md linhas 612-700+ (Fase 4 IMPLEMENT)
- skill-requirements-analysis.md seção atomic-flow:5-implement (linhas 242-322)
- Anti-patterns da seção "Verdades Universais" (linhas 47-58)
- TDAD Paper finding sobre TDD (linha 646)
- Bache 8-practitioner study (linha 639-642)
