# Pesquisa: Validação de Spec em Desenvolvimento com AI

**Data:** 2026-04-05
**Fontes:** 200+ artigos, 11 agentes de pesquisa, IEEE 29148, NASA ARM, FORGE, Superpowers, BMAD, ECC, CCG
**Propósito:** Fundamentar a Fase ③ VALIDATE do Atomic Flow

---

## 1. Por que Spec Review é Crítico

| Evidência | Fonte |
|-----------|-------|
| Spec é o fator #1 de qualidade do output | Osmani, Augment Code, GitHub Spec Kit |
| Rework caiu de 30-50% → <15% com spec review formal | FORGE methodology ("constitution" files) |
| 45% do código AI tem vulnerabilidades | Veracode 2025 |
| 1.7x mais bugs em código AI vs humano | CodeRabbit, 470 PRs |
| Devs com AI: percepção +24%, realidade -19% | METR Study (RCT, 246 tarefas, 16 devs) |

---

## 2. Como Metodologias Existentes Validam Specs

### Superpowers (131K stars)
- 3 subagents: Implementer + Spec Reviewer (adversarial) + Code Quality Reviewer
- Two-Stage Review: Spec Compliance PRIMEIRO, Code Quality DEPOIS (ordem importa)
- Review Loop Ceiling: máx 3 iterações antes de escalar
- **Limitação:** Enforcement é SOFT (prompt-based, ~80% compliance)
- **Bug documentado:** v5.0.5 — spec review era skipado porque estava em prosa, não em checklist numerado
- **Lição:** Checklist items são prioridade de execução; prosa é opcional

### FORGE
- Constitutional Governance: princípios inegociáveis em arquivo markdown
- Dual-Model Review: modelos diferentes veem blind spots diferentes
- Rework <15% com "constitution" files vs 30-50% sem

### BMAD (43K stars)
- 8 personas de agente, specs estilo Gherkin (Given/When/Then)
- Context Sharding: 74% redução de tokens
- **Limitação:** 2 meses de learning curve, issues com código superficial, mínimo de 3 issues forçado causa loops infinitos

### ECC (132K stars)
- Hooks = 100% compliance (vs 80% CLAUDE.md)
- PreToolUse/PostToolUse gates com exit code 2 = BLOCK
- **Gap:** Zero automação para spec review — só para código

### CCG (Multi-model)
- `/ccg:spec-plan`: Análise multi-modelo (Codex+Gemini)
- Property-Based Testing properties na spec
- **Limitação:** 7x custo de tokens

---

## 3. O Que Torna Uma Spec Ruim (6 Anti-Patterns)

| Anti-Pattern | Impacto | Fonte |
|--------------|---------|-------|
| **Procedural (HOW instead of WHAT)** | AI trava na abordagem errada, difícil pivotar | Osmani, Augment Code |
| **Ambígua/Vaga** | Termos indefinidos ("rápido", "responsivo"), edge cases ausentes | METR Study |
| **Incompleta** | 20-30% requisitos faltando, deps não declaradas | IEEE 29148 |
| **Não-verificável** | Critérios subjetivos ("parece bom"), sem thresholds | TDAD Paper |
| **Inconsistente/Contraditória** | RF01 diz "validar" vs RF05 diz "confiar" | BMAD lessons |
| **Desconectada do codebase** | Spec sem referência a padrões existentes, conflita com arquitetura | FORGE |

---

## 4. Top 4 Defeitos de Spec (por frequência)

1. **Incompletude** — requisitos faltando (mais comum)
2. **Ambiguidade** — termos vagos ou com múltiplas interpretações
3. **Inconsistência** — requisitos contraditórios
4. **Redundância** — requisitos duplicados ou sobrepostos

*(IEEE 29148, múltiplas fontes)*

---

## 5. Checks Determinísticos (Automáveis, Zero AI)

### 5.1 Critérios de Aceitação por Requisito

**Problema:** Formato antigo separa requisitos de critérios em seções desconectadas.
**Solução:** Formato inline — critérios indentados sob cada requisito com ✓/✗.

```
- **RF01:** [descrição — WHAT]
  - ✓ [happy path → resultado]
  - ✗ [unhappy path → resultado]
```

**Validação:**
```
PARSE: /^- \*\*(RF|RN|EC)\d+:\*\*/
FOR EACH: contar linhas indentadas /^\s+- [✓✗]/
IF count == 0 → FAIL
IF RF AND count_✗ == 0 → WARN "sem unhappy path"
```

### 5.2 Linguagem Vaga (NASA ARM + IEEE 29148)

