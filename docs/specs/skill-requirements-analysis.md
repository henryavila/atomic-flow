# Análise de Requisitos por Skill — Atomic Flow

Data: 2026-04-06
Propósito: Definir requisitos detalhados de cada skill, integrações com enforcer, e riscos de não-determinismo.

---

## Legenda

- **HOOK:** Comportamento enforçado via hook (100% compliance)
- **SKILL:** Comportamento prescrito na skill (80-96% compliance)
- **SQLITE:** Estado gerenciado no banco (enforcement no dado)
- **RISK:** Ponto onde a AI pode desviar se não houver enforcement

---

## atomic-flow:1-research

### Objetivo
Explorar o codebase antes de qualquer plano ou código. Entender terreno.

### Pré-condições
- **SQLITE:** Feature existe no DB com `phase: research`
- **HOOK (SessionStart):** Injeta estado: feature name, phase=research, rules=read-only

### Comportamento esperado
1. Entra em Plan Mode (read-only)
2. Usa subagents para exploração ampla (5+ arquivos)
3. Leitura direta para escopo estreito
4. WebSearch para docs de libs externas
5. NÃO propõe solução — apenas apresenta findings
6. Salva findings em `.ai/features/NNN/research.md`

### Enforcement necessário
| O quê | Mecanismo | Risco se ausente |
|---|---|---|
| Read-only (não criar/editar arquivos de código) | **HOOK PreToolUse:** Write/Edit em qualquer arquivo fora de `.ai/features/NNN/` → exit 2 | AI cria arquivos prematuramente |
| Não propor solução | **SKILL:** Iron Law + Red Flags | AI pula para implementação (RISK: ~20% de desvio) |
| Salvar findings em research.md | **SKILL:** instrução explícita | AI pode deixar findings só no contexto (RISK: perdido após /clear) |
| Transição para spec | **SQLITE:** transition research→spec via CLI | AI não pode pular para decompose/implement |

### Hard Gates
- `<HARD-GATE>` Se está prestes a criar um arquivo que não é research.md: STOP.
- `<HARD-GATE>` Se está prestes a propor uma solução: STOP. Pesquise mais.

### Red Flags
- "Já sei como resolver, vou direto ao código"
- "Não preciso pesquisar, é simples"
- "Vou criar o arquivo enquanto pesquiso, para adiantar"

### Edge Cases
- Feature trivial (1 arquivo): método diz "pular research". HOOK deve permitir `atomic-flow transition --skip-research`
- Nenhum padrão similar encontrado: skill deve instruir WebSearch
- Research encontrou blocker arquitetural: skill deve instruir escalação ao humano

### Outputs
- `.ai/features/NNN/research.md` — findings do codebase
- SQLite: session_log entry
- Tracking.md: exportado com phase=research, session log atualizado

---

## atomic-flow:2-spec

### Objetivo
Escrever spec via entrevista (perguntas uma por vez). Criar tracking no SQLite.

### Pré-condições
- **SQLITE:** `phase: spec`
- **HOOK (SessionStart):** Injeta estado + rules: "spec only, no code files"

### Comportamento esperado
1. Lê research.md (se existe) para contexto
2. Conduz entrevista com humano: RF, RN, EC, UX, dados, integrações
3. Perguntas UMA POR VEZ (nunca batch)
4. Escreve spec em `.ai/features/NNN/spec.md` seguindo formato com ✓/✗
5. Gera Test Contracts derivados dos ✓/✗
6. Registra feature no SQLite (spec_hash, phase=spec)

### Enforcement necessário
| O quê | Mecanismo | Risco se ausente |
|---|---|---|
| Perguntas uma por vez | **SKILL:** Iron Law | AI faz 10 perguntas num bloco (RISK: respostas superficiais) |
| Formato ✓/✗ obrigatório | **SKILL + HOOK:** PostToolUse verifica spec escrita | AI escreve critérios como checkboxes (RISK: não-testáveis) |
| Test Contracts obrigatórios | **SKILL:** HARD-GATE antes de declarar spec completa | AI esquece TCs (RISK: Layer 1 vai pegar, mas tempo perdido) |
| Não criar código | **HOOK PreToolUse:** Block Write fora de `.ai/features/NNN/` | AI cria "código de exemplo" (RISK: implementação prematura) |
| Spec.md no formato correto | **HOOK PostToolUse:** Check seções obrigatórias após Write em spec.md | AI escreve formato livre (RISK: Layer 1 falha) |
| spec_hash gerado | **SQLITE:** trigger on spec.md write calcula hash | AI esquece hash (RISK: drift detection quebra) |