**Word list (12 categorias):**
```
WEAK_WORDS = {
  optionality: [should, might, could, may, would],
  vagueness:   [typically, usually, normally, generally, often,
                appropriate, adequate, timely, user-friendly,
                fast, responsive, efficient, reasonable, proper],
  incomplete:  [etc., and so on, and more, among others,
                some, several, many, few],
  subjective:  [easy, simple, intuitive, obvious, clear,
                good, nice, works well, looks good]
}
```

**Scoping:** Scan apenas em RF, RN, EC e linhas ✓/✗. NÃO em Decisões/Alternativas.
- Weak word em critério (✓/✗) → FAIL
- Weak word em requisito → WARN

### 5.3 Implementation-Free (sem HOW)

**Scoping:** Scan apenas em RF, RN, EC. Decisões Tomadas e Arquivos Envolvidos PODEM conter HOW.

**Padrões:**
- Code patterns (function calls, imports, variables) → FAIL
- Verbos de implementação (implement, instantiate, serialize) → FAIL
- Nomes de tecnologia (Redis, React, Laravel) → WARN (humano decide)

**Referência formal:** IEEE 29148 define "implementation free" como atributo de qualidade.

### 5.4 Completude Estrutural

Seções obrigatórias: Objetivo, Requisitos Funcionais, Regras de Negócio, Edge Cases, Arquivos Envolvidos, Fora de Escopo.

### 5.5 Marcadores Pendentes

`[TBD]`, `[TODO]`, `[?]`, `[DECIDIR]`, `[PENDING]` → FAIL

---

## 6. Revisão Humana (Layer 2)

### O que o humano faz (insubstituível por AI)

| Dimensão | Por que só humano |
|----------|------------------|
| Viabilidade de negócio | AI não conhece contexto estratégico |
| Corretude de domínio | AI não conhece as regras reais do negócio |
| Priorização | AI não sabe o que é mais importante para o stakeholder |
| Adequação de escopo | AI não sabe se o escopo é grande/pequeno demais para o momento |
| Feasibility técnica | AI pode propor algo impossível no prazo/stack |

### Sequência validada: Humano DEPOIS do Layer 1

Se AI revisa primeiro e flagga 50 itens, humano precisa triar todos 50. Se determinístico roda primeiro e remove problemas estruturais, humano foca em julgamento de alto nível.

*(intent-driven.dev, Osmani, arXiv 2507.03405)*

### Ceiling: máx 3 rounds

Se após 3 rounds de ajuste ainda há issues CRITICAL → escalar (repensar feature, quebrar em features menores).

---

## 7. Review AI-Guiada (Layer 3) — O Que a AI Verifica

### 7 Dimensões que AI adiciona valor

| Dimensão | O que busca | Exemplo |
|----------|-------------|---------|
| **Consistência interna** | Requisitos se contradizem? | RF01 diz "validar inputs" vs RF05 diz "aceitar inputs raw" |
| **Completude (gap detection)** | Cenários implícitos não cobertos | "Login" sem mention de "password reset" ou "session expiry" |
| **Qualidade dos critérios** | Cada critério é testável com pass/fail claro? | "Sistema funciona bem" vs "Response < 200ms no p95" |
| **Atomicidade** | Cada RF/RN contém exatamente 1 comportamento rastreável? | RF01 com 3 comportamentos diferentes = deve ser 3 RFs |
| **Rastreabilidade** | Cada elemento referencia elementos relacionados? | RF01 menciona "permissão" mas nenhuma RN define permissões |
| **Ambiguidade contextual** | Ambiguidade que regex não pega (pronomes, condições incompletas) | "O usuário pode ver seus dados" — quais dados? Todos? Só os dele? |
| **Assumptions surfacing** | Premissas implícitas que deveriam ser decisões explícitas | Spec assume single-tenant mas não declara isso |

### O que AI NÃO deve verificar (6 exclusões com evidência)

| Exclusão | Por quê | Evidência |
|----------|---------|-----------|
| Viabilidade de negócio | Falta contexto estratégico | Consenso múltiplas fontes |
| Corretude de domínio | 0/5 taxa de detecção para violações de convenção de domínio | arXiv spec-grounded review (4 modelos testados) |
| Adequação arquitetural | "Brilhante em código, terrível em arquitetura" | Reddit r/ClaudeAI, Gerus-lab |
| Prioridade/ordenação | Decisão de stakeholder | Human-only |
| Suficiência do escopo | Precisa de contexto de negócio | Human-only |
| Adequação do escopo | Julgamento estratégico | Human-only |

### Risco Crítico: Overcorrection Problem

**Achado (março 2026):** LLMs têm 62-88% taxa de false negative quando revisam — sistematicamente over-reject trabalho correto. Prompts de review mais detalhados pioram (145% aumento em rejeições falsas).

**Mitigação:**
- Toda finding DEVE citar evidência (linha/seção da spec)
- Classificação de severidade obrigatória (CRITICAL/HIGH/MEDIUM/LOW)
- Cap de findings (máx 10 por review)
- Separar extração (encontrar issues) de julgamento (classificar severidade)