### Hard Gates
- `<HARD-GATE>` Se está prestes a escrever spec sem ter feito pelo menos 3 perguntas ao humano: STOP.
- `<HARD-GATE>` Se a spec não tem seção Test Contracts: STOP. Adicione antes de concluir.

### Red Flags
- "O requisito é óbvio, não preciso perguntar"
- "Vou gerar a spec completa de uma vez"
- "Os test contracts podem ser adicionados depois"
- "Vou incluir como implementar para facilitar"

### Edge Cases
- Humano responde com spec pronta (não quer entrevista): skill aceita, mas roda Layer 1 check
- Feature simples (1-2 arquivos): spec informal é aceita, mas precisa ter ✓/✗ mínimos
- Spec mudou durante escrita (humano mudou de ideia): spec_hash atualiza automaticamente

### Outputs
- `.ai/features/NNN/spec.md` — com todas seções + Test Contracts
- SQLite: feature registrada, spec_hash, phase=spec
- Tracking.md exportado

---

## atomic-flow:3-spec-validate

### Objetivo
Rodar 3-layer validation na spec. Gate G1.

### Pré-condições
- **SQLITE:** `phase: spec-validate`
- **SQLITE:** spec.md existe e tem conteúdo
- **HOOK (SessionStart):** Injeta estado + rules: "read-only phase, no edits"

### Comportamento esperado

**Layer 1 (determinístico):**
1. Roda 6 checks automaticamente (script/CLI, não a AI)
2. Resultados escritos na seção Validation da spec.md
3. FAIL → reporta ao humano, não avança

**Layer 2 (humano):**
4. Abre annotation tool (`atomic-flow ui` → `/review/NNN`)
5. Humano lê, anota, salva
6. AI lê anotações do SQLite, apresenta UMA POR VEZ
7. Discute, ajusta spec, marca como resolved
8. Humano declara "Layer 2 aprovado"

**Layer 3 (AI-guiada):**
9. AI roda 8 dimensões adversariais em 2 passos (extração → julgamento)
10. Findings escritos na spec.md seção Validation
11. CRITICAL → volta para Layer 2

**Gate G1:**
12. L1 PASS + L2 aprovado + L3 sem CRITICAL → G1 approved
13. spec_hash final gerado

### Enforcement necessário
| O quê | Mecanismo | Risco se ausente |
|---|---|---|
| Layer 1 roda ANTES de Layer 2 | **SQLITE:** phase_substep = L1→L2→L3 (transition enforced) | AI pula Layer 1 (RISK: spec com problemas estruturais) |
| Layer 1 é determinístico (script, não AI) | **CLI:** `atomic-flow validate-spec NNN` roda os 6 checks | AI simula o check (RISK: false PASS) |
| Layer 2 usa annotation tool (não texto) | **SKILL:** instrução explícita para abrir `atomic-flow ui` | AI faz perguntas guiadas em vez de esperar humano (RISK: Layer 2 vira Layer 3) |
| Layer 2 um ponto por vez | **SKILL:** HARD-GATE | AI agrupa pontos (RISK: decisões contaminadas) |
| Layer 3 adversarial | **SKILL:** anti-sycophancy (mín 3 findings) | AI aprova tudo (RISK: rubber-stamping) |
| Layer 3 cap 10 findings | **SKILL:** regra explícita | AI gera 50 findings (RISK: overcorrection, noise) |
| G1 via CLI | **SQLITE:** `atomic-flow gate approve G1` | AI auto-aprova editando markdown (RISK: gate bypassed) |

### Hard Gates
- `<HARD-GATE>` Layer 1 DEVE rodar via CLI (`atomic-flow validate-spec`), não simulado pela AI.
- `<HARD-GATE>` Layer 2 DEVE usar annotation tool. Se humano não tem browser, cair para formato L{n}: comentário.
- `<HARD-GATE>` G1 DEVE ser aprovado via CLI. Edição manual do tracking.md NÃO aprova o gate.

### Red Flags
- "A spec parece boa, vou pular o Layer 1"
- "Não preciso da annotation tool, vou perguntar diretamente"
- "Zero findings no Layer 3, spec está perfeita"
- "Vou aprovar G1 automaticamente porque os layers passaram"

### Edge Cases
- Annotation tool indisponível (sem browser): fallback para formato textual
- Layer 1 falha repetidamente: após 3 rodadas de correção, escalar ao humano
- Layer 3 encontra 10+ findings: cap em 10, ordenar por severidade

### Outputs
- spec.md atualizado com seção `## Validation` (L1+L2+L3 results)
- SQLite: annotations (Layer 2), gate G1 status
- Tracking.md exportado com G1 status

---

## atomic-flow:4-decompose

### Objetivo
Gerar contracts-first, depois decompor em tasks atômicas.

### Pré-condições
- **SQLITE:** `phase: decompose`, G1 = approved
- **HOOK (SessionStart):** Injeta estado + rules: "tasks and contracts only"

### Comportamento esperado

**Step 1: Contracts-first**
1. Lê spec.md validada
2. Gera interfaces, DTOs, enums como código real
3. Commit no source tree
4. Registra no SQLite (tasks table, type=contract)

**Step 2: Task decomposition**
5. Propõe lista de tasks (5-10 por feature)
6. Cada task: 2-3 arquivos max, 5-15 min, testável isoladamente
7. Humano revisa e ajusta (HUMANO DECOMPÕE)
8. Gera task files individuais (`tasks/T1-name.md`, 40-80 linhas)
9. Gera index.md do SQLite

**Gate G2:**
10. Humano aprova tasks → `atomic-flow gate approve G2`

### Enforcement necessário
| O quê | Mecanismo | Risco se ausente |
|---|---|---|
| Contracts antes de tasks | **SQLITE:** substep contracts→tasks (enforced) | AI pula contracts (RISK: interface inconsistency) |
| Contracts são código SEM lógica | **HOOK PostToolUse:** Check files criados — só interfaces/DTOs/enums | AI implementa lógica nos contracts (RISK: implementação prematura) |
| Apenas contracts no source tree | **HOOK PreToolUse:** Allow Write em source tree ONLY para files marcados `contract` na spec | AI cria arquivos de implementação (RISK: bypass decompose) |
| Tasks têm max 2-3 arquivos | **SKILL:** check automático | AI cria tasks com 8 arquivos (RISK: tasks não-atômicas) |
| Task files 40-80 linhas | **SKILL:** check automático | AI cria task com 5 linhas (BMAD #2003) ou 200 linhas (TDAD) |
| COLLISION CHECK | **SKILL:** duas tasks NÃO produzem o mesmo arquivo | AI cria T2 e T3 ambas editando User.php (RISK: conflito) |
| Humano revisa | **SKILL:** "Proponha a lista. EU vou revisar" | AI auto-aprova (RISK: decomposição não-revisada) |
| G2 via CLI | **SQLITE:** `atomic-flow gate approve G2` | AI avança sem G2 (RISK: tasks não-aprovadas) |

### Hard Gates
- `<HARD-GATE>` Se contract file contém lógica (function body com mais que `throw new Error('Not implemented')`): STOP.
- `<HARD-GATE>` Se task tem mais de 3 arquivos: SPLIT antes de continuar.
- `<HARD-GATE>` Se duas tasks declaram o mesmo arquivo: RESOLVE colisão antes de continuar.

### Red Flags
- "Não preciso de contracts, vou direto às tasks"
- "São só 3 tasks, não preciso de task files"
- "Vou aceitar a decomposição da AI sem revisar"
- "Essa task é grande mas vou manter assim"

### Edge Cases
- Feature simples (2-3 arquivos): minimum 2 tasks (ainda precisa de contracts)
- Humano rejeita decomposição 3x: escalar — talvez spec esteja vaga
- Contract conflita com código existente: resolver antes de decompor

### Outputs
- Source tree: contract files commitados
- `.ai/features/NNN/tasks/T1-name.md` por task
- `.ai/features/NNN/tasks/index.md` gerado do SQLite
- SQLite: tasks registradas com deps, files, status=pending
- Tracking.md exportado com G2 status

---

## atomic-flow:5-implement

### Objetivo
Executar UMA task em sessão limpa com TDD, micro-commits, e learning loop.

### Pré-condições
- **SQLITE:** `phase: implement`, G2 = approved
- **SQLITE:** task atual com status=pending ou in_progress
- **HOOK (SessionStart):** Injeta: task atual, files, rules de implement, learnings.md

### Comportamento esperado

**Setup:**
1. /clear (sessão limpa)
2. Lê task file (T{N}-name.md) — contexto self-contained
3. Lê learnings.md (se existe) — learnings de tasks anteriores
4. git commit snapshot

**TDD:**
5. Escreve TESTE primeiro (Red)
6. Implementa código mínimo para passar (Green)
7. Roda test suite completo
8. git diff --stat (verificar escopo)
9. git commit (micro-commit)

**Verificação:**
10. Full test suite passa
11. Lint/static analysis sem erros novos
12. Só arquivos declarados na task foram tocados

**Learning loop:**
13. AAR micro-retro (2-3 min): o que planejou? o que aconteceu? o que surpreendeu?
14. Append ao learnings.md + SQLite
15. Scan pending tasks com deps → sugerir revisões
16. Auto-update mecânico / flag HUMAN-GATE para julgamento

**Recovery (se falha):**
17. Strike 1: retry com contexto ajustado
18. Strike 2: rollback + re-prompt
19. Strike 3: subagent de investigação
20. 3 strikes: task=failed, escalar ao humano

### Enforcement necessário
| O quê | Mecanismo | Risco se ausente |
|---|---|---|
| /clear antes de cada task | **SKILL:** instrução explícita (não enforceable via hook) | AI implementa 3 tasks na mesma sessão (RISK: context rot) |
| Teste ANTES de código | **HOOK PreToolUse:** Se Write em src/ e nenhum Write em tests/ nesta sessão → WARN | AI escreve código primeiro (RISK: testes tautológicos) |
| File scoping 3-tier | **HOOK PreToolUse:** task scope=allow, feature=warn, outside=block | AI edita arquivos fora do scope (RISK: silent feature dropout) |
| Micro-commit antes de cada prompt | **SKILL:** instrução explícita (não enforceable via hook) | AI faz 10 edits sem commit (RISK: rollback impossível) |
| git diff --stat após cada mudança | **SKILL:** instrução explícita | AI ignora (RISK: arquivos inesperados) |
| NÃO enfraquecer testes | **HOOK PostToolUse:** Se Edit em tests/ e remove assertion → WARN | AI deleta/enfraquece testes que falham (RISK: testes tautológicos) |
| Recovery 4 níveis | **SQLITE:** strikes counter incrementa | AI tenta 10x sem recovery (RISK: loop infinito) |
| Learning loop | **SKILL:** instrução após task done | AI pula learning (RISK: tasks pendentes ficam stale) |
| Learnings mecânicos auto-update | **CLI:** `atomic-flow learn` processa e auto-aplica | AI esquece de propagar (RISK: task T3 usa interface antiga) |
| Task status update | **CLI:** `atomic-flow task done T2` → SQLite | AI só edita markdown (RISK: SQLite out of sync) |

### Hard Gates
- `<HARD-GATE>` Se está prestes a criar código sem teste: STOP. Escreva o teste primeiro.
- `<HARD-GATE>` Se git diff --stat mostra arquivo não declarado na task: STOP. Reverte ou atualiza task.
- `<HARD-GATE>` Se strike count >= 3: STOP. Escalar ao humano.
- `<HARD-GATE>` Se está prestes a editar um teste para enfraquecer assertion: STOP. Mude a implementação, não o teste.

### Red Flags
- "Vou escrever o código e o teste juntos, é mais rápido"
- "Esse arquivo extra é pequeno, posso editar"
- "O teste está falhando, vou ajustar a assertion"
- "Não preciso de commit agora, vou commitar no final"
- "A learning loop é desnecessária para essa task"
- "Vou implementar T3, T4 e T5 nesta mesma sessão"

### Edge Cases
- Task revela-se maior que estimada: mid-feature escalation (commit + split + /clear)
- Teste existente quebra por mudança legítima: SKILL instrui fix (não skip)
- Dependency não resolvida: task blocked, notificar humano
- 2 ciclos de learning com 0 revisões: skip futuras

### Outputs
- Source tree: código + testes commitados
- SQLite: task status=done, commit hash, strikes, tests_passed
- `.ai/features/NNN/tasks/learnings.md` atualizado
- Pending tasks possivelmente revisadas
- Tracking.md exportado

---

## atomic-flow:6-review

### Objetivo
Revisar a feature completa após todas tasks implementadas. Gate G3.

### Pré-condições
- **SQLITE:** `phase: review`, todas tasks=done
- **HOOK (SessionStart):** Injeta estado + rules: "review only, no new features"

### Comportamento esperado
1. Review de segurança (OWASP top 10)
2. Review de edge cases (null, empty, unicode, concurrency)
3. Review de performance (N+1, indexes, memory)
4. Review de consistência (padrões, naming, imports)
5. Review de completude (spec vs implementação)
6. Convergence tracking: CRITICAL+HIGH deve diminuir por round

**Opcional para features críticas:**
7. Dual subagent review (segurança+performance vs lógica+completude)

### Enforcement necessário
| O quê | Mecanismo | Risco se ausente |
|---|---|---|
| Não criar código novo | **HOOK PreToolUse:** Write em novos arquivos → exit 2 (só edits de fix permitidos) | AI adiciona features durante review (RISK: scope creep) |
| Convergence rule | **SQLITE:** track CRITICAL+HIGH count por round | AI faz 10 rounds sem melhorar (RISK: loop infinito + token waste) |
| Max 3 rounds | **SKILL + SQLITE:** round counter | AI continua indefinidamente (RISK: diminishing returns) |
| Completude contra spec | **SKILL:** instrução para ler spec.md e comparar | AI revisa código sem referência à spec (RISK: spec drift não detectado) |
| G3 via CLI | **SQLITE:** `atomic-flow gate approve G3` | AI auto-aprova (RISK: review bypassed) |

### Hard Gates
- `<HARD-GATE>` Se CRITICAL+HIGH count AUMENTOU neste round: STOP. Rollback, re-prompt do zero.
- `<HARD-GATE>` Se 3 rounds sem convergência: STOP. Aceitar com ressalvas ou rollback feature.
- `<HARD-GATE>` Se não leu spec.md antes de revisar: STOP. Review sem spec = review cego.

### Red Flags
- "O código parece bom, não preciso verificar contra a spec"
- "Vou adicionar este improvement enquanto reviso"
- "O issue é MEDIUM, não preciso corrigir"
- "Vou fazer mais um round de review, talvez pegue algo"

### Edge Cases
- Zero issues: válido mas raro. Skill deve verificar anti-sycophancy (procurou de verdade?)
- Dual subagent: ambos flaggam o mesmo issue → provavelmente real. Só um flagga → investigar
- Fix introduz novo bug: novo round, convergence check

### Outputs
- SQLite: review findings, convergence data, round count
- spec.md: seção Review (se não existir, adicionar)
- Tracking.md: exportado com G3 status, review summary

---

## atomic-flow:7-ship

### Objetivo
Reconcile (tracking vs filesystem), commit final, PR.

### Pré-condições
- **SQLITE:** `phase: ship`, G3 = approved
- **HOOK (SessionStart):** Injeta estado + rules: "ship only, no new code"

### Comportamento esperado
1. Reconcile check:
   - Gates: G1, G2, G3 todos approved?
   - Tasks: todas done?
   - Drift: spec_hash match?
   - Orphans: arquivos no diff não declarados em tasks?
   - Regressions: full test suite passa?
2. Preencher seção Reconcile no tracking.md
3. Commit final (conventional commits, corpo referencia spec)
4. Criar PR (se em branch)
5. Phase → done

### Enforcement necessário
| O quê | Mecanismo | Risco se ausente |
|---|---|---|
| Reconcile ANTES de commit | **SQLITE:** reconcile_status must be OK before phase→done | AI commita sem reconcile (RISK: ship com drift/orphans) |
| Full test suite | **HOOK PreToolUse:** Block git commit se tests não passaram nesta sessão | AI commita sem testar (RISK: regression em prod) |
| Reconcile é determinístico | **CLI:** `atomic-flow reconcile NNN` roda checks | AI simula reconcile (RISK: false OK) |
| Não criar código novo | **HOOK PreToolUse:** Write em src/ → exit 2 | AI faz "last minute fix" (RISK: untested code shipped) |

### Hard Gates
- `<HARD-GATE>` Se reconcile status != OK: STOP. Resolver antes de commit.
- `<HARD-GATE>` Se full test suite não passou NESTA sessão: STOP. Rode antes de commit.

### Red Flags
- "O reconcile é só formalidade, vou pular"
- "Vou fazer um quick fix antes de commitar"
- "Os testes passaram na sessão anterior, não preciso rodar de novo"

### Outputs
- Tracking.md: phase=done, reconcile results
- Git: commit final + PR (se branch)
- SQLite: feature status=done

---

## atomic-flow:status (utilitário)

### Objetivo
Reportar status determinístico lido do SQLite.

### Enforcement
- **SQLITE:** Lê diretamente, NUNCA gera da memória
- **CLI:** `atomic-flow status [feature]`
- **Export:** Regenera tracking.md do SQLite

### Hard Gate
- `<HARD-GATE>` Se está prestes a reportar status sem ler do SQLite/arquivo: STOP.

---

## atomic-flow:gate (utilitário)

### Objetivo
Aprovar/rejeitar gates humanos (G1, G2, G3).

### Enforcement
- **SQLITE:** Gate update APENAS via CLI (`atomic-flow gate approve|reject`)
- **SQLITE trigger:** Verifica preconditions (G1 requer phase=spec-validate, etc.)
- AI NUNCA pode aprovar gate — só o humano via CLI

### Hard Gate
- `<HARD-GATE>` Se a AI está prestes a declarar um gate como aprovado sem o humano ter executado o CLI: STOP.