### Anti-Sycophancy (prevenir rubber-stamping)

5 técnicas para prevenir AI de aprovar tudo:
1. **Third-person framing** — "Revise a spec como se fosse de outro desenvolvedor"
2. **Minimum finding requirement** — "Encontre pelo menos 3 pontos de melhoria"
3. **Adversarial mindset** — "Assuma que a spec tem problemas — tente encontrá-los"
4. **Separação extração/julgamento** — Primeiro lista TODOS os pontos, depois classifica
5. **Evidence requirement** — Toda finding deve citar seção:linha da spec

---

## 8. Formato de Validação (salvo na spec)

Resultados ficam no PRÓPRIO arquivo da spec (one file = toda verdade):

```markdown
---

## Validation

### Layer 1: Gate Determinístico
Status: PASS | Run: YYYY-MM-DD

| Check | Result | Detalhe |
|-------|--------|---------|
| Critérios por RF | PASS | N/N RF têm ✓/✗ |
| Linguagem vaga | PASS | 0 weak words |
| Implementation-free | WARN | RF03 "REST" — aceito |
| Estrutura | PASS | N/N seções |
| Pendentes | PASS | 0 marcadores |

### Layer 2: Revisão Humana
Status: PASS | By: [nome] | Date: YYYY-MM-DD
Ajustes: [o que foi mudado]

### Layer 3: Review AI
Status: PASS | Run: YYYY-MM-DD
Findings: N CRITICAL, N HIGH, N MEDIUM, N LOW

### Gate G1
Result: APPROVED | spec_hash: [sha256]
```

---

## 9. Sequência de Execução das 3 Layers

```
Layer 1 (determinístico) → roda primeiro, remove problemas estruturais
    ↓ PASS
Layer 2 (humano) → foca em julgamento de alto nível, sem noise de L1
    ↓ PASS
Layer 3 (AI-guiada) → encontra inconsistências semânticas que humano pode ter missed
    ↓ PASS (0 CRITICAL, 0 HIGH não-justificado)
Gate G1 → APPROVED + spec_hash gerado
```

**Alternativa pesquisada (AI primeiro → humano depois):**
Rejeitada porque AI geraria 50+ findings que humano precisaria triar, incluindo false positives. Humano depois do determinístico é mais eficiente.

---

## 10. Skills de Review Existentes (atomic-skills) — Padrões Reutilizáveis

### as-review-plan-internal
- **Regra fundamental:** "NO APPROVAL WITHOUT EVIDENCE. Cite line numbers."
- **7 checks:** contradições, deps quebradas, ordenação, ambiguidade, consistência de schema, listas de arquivos, cobertura de testes
- **Loop:** Máx 3 iterações. Cada uma lê plano inteiro com Read tool (nunca mental)
- **Anti-pattern:** "This seems consistent, I don't need line numbers" → STOP

### as-review-plan-vs-artifacts
- **Regra fundamental:** "NO APPROVAL WITHOUT CROSS-REFERENCE."
- **Hard gate:** Corrige o PLANO, NUNCA os artefatos
- **6 checks:** cobertura, critérios de aceitação, phase gates, deps, schema/API, UX
- **Output:** Tabela de cross-reference (Artifact:line | Plan:line | Finding | Severity)

### as-hunt (adversarial testing)
- **Hard gate:** "Expected value comes from SPEC or CODE? If from code: STOP."
- **Mindset:** Penetration tester, não QA checklist runner

### Padrão comum a todos:
- Iron Law no topo (regra inviolável)
- HARD-GATE antes de ações perigosas
- Red Flags (pensamentos que indicam atalho)
- Rationalization Table (tentação → por que falha)
- Evidência obrigatória (arquivo:linha)
- Max 3 iterações → escalar

---

## 11. Gaps no Ecossistema (Oportunidades do Atomic Flow)

| Gap | Status Atual | Atomic Flow |
|-----|-------------|-------------|
| Spec quality gate determinístico | Nenhum tool implementa | ✅ Layer 1 com 5 checks |
| spec_hash drift detection | Nenhum tool implementa (terraform faz para infra) | ✅ SHA-256 após G1 |
| Formato de spec machine-parseable | Nenhum tool define formato validável | ✅ RF/RN/EC com ✓/✗ inline |
| Review convergence tracking | Nenhum tool rastreia | ✅ CRITICAL+HIGH deve diminuir por round |
| Validação salva na spec (one file truth) | Nenhum tool faz | ✅ Seção Validation no spec file |
| 3-layer validation (determinístico + humano + AI) | Nenhum tool combina os 3 | ✅ Layer 1 → 2 → 3 |
