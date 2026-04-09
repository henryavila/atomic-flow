# Spec: Atomic Flow MVP

Data: 2026-04-06

## Objetivo

Criar um sistema de desenvolvimento AI-assisted com 7 fases, que garante disciplina via enforcement (SQLite state machine + MCP server + hooks) e orienta via skills instaláveis, distribuído como npm package (`@henryavila/atomic-flow`).

O projeto tem 3 camadas: método (skills que ensinam), enforcer (MCP server + SQLite + hooks que garantem), distribuição (CLI que instala). O usuário interage via skills ou conversa natural — nunca precisa sair do Claude Code durante o workflow.

---

## Requisitos Funcionais

### Distribuição

- **RF01:** `npx @henryavila/atomic-flow install` instala skills, inicializa SQLite, configura hooks e cria estrutura de diretórios
  - ✓ projeto limpo → 10 skills em `.claude/skills/atomic-flow/`, SQLite em `.ai/atomic-flow.db`, hooks em `.claude/settings.json`, `.ai/features/` criado
  - ✓ orquestra RF02-RF04b — qualquer sub-step falhando aborta o install inteiro (rollback parcial)
  - ✓ adiciona ao `.gitignore`: `.ai/atomic-flow.db`, `.ai/atomic-flow.db.lock` (SQLite e lock NÃO versionados; `.ai/features/` SIM versionado)
  - ✗ Node < 18 → erro "Node.js >= 18 required", exit 1
  - ✗ diretório não é repositório git → erro "Git repository required", exit 1

- **RF02:** Skills renderizadas com template vars e instaladas no namespace `atomic-flow:`
  - ✓ skill `1-research.md` renderizada → `.claude/skills/atomic-flow/1-research/SKILL.md` com `{{BASH_TOOL}}` substituído por `Bash`
  - ✗ template var não reconhecida no output → FAIL com lista de vars não substituídas, skill NÃO instalada

- **RF03:** `npx @henryavila/atomic-flow uninstall` remove skills, hooks, SQLite, `.ai/features/`, manifest e MCP entry
  - ✓ remove: skills, hooks do `.claude/settings.json`, SQLite, `.ai/features/`, `.atomic-flow/manifest.json`, entry do MCP server em `.mcp.json`, worktrees ativos (ExitWorktree + delete branches)
  - ✓ `docs/features/` e `docs/research/` NÃO são removidos — são patrimônio do projeto, não do tool
  - ✓ `.mcp.json` não é deletado inteiro — apenas a entry `atomic-flow` é removida (pode ter outros servers)
  - ✓ entradas de `.gitignore` NÃO são removidas (inofensivo) — output menciona "remova manualmente se desejar"
  - ✗ features com tracking ativo (phase != done) → avisa e pede confirmação

- **RF04:** Manifest em `.atomic-flow/manifest.json` rastreia arquivos instalados com hashes (3-hash: installed, current, package)
  - ✓ reinstalação, arquivo não modificado → sobrescreve silenciosamente
  - ✓ reinstalação, arquivo modificado localmente → SKIP com WARN listando arquivos mantidos + informa `--force`
  - ✓ `--force` → sobrescreve tudo independente de modificação local
  - ✗ arquivo modificado + sem `--force` → NÃO sobrescreve, WARN visível com instrução de `--force`

- **RF04b:** `atomic-flow install` configura MCP server em `.mcp.json` para expor tools nativos no Claude Code
  - ✓ `.mcp.json` criado com server `atomic-flow` apontando para `node_modules/@henryavila/atomic-flow/src/mcp-server.js`
  - ✓ MCP tools disponíveis: gate_approve, preflight, status, new_feature, cancel_feature, validate_spec, task_done, learn, reconcile, open_ui (user-facing) + transition (interno, chamado por skills)
  - ✓ tools lazy-loaded (só carregam schema quando invocados — ~95% economia de contexto)
  - ✓ `transition` é interno — skills chamam ao iniciar; user nunca chama diretamente
  - ✗ MCP server falha ao iniciar → erro com diagnóstico (SQLite ausente? Node versão?)

- **RF04c:** Fases são controladas pelo humano — ativadas por skill explícita OU conversa natural, sempre com validação humana
  - ✓ primário: `/atomic-flow:1-research "autenticação"` → skill ativada diretamente pelo user
  - ✓ secundário: "quero implementar autenticação" → AI detecta intent, invoca skill internamente
  - ✓ AI pode SUGERIR iniciar nova fase — humano SEMPRE confirma antes da transição
  - ✓ ao sugerir, AI exibe status da fase atual via MCP `status` (RF22) — dados já no SQLite, zero geração on-the-fly
  - ✓ ambos os caminhos resultam no mesmo fluxo: skill chama MCP `transition` internamente → SQLite valida → fase inicia
  - ✗ AI ativa fase sem feature existente → MCP cria feature automaticamente (RF05), informa ao user ("Feature 001-auth criada, iniciando fase ① RESEARCH"), depois inicia na fase research — nunca pula direto para a fase mencionada pelo user
  - ✗ AI transiciona sem confirmação humana → violação do método

- **RF04d:** Cada feature roda em git worktree isolado — worktree gerenciado pelos tools nativos do Claude Code
  - ✓ MCP `new_feature` registra feature no SQLite (ID, branch `atomic-flow/NNN-name`) e retorna branch name
  - ✓ skill instrui AI a chamar `EnterWorktree` (nativo Claude Code) → Claude Code cria worktree e entra (path gerenciado pelo Claude)
  - ✓ após entrar no worktree, skill chama MCP para criar `docs/features/NNN/` (spec.md, decisions.md, research-index.md) + `.ai/features/NNN/` (tasks/, tracking.md)
  - ✓ SQLite NÃO é copiado para o worktree — acessa o DB único do main repo via caminho absoluto (`git worktree list --porcelain` → resolve main worktree → `.ai/atomic-flow.db`)
  - ✓ advisory file lock (`.ai/atomic-flow.db.lock`) serializa writes entre sessões concorrentes
  - ✓ ship (Fase 7): merge branch → `ExitWorktree` (nativo) → Claude Code faz cleanup
  - ✗ worktree já existe para a feature → entra no existente, não cria novo
  - ✗ merge conflict no ship → reporta ao humano para resolver manualmente

### Feature Lifecycle

- **RF05:** Criação de feature via skill `/atomic-flow:new` — ID sequencial, worktree isolado, estrutura em 2 locais
  - ✓ artefatos permanentes (patrimônio do projeto) em `docs/features/NNN-{name}/`: spec.md, decisions.md, research-index.md
  - ✓ artefatos efêmeros (ferramental de trabalho) em `.ai/features/NNN-{name}/`: tasks/, tracking.md
  - ✓ primeira feature → worktree criado, ambos diretórios criados com placeholders no formato final
  - ✓ arquivos criados com dados já disponíveis (ID, nome, data, fase=research) — seções obrigatórias presentes como placeholders, preenchidos progressivamente pelo método a cada fase
  - ✓ terceira feature → `003-{name}` (auto-incremento lido do SQLite do repo principal)
  - ✓ chamado internamente pela skill ou por conversa natural — usuário nunca roda CLI para isso
  - ✗ nome com caracteres inválidos → erro com sugestão de slug válido

- **RF05b:** Fase RESEARCH produz pesquisa embasada salva em documentos granulares — patrimônio do projeto, não da feature
  - ✓ research files salvos em `docs/research/{NNN-slug}/{topic}.md` (subpasta por feature, project-level, sobrevive ao lifecycle)
  - ✓ research compartilhável entre features em `docs/research/shared/{topic}.md`
  - ✓ cada arquivo = UM tópico (40-800 linhas), com: Fontes citadas, Análise (tabelas comparativas), Síntese (recomendação acionável), Decisões Derivadas
  - ✓ `docs/features/NNN/research-index.md` aponta para `docs/research/{NNN-slug}/` + quaisquer `shared/` relevantes (índice local + resumo executivo)
  - ✓ escopo do research: codebase (padrões, convenções, dependências) + mercado (como bons players resolvem) + best practices (padrões consolidados) + comportamento humano (UX, se aplicável) + evidência (papers, estudos)
  - ✓ skills instruem AI a ler `research-index.md` antes de trabalhar e consultar research files granulares quando tocar em tópico pesquisado
  - ✓ research files são read-only após G1 (alteração = nova pesquisa = reabrir phase research)
  - ✗ research sem fontes externas (só codebase) → G1 preflight flag: "Sem referências externas"
  - ✗ research-index.md ausente ou vazio → G1 preflight FAIL

- **RF05c:** Decision journal (`docs/features/NNN/decisions.md`) registra a jornada de decisão durante a spec — obrigatório para TODA feature
  - ✓ cada problema descoberto durante a spec é registrado com: Problema, Solução, Como Aplicar
  - ✓ formato: `## P{N}: {título}` + Problema + Solução + How to apply (mesmo para features pequenas — proporcional)
  - ✓ preenchido progressivamente pela skill `2-spec` durante a entrevista (não no final)
  - ✓ spec.md referencia decisions.md: "Design decisions journal: `decisions.md`"
  - ✓ decisions.md é versionado no git (dentro de `docs/features/NNN/`) — sobrevive a clone, fork, handoff
  - ✓ implementador consulta decisions.md quando questiona uma decisão da spec — encontra o POR QUÊ
  - ✗ decisions.md ausente → G2 (SPEC → VALIDATE) preflight FAIL
  - ✗ decisions.md vazio (0 entradas) → G2 preflight WARN: "Nenhum problema descoberto — confirme que a spec é realmente trivial"

- **RF05d:** Cancelamento de feature via MCP `cancel_feature` — requer motivo, limpa artefatos efêmeros
  - ✓ MCP `cancel_feature(id, reason)` marca feature como `cancelled` no SQLite com motivo e timestamp
  - ✓ motivo registrado em `docs/features/NNN/decisions.md` como última entrada: "## Cancelamento: {reason}"
  - ✓ cleanup: ExitWorktree + deleta branch `atomic-flow/NNN-name` + deleta `.ai/features/NNN/`
  - ✓ `docs/features/NNN/` preservado (spec, decisions, research-index sobrevivem como registro)
  - ✓ `docs/research/{NNN-slug}/` preservado (patrimônio do projeto)
  - ✓ dashboard (RF09): feature cancelada com visual distinto (opacidade + badge "cancelled", diferente de done)
  - ✗ cancel sem motivo → MCP rejeita: "Motivo obrigatório para cancelamento"
  - ✗ cancel de feature já done → MCP rejeita: "Feature já concluída"

- **RF06:** Transições de fase são enforçadas pelo SQLite — TODAS as transições forward requerem gate humano aprovado
  - ✓ user invoca skill → skill chama MCP `transition` → SQLite trigger valida fase + gate → transição aceita ou rejeitada
  - ✓ research → spec com G1 approved → aceito
  - ✓ validate → decompose com G3 approved → aceito
  - ✓ transições backward (rework loops) NÃO requerem gate — a decisão humana de voltar já é o gate
  - ✗ research → spec com G1 pending → RAISE(ABORT), "Gate G1 pendente"
  - ✗ spec → implement (pula validate+decompose) → RAISE(ABORT), "Transição inválida"
  - ✗ decompose → implement com G4 pending → RAISE(ABORT), "Gate G4 pendente"

- **RF07:** 7 gates humanos (G1-G7) em todas as transições forward — NUNCA automáticos
  - ✓ humano executa `atomic-flow gate approve G{N}` → gate atualizado no SQLite, transição habilitada
  - ✓ gate approve executa commit automático ANTES de registrar aprovação — artefatos da fase são commitados com mensagem descritiva (ex: "gate(G2): spec + decisions approved")
  - ✓ commit inclui todos artefatos produzidos na fase que está sendo aprovada:
    - G1: `docs/research/{NNN-slug}/`, `docs/features/NNN/research-index.md`
    - G2: `docs/features/NNN/spec.md`, `docs/features/NNN/decisions.md`
    - G3: `docs/features/NNN/spec.md` (correções da validação)
    - G4: `.ai/features/NNN/tasks/`, source tree (contracts)
    - G5: source tree (implementação), `.ai/features/NNN/tracking.md`
    - G6: source tree (fixes do review)
    - G7: reconcile (merge commit é o próprio commit do ship)
  - ✓ transições backward NÃO têm gate — decisão humana de voltar já é o gate
  - ✓ em gates com documentação para validar (G1: research, G2: spec, G3: spec validada, G4: tasks), skill abre mdprobe automaticamente para o humano revisar antes de aprovar
  - ✗ AI tenta aprovar gate → SQLite não reflete, transição bloqueada
  - ✗ gate rejeitado → transição NÃO ocorre, fase fica na atual, motivo registrado no SQLite
  - ✗ gate approve com arquivos unstaged relevantes → WARN: "N arquivos não commitados", commit executa mesmo assim (captura tudo)

  **G1 (RESEARCH → SPEC):** Compilação do research salva em arquivo estruturado, consultável pela AI com poucos tokens
  **G2 (SPEC → VALIDATE):** Spec escrita e completa, pronta para validação formal
  **G3 (VALIDATE → DECOMPOSE):** 3 layers passaram, humano LEU a spec inteira e está satisfeito
  **G4 (DECOMPOSE → IMPLEMENT):** Tasks atômicas, preflight OK, contratos commitados
  **G5 (IMPLEMENT → REVIEW):** Todas tasks done, testes passam, implementação completa
  **G6 (REVIEW → SHIP):** Review convergiu, zero CRITICAL, código pronto para produção
  **G7 (SHIP → DONE):** Reconcile OK, merge OK, feature concluída

- **RF07b:** `atomic-flow preflight G{N}` roda checks automáticos antes de cada gate e apresenta flags
  - ✓ check universal em TODOS os gates: status da fase atualizado no SQLite
  - ✓ G1 preflight: arquivo de research existe? Tem seções obrigatórias? Fontes externas documentadas?
  - ✓ G2 preflight: spec.md existe? Seções obrigatórias presentes? decisions.md existe e tem entradas?
  - ✓ G3 preflight: Layer 1 (6 checks estruturais) + Layer 3 (8 dimensões AI) → lista de flags
  - ✓ G4 preflight: contract-RF cross-reference (AI semântico) + task atomicidade (>3 files?) + colisão de arquivos entre tasks + dependências cíclicas + spec delta desde G3 + TCs faltando para novos contratos
  - ✓ G5 preflight: SQLite todas tasks done? Test suite green? Spec hash drift?
  - ✓ G6 preflight: convergence check (CRITICAL+HIGH diminuindo?) + spec completude (todos RF implementados?) + drift detection (spec_hash) + orphan detection (files não declarados)
  - ✓ G7 preflight: reconcile completo (gates OK, tasks OK, orphans, drift, regression)
  - ✓ resultado mostrado na UI `/feature/:id` com flags acionáveis
  - ✓ checks determinísticos = 100% confiável; checks AI = pré-processado, humano valida
  - ✗ zero flags → approve rápido com confiança
  - ✗ flags pendentes → `atomic-flow gate approve` mostra warning "N flags unresolved"

### Spec & Validation

- **RF08:** `atomic-flow ui` abre Local UI no browser — server para dashboard e detalhe de feature, review via mdprobe
  - ✓ abre localhost em porta livre com 2 páginas: `/dashboard`, `/feature/:id`
  - ✓ `/feature/:id` tem link "Review Spec" que abre mdprobe (via library mode `createHandler()`)
  - ✓ mdprobe montado em `/review/:id` no mesmo server (um server, uma porta)
  - ✓ dados lidos do SQLite via sql.js — sempre resolve DB do main repo via `git worktree list --porcelain` (funciona do main repo OU de dentro de um worktree)
  - ✓ dashboard mostra TODAS as features (cross-feature), independente de onde o comando foi executado
  - ✗ porta em uso → tenta próxima porta
  - ✗ SQLite ausente → erro com instrução de rodar install primeiro

- **RF09:** Página `/dashboard` mostra overview de todas as features com progresso visual (mockup: `docs/specs/mockups/dashboard.html`)
  - ✓ stats cards no topo: total features, in progress, tasks done (barra), strike rate (total strikes / total tasks done por feature — indica qualidade da decomposição; 0 = perfeito)
  - ✓ feature cards: cada feature com pipeline de 7 fases + 7 gates inline, task progress bar, learnings count, strikes, last update
  - ✓ estados visuais: done (opacity reduzida), active (fase pulsando), drift (borda vermelha + badge), gate pending (diamond amber pulsando)
  - ✓ filtro por fase/status
  - ✓ cross-feature queries (features in_progress, taxa de strikes, features com drift)
  - ✗ zero features → mensagem "Nenhuma feature. Crie com atomic-flow new <name>"

- **RF10:** Página `/feature/:id` mostra detalhe de uma feature (mockup: `docs/specs/mockups/feature-detail.html`)
  - ✓ hero: pipeline de 7 fases + 7 gates com datas de conclusão, fase ativa pulsando
  - ✓ tabs: Tasks / Gates / Learnings / Preflight (alterna conteúdo principal)
  - ✓ tasks table: cada task com ID, nome, arquivos, deps, strikes, commit hash; task atual destacada; barra de progresso
  - ✓ sidebar: feature info (ID, branch, created, phase, spec hash status)
  - ✓ sidebar: todos 7 gates com status, data, "human" badge
  - ✓ sidebar: últimos learnings categorizados (decision, constraint, pattern)
  - ✓ sidebar: actions (Review Spec, Run Preflight, Approve Gate, Export Tracking)
  - ✗ feature ID não existe → erro 404 com lista de features válidas

- **RF11:** Página `/review/:id` é powered by `@henryavila/mdprobe` (library mode) para revisão humana de spec (Layer 2)
  - ✓ mdprobe montado via `createHandler()` com `resolveFile` apontando para `docs/features/NNN/spec.md`
  - ✓ `onComplete` callback notifica atomic-flow quando revisão termina
  - ✓ anotações persistem em YAML sidecar (`spec.annotations.yaml`) ao lado do spec.md
  - ✓ atomic-flow lê o YAML sidecar para Layer 2 discussion (um item por vez)
  - ✓ re-abrir com anotações existentes (highlights, re-anchoring automático)
  - ✗ spec file não existe → erro com path
  - ✗ mdprobe não instalado → erro com instrução de install

- **RF12:** Layer 1 (gate determinístico) roda 6 checks automaticamente na spec via CLI (`atomic-flow validate-spec`)
  - ✓ C1 Critérios por requisito: todo RF tem ≥1 ✓ e ≥1 ✗? Todo RN tem ≥1 ✓? (ex: RF03 sem ✗ → FAIL)
  - ✓ C2 Linguagem vaga: weak words em critérios ✓/✗? (should, might, typically, usually, appropriate, fast, easy, etc. → FAIL em critério, WARN em requisito)
  - ✓ C3 Implementation-free: código ou verbos de implementação em RF/RN/EC? (ex: `fetchData()` → FAIL, "implement" → FAIL, "Redis" → WARN humano decide)
  - ✓ C4 Completude estrutural: 7 seções obrigatórias? (Objetivo, RF, RN, EC, Arquivos, Test Contracts, Fora de Escopo)
  - ✓ C5 Test contracts: todo RF/RN tem ≥1 TC? TC sem linguagem de framework? (ex: RF05 sem TC → FAIL, TC com "mock" → FAIL)
  - ✓ C6 Marcadores pendentes: [TBD], [TODO], [?], [DECIDIR] → FAIL
  - ✗ ≥1 FAIL → spec volta para revisão, não avança

- **RF13:** Layer 3 (review AI-guiada) roda 8 dimensões adversariais na spec, em 2 passos (extração → julgamento)
  - ✓ D1 Consistência interna: RFs se contradizem? (ex: RF01 "validar inputs" vs RF05 "aceitar raw")
  - ✓ D2 Completude: cenários implícitos ausentes? (ex: login sem "conta inexistente")
  - ✓ D3 Qualidade dos critérios: ✓/✗ são testáveis? (ex: "funciona bem" → CRITICAL)
  - ✓ D4 Atomicidade: RF com múltiplos comportamentos? (ex: "valida, salva, e envia email" = 3 RFs)
  - ✓ D5 Rastreabilidade: entidade mencionada sem definição cross-seção? (ex: "permissão de admin" sem RN)
  - ✓ D6 Ambiguidade contextual: pronomes, condições incompletas? (ex: "seus dados" — quais?)
  - ✓ D7 Assumptions surfacing: premissas implícitas? (ex: assume single-tenant sem declarar)
  - ✓ D8 Qualidade dos TCs: tautologia, cobertura de partições, boundary? (ex: 3 TCs business, 0 error)
  - ✓ findings salvos na seção Validation da spec.md com severidade (CRITICAL/HIGH/MEDIUM/LOW)
  - ✓ anti-overcorrection: cap 10 findings, evidência obrigatória, mínimo 3 findings
  - ✗ CRITICAL encontrado → bloqueia G3, volta para Layer 2
  - ✗ AI gera 0 findings → FAIL (rubber-stamping, anti-sycophancy violado)

### Decompose & Tasks

- **RF14:** Contracts-first como primeiro step do decompose — interfaces/DTOs commitados antes de tasks
  - ✓ contracts gerados da spec validada → commitados no source tree
  - ✓ registrados no SQLite (tabela tasks com type=contract)
  - ✗ contract sem interface pública → WARN

- **RF15:** Tasks são arquivos individuais (~40-80 linhas) com contexto self-contained
  - ✓ cada task em `.ai/features/NNN/tasks/T1-name.md` com YAML frontmatter (id, files, deps, status)
  - ✓ status compacto de todas tasks exportado em tracking.md (RF22) — não em arquivo separado (princípio "one file = all truth", P6)
  - ✗ task sem Test Contracts → FAIL no Layer 1 da task

### Implement & Learning

- **RF16:** SessionStart hook injeta estado da feature ativa do SQLite no contexto do Claude
  - ✓ "feature ativa" = feature associada ao worktree corrente (resolvido via branch name do worktree → SQLite lookup). Sessão no main repo (sem worktree) = nenhuma feature ativa
  - ✓ sessão nova com feature ativa → mostra: phase, sub-estado (se aplicável), task atual, gates, 3 rules da fase
  - ✓ Fase ② SPEC distingue sub-estados: `creation` (primeira vez) vs `refinement` (retorno após validate/feedback)
  - ✓ output sempre explicita fase atual — AI NUNCA assume que humano lembra contexto (RN08)
  - ✓ 3 rules por fase, injetadas no contexto:
    - RESEARCH: (1) Descubra e documente, não decida nem implemente (2) Codebase primeiro, externo depois, training data nunca (3) Salve granular, consuma rápido
    - SPEC: (1) Defina O QUE e POR QUÊ, nunca COMO (2) Cada decisão tem uma jornada — registre em decisions.md (3) Sessão nova após spec aprovada
    - VALIDATE: (1) 3 layers em ordem, sem atalho (2) Layer 2: humano lidera, AI facilita — um item por vez (3) Layer 3: assuma que a spec tem problemas — encontre-os
    - DECOMPOSE: (1) AI analisa e propõe, humano julga e aprova (2) Contracts primeiro, implementação depois (3) Cada task se basta (40-80 linhas, self-contained)
    - IMPLEMENT: (1) Teste define o comportamento, código existe para satisfazê-lo — RED antes de GREEN (2) Uma task, uma sessão limpa, um micro-commit por prompt (3) Falhou? Escale, não loop — R1→R2→R3→R4
    - REVIEW: (1) Revise EXECUÇÃO contra ESPECIFICAÇÃO, não processo (2) Convergência obrigatória — CRITICAL+HIGH deve diminuir cada round, max 3 rounds (3) Zero CRITICAL para avançar, sem exceção
    - SHIP: (1) Reconcile antes de merge — tracking vs filesystem (2) Test suite completa, não subset (3) Nenhuma mudança de código nesta fase — fix = fase anterior
  - ✗ nenhuma feature ativa → mensagem informativa, sem erro

- **RF17:** PreToolUse hook enforça file scoping por fase, lendo phase + task do SQLite
  - ✓ leitura permitida em qualquer arquivo em TODAS as fases
  - ✓ escrita varia por fase:
    - RESEARCH: apenas `docs/research/`, `research-index.md`
    - SPEC: apenas `docs/features/NNN/spec.md`, `docs/features/NNN/decisions.md`
    - VALIDATE: apenas `docs/features/NNN/spec.md` (correções)
    - DECOMPOSE: `.ai/features/NNN/tasks/`, source tree (contracts only)
    - IMPLEMENT: 3-tier (task scope=allow, feature scope=warn, outside=block)
    - REVIEW: source tree (fixes de issues encontradas)
    - SHIP: nenhuma escrita (fix = voltar para fase anterior)
  - ✗ escrita fora do escopo da fase → HARD BLOCK (exit 2)

- **RF18:** Learning loop após cada task: AAR micro-retro → revise pending tasks
  - ✓ após task done → append learnings ao SQLite (decisions, interface changes, constraints, patterns)
  - ✓ scan de pending tasks com deps na task concluída → sugerir revisões
  - ✓ revisões mecânicas (paths, signatures) → auto-update task file
  - ✗ revisões de julgamento (escopo, arch) → flag HUMAN-GATE, não aplica automaticamente

- **RF19:** Recovery em 4 níveis progressivos quando task falha — cada falha incrementa strike counter da task no SQLite (tabela tasks, coluna strikes)
  - ✓ strike = cada tentativa falhada de completar uma task, independente do R-level atingido (+1 por falha)
  - ✓ R1 Retry com contexto: reescrever prompt com mais contexto (stacktrace, arquivo, padrão existente) — strike 1, geralmente falta de contexto
  - ✓ R2 Rollback ao checkpoint: `git checkout .` → re-prompt com abordagem diferente — strike 2, abordagem errada
  - ✓ R3 Subagent de investigação: spawnar subagent focado no problema, voltar com diagnóstico — strike 3, problema sistêmico ou área desconhecida
  - ✓ task resolvida em R1 → task = done com strikes = 1 (strike registrado, sem escalação)
  - ✗ R4 Escalar ao humano: 3 strikes → task status=failed no SQLite, documentar o que tentou e falhou, humano decide

### Review & Ship

- **RF20:** Convergence rule no review — CRITICAL+HIGH deve diminuir a cada round
  - ✓ round 1: 3 CRITICAL → round 2: 1 CRITICAL → convergindo
  - ✗ round 2: 4 CRITICAL (aumentou) → rollback, re-prompt do zero
  - ✗ 3 rounds sem convergência → aceitar com ressalvas ou rollback feature

- **RF21:** Reconcile verifica integridade feature vs filesystem antes de ship
  - ✓ todos gates approved + todas tasks done + spec_hash match + zero orphans → OK
  - ✓ após reconcile OK + merge: `.ai/features/NNN/` é deletado (tasks, tracking, annotations — artefatos efêmeros)
  - ✓ `docs/features/NNN/` é preservado (spec, decisions, research-index — patrimônio permanente)
  - ✓ artefatos efêmeros permanecem no histórico de commits da branch — recuperáveis se branch não deletada
  - ✗ spec_hash mismatch → DRIFT (spec mudou após decompose)
  - ✗ arquivo declarado em task não existe no repo → DRIFT
  - ✗ arquivo no git diff não declarado em nenhuma task → ORPHAN

### Utilitários

- **RF22:** `atomic-flow status` lê do SQLite e exporta tracking.md atualizado
  - ✓ mostra: feature, phase (com sub-estado se aplicável, ex: "spec:refinement"), gates, tasks (status table), learnings count
  - ✓ exporta tracking.md para `.ai/features/NNN/tracking.md` (git-trackable)
  - ✗ SQLite ausente → regenera do tracking.md existente

---

## Regras de Negócio

- **RN01:** Skills usam template vars (`{{BASH_TOOL}}`, `{{READ_TOOL}}`, etc.) — nunca hardcode
  - ✓ skill renderizada substitui todas template vars para a IDE alvo
  - ✗ skill contém nome de tool hardcoded → falha no teste de estrutura

- **RN02:** Cada skill segue a estrutura com 5 seções obrigatórias — formatos baseados em evidência de prompt engineering
  - ✓ S1 **Iron Law:** regra inviolável, markdown code block. Uma frase declarativa, ALL CAPS. Ex: `NO FIX WITHOUT ROOT CAUSE.` — Formato: destaque visual via code block, não XML (padrão validado em atomic-skills)
  - ✓ S2 **HARD-GATE:** checkpoint condicional, `<HARD-GATE>` XML tag. Formato: "Se prestes a [ação] sem [pré-condição]: PARE. [Instrução corretiva]." — a ÚNICA seção que usa XML tag (Claude fine-tuned em XML — evidência forte). Posicionado no ponto exato de decisão, não como proibição genérica
  - ✓ S3 **Process:** passos do processo, markdown numerado. Instruções concretas com framing positivo ("faça X" em vez de "não faça Y") — evidência: Pink Elephant Problem mostra que framing negativo pode induzir o comportamento indesejado
  - ✓ S4 **Red Flags:** pensamentos-armadilha, markdown lista com quotes em primeira pessoa. Ex: `- "Já sei a resposta, não preciso pesquisar"` — funciona como few-shot negativo (modelo vê o padrão de falha antes de encontrá-lo). Suporte teórico: Reflexion framework
  - ✓ S5 **Rationalization table:** markdown table com 2 colunas (Tentação | Por que falha). Cria lookup table contra auto-engano. Cada entrada referencia de volta o HARD-GATE ou Iron Law
  - ✓ poucas regras focadas por skill (3-5 core) — evidência: CSDD Paper mostra 96% compliance com 3-5 regras vs 78% com constituição inteira. Saturação de constraints documentada: 150+ instruções → degradação severa
  - ✗ skill sem qualquer dessas seções → falha no teste de estrutura
  - ✗ HARD-GATE fora de XML tag → perde benefício de fine-tuning XML do Claude
  - ✗ Red Flags em terceira pessoa ("o desenvolvedor pode...") → primeira pessoa é mais eficaz (match com perspectiva de geração do modelo)

- **RN03:** Status é LIDO do SQLite, nunca gerado da memória do LLM
  - ✓ skill `atomic-flow:status` instrui AI a ler via CLI/Read, não inventar
  - ✗ status gerado sem consultar SQLite/arquivo → violação da regra fundamental

- **RN04:** Spec contém WHAT/WHY, nunca HOW — enforçado pelo Layer 1
  - ✓ RF/RN com apenas comportamento esperado → passa
  - ✗ RF com `fetchData()` ou `implement` → FAIL automático

- **RN05:** SQLite é source of truth para STATE; markdown é source of truth para CONTENT
  - ✓ phase, gates, task status, annotations → SQLite
  - ✓ spec text, task descriptions, learnings narrative → markdown files
  - ✓ SQLite único em `.ai/atomic-flow.db` do main repo — worktrees acessam via caminho absoluto
  - ✓ caminho resolvido via `git worktree list --porcelain` → campo "worktree" do primeiro entry = main repo
  - ✗ conflito entre SQLite e markdown → SQLite prevalece para state, markdown para content

- **RN06:** Learning loop cap: max 3 ciclos com revisões por feature
  - ✓ 2 ciclos consecutivos com 0 revisões → skip futuras revisões
  - ✓ duração por ciclo limitada pela skill (guideline ~5 min, não enforçado pelo sistema)
  - ✗ 4º ciclo com revisões → parar, problema é a decomposição

- **RN07:** Annotation tool é `@henryavila/mdprobe` (pacote externo) — persiste em YAML sidecar
  - ✓ anotações em `spec.annotations.yaml` ao lado do spec.md (gerenciado pelo mdprobe)
  - ✓ atomic-flow lê o YAML via mdprobe helper API (`AnnotationFile.load()`) para Layer 2
  - ✓ schema formal via JSON Schema distribuído no pacote mdprobe
  - ✗ mdprobe ausente → `atomic-flow install` instala como dependência

- **RN08:** Protocolo de interação AI-humano — regras universais para TODAS as fases
  - ✓ AI SEMPRE explicita a fase/etapa atual no início de cada interação (ex: "Fase ② SPEC — refinamento") — nunca assume que o humano lembra o contexto
  - ✓ AI sempre pesquisa (research files, método, evidência existente, decisões anteriores) ANTES de propor — nunca fabrica do training data quando evidência existe
  - ✓ ANTES de levantar uma questão, AI pesquisa no repo (P&S, research, spec, decisions) se já não foi decidido — nunca perguntar o que já foi respondido
  - ✓ AI sempre recomenda COM embasamento, nunca auto-aprova — humano SEMPRE decide
  - ✓ discussões são UM item por vez — nunca agrupar múltiplas questões numa decisão
  - ✓ toda proposta deve ser consistente com os princípios do método — se incerta, reler METHOD-NATIVE.md
  - ✓ quando uma dúvida é resolvida por análise (sem perguntar ao humano), AI ESCREVE a dúvida E a análise que resolveu — humano valida a compreensão, intervém se errada
  - ✗ AI interage sem explicitar fase atual → violação
  - ✗ AI levanta questão já decidida sem consultar decisões anteriores → violação
  - ✗ AI propõe sem consultar research/evidência existente → violação
  - ✗ AI assume aprovação sem confirmação humana explícita → violação
  - ✗ AI resolve dúvida silenciosamente sem mostrar o raciocínio → violação (humano não pode validar o que não vê)

- **RN09:** Protocolo de refinamento/revisão — regras adicionais quando requisitos JÁ existem (spec refinement na Fase ② + Layer 2 na Fase ③)
  - ✓ ao discutir um requisito, TRANSCREVER ele inteiro — humano precisa de contexto completo
  - ✓ cobrir TODOS os RF/RN/EC sequencialmente — NUNCA pular, mesmo se parecer trivial
  - ✓ análise profunda antes de cada proposta — consultar pesquisas, decisões anteriores, princípios
  - ✗ AI pula requisito por parecer trivial → violação (gaps vêm dos triviais)
  - ✗ AI discute requisito sem transcrevê-lo → humano decide sem contexto

- **RN10:** Output estruturado do método segue padrão visual consistente — blockquote + emoji + bold como header de bloco
  - ✓ formato de cada bloco: `> {emoji} **{Título}**` seguido de conteúdo (texto, tabela, code block)
  - ✓ toda informação com 2+ seções lógicas distintas usa blocos separados com este formato
  - ✓ vocabulário completo de emojis por propósito — AI seleciona da tabela abaixo, NUNCA inventa:
    - 🔴 Problema, contradição, erro, conflito
    - 🟡 Warning, atenção, risco, flag não-crítico
    - 🟢 Sucesso, aprovado, pass, conforme
    - 🔍 Diagnóstico, análise, investigação
    - ✏️ Proposta, ação sugerida, correção
    - 📋 Contexto, background, referência, transcrição
    - 📊 Evidência, dados, métricas, comparação
    - ❓ Questão, decisão pendente, input necessário
    - 🚫 Bloqueado, fail, critical, hard stop
    - 💡 Insight, aprendizado, nota informativa
    - 🔄 Mudança, antes/depois, delta, diff
    - ✅ Resultado, conclusão, resumo final
    - ⚙️ Técnico, configuração, detalhe de implementação
    - 📍 Status, progresso, fase atual
  - ✓ conteúdo para inserir em arquivos usa code block (```) dentro do bloco ✏️ Proposta
  - ✓ tabelas usadas quando há comparação lado-a-lado (ex: RF vs TC, antes vs depois)
  - ✓ aplica-se a: findings de validação (Layer 3), resultados de preflight, análise de review, status com flags, qualquer output multi-seção das skills
  - ✗ skill apresenta informação multi-seção sem blockquote headers → inconsistência visual
  - ✗ emoji fora do vocabulário definido → AI DEVE usar apenas os 14 emojis listados
  - ✗ output com 1 seção única → RN10 não aplica, formato livre

- **RN11:** spec_hash rastreia integridade da spec — baseline definido em G3, drift detectado em fases posteriores
  - ✓ escopo do hash: seções RF + RN + EC da spec.md — exclui preamble (Objetivo), Validation (findings), Arquivos Envolvidos, Decisões Tomadas, Alternativas, Test Contracts, Fora de Escopo
  - ✓ razão do escopo: RF/RN/EC são as seções que geram tasks no decompose — mudanças nelas invalidam a decomposição; mudanças fora delas não afetam o escopo das tasks
  - ✓ baseline: hash computado e armazenado no SQLite (tabela features, coluna spec_hash) no momento da aprovação de G3 (VALIDATE → DECOMPOSE)
  - ✓ algoritmo: SHA-256 do texto extraído (RF+RN+EC), armazenado como hex 64 chars, exibido truncado 8 chars em tracking.md e UI
  - ✓ comparação em 4 pontos: SessionStart hook (warn), G5 preflight (warn), G6 preflight (warn), G7 reconcile (fail)
  - ✓ drift = hash atual da spec.md ≠ hash armazenado no SQLite — indica que RF/RN/EC mudaram após G3
  - ✓ atualização legítima: human corrige spec por necessidade real → atualiza hash no SQLite explicitamente → registra a correção em decisions.md da feature (rastreável)
  - ✗ hash computado sobre spec inteira (inclui Validation, Arquivos) → falsos positivos de drift quando Layer 3 salva findings
  - ✗ hash atualizado automaticamente sem registro em decisions.md → mudança não rastreável, perde auditoria

---

## Edge Cases

- **EC01:** SQLite corrompido ou ausente
  - ✓ regenera do tracking.md + task files existentes (markdown → SQLite hydration)

- **EC02:** Duas sessions Claude simultâneas (mesma feature ou features diferentes)
  - ✓ SQLite único no main repo — todas as sessões/worktrees acessam o mesmo DB
  - ✓ sql.js (WASM) carrega DB inteiro em memória — sem file-level locking nativo
  - ✓ advisory file lock (`.ai/atomic-flow.db.lock`): acquire antes de write, release após export
  - ✓ lock timeout: 5s, retry 3x com backoff — se falhar, WARN e permite leitura read-only
  - ✗ write concurrent sem lock → last-write-wins (perda de dados) — lock mitiga no MVP
  - ✗ v1.1: migrar para better-sqlite3 (file-level locking nativo) quando prebuilt binaries estabilizarem

- **EC03:** Install interrompido por Ctrl+C
  - ✓ cleanup de arquivos parciais, DB em estado consistente (ACID)

- **EC04:** Feature com 10+ tasks (acima do recomendado)
  - ✓ WARN sugerindo split em 2 features, não bloqueia

- **EC05:** Spec muda após decompose (drift)
  - ✓ spec_hash no SQLite detecta automaticamente, flag DRIFT no reconcile

- **EC06:** Annotation tool — spec com emoji, unicode, tabelas complexas
  - ✓ renderiza corretamente, line numbers consistentes

- **EC07:** Projeto já usa `.ai/` para outro tool
  - ✓ detecta, avisa, pergunta se deve coexistir em subdiretório

- **EC08:** Ambiente remoto (SSH, container)
  - ✓ `atomic-flow ui` mostra URL no terminal → acessível via Tailscale/port forward/IP remoto
  - ✓ server escuta em `0.0.0.0` (não só localhost) para acesso via rede
  - ✓ WARN visível no terminal quando escutando em `0.0.0.0`: "Dashboard acessível na rede — sem autenticação"

---

## Arquivos Envolvidos

- `package.json` — novo — npm package definition (dep: sql.js, inquirer, @henryavila/mdprobe)
- `bin/cli.js` — novo — CLI entry point (install/uninstall/new/ui/status/gate)
- `src/install.js` — novo — implementation — lógica de instalação
- `src/uninstall.js` — novo — implementation — lógica de remoção
- `src/db.js` — novo — implementation — SQLite schema, migrations, queries
- `src/enforcement.js` — novo — implementation — triggers, valid_transitions, gate checks
- `src/render.js` — novo — implementation — template rendering (de atomic-skills)
- `src/config.js` — novo — implementation — IDE registry (só claude-code MVP)
- `src/hash.js` — novo — implementation — SHA-256 utility
- `src/manifest.js` — novo — implementation — persistência de manifest
- `src/yaml.js` — novo — implementation — YAML parser
- `src/lock.js` — novo — implementation — advisory file lock para SQLite (acquire/release/timeout)
- `src/prompts.js` — novo — implementation — CLI prompts via inquirer
- `src/ui-server.js` — novo — implementation — Local UI HTTP server (dashboard + feature detail + mdprobe mount)
- `src/ui/dashboard.html` — novo — implementation — overview de todas features
- `src/ui/feature.html` — novo — implementation — detalhe de uma feature
- `src/ui/shared.css` — novo — implementation — estilos compartilhados (funcional, não polished)
- `src/ui/shared.js` — novo — implementation — lógica compartilhada (SQLite queries, rendering)
- `src/mcp-server.js` — novo — implementation — MCP server (stdio transport, expõe tools)
- `src/export.js` — novo — implementation — SQLite → markdown export
- `src/hydrate.js` — novo — implementation — markdown → SQLite hydration
- `skills/en/1-research.md` — novo — implementation — `atomic-flow:1-research`
- `skills/en/2-spec.md` — novo — implementation — `atomic-flow:2-spec`
- `skills/en/3-spec-validate.md` — novo — implementation — `atomic-flow:3-spec-validate`
- `skills/en/4-decompose.md` — novo — implementation — `atomic-flow:4-decompose`
- `skills/en/5-implement.md` — novo — implementation — `atomic-flow:5-implement`
- `skills/en/6-review.md` — novo — implementation — `atomic-flow:6-review`
- `skills/en/7-ship.md` — novo — implementation — `atomic-flow:7-ship`
- `skills/en/status.md` — novo — implementation — `atomic-flow:status`
- `skills/en/gate.md` — novo — implementation — `atomic-flow:gate`
- `skills/en/new.md` — novo — implementation — `atomic-flow:new` (cria feature, chama MCP new_feature + EnterWorktree + setup)
- `templates/tracking.md` — novo — implementation — template de tracking export
- `templates/spec.md` — novo — implementation — template de spec
- `templates/task.md` — novo — implementation — template de task file
- `templates/research-index.md` — novo — implementation — template de research index per-feature
- `templates/research-topic.md` — novo — implementation — template de research file por tópico
- `templates/decisions.md` — novo — implementation — template de decision journal per-feature
- `templates/hooks.json` — novo — implementation — hooks de SessionStart + PreToolUse
- `meta/skills.yaml` — novo — implementation — catálogo de skills
- `meta/schema.sql` — novo — contract — schema SQLite com triggers

## Decisões Tomadas

- **Self-contained:** Copiar ~155 linhas de infra do atomic-skills. Razão: zero conteúdo compartilhado.
- **SQLite (sql.js WASM):** Enforcement no nível do dado via triggers. Markdown sozinho não enforça. Zero compilação nativa.
- **SQLite topology: DB único no main repo:** Worktrees acessam via caminho absoluto. Advisory file lock para serializar writes. Razão: cross-feature queries (dashboard), auto-incremento de IDs, reconcile global. sql.js sem file-level locking → lock explícito no MVP, better-sqlite3 no v1.1.
- **Só Claude Code MVP:** Menor superfície de teste. Multi-IDE v1.1.
- **Só EN MVP:** Foco na qualidade do conteúdo.
- **7 fases (não 6):** Fase ③ SPEC VALIDATE adicionada. FORGE: rework 30-50% → <15%.
- **Annotation tool via mdprobe:** Layer 2 é crítico. `@henryavila/mdprobe` como pacote externo (library mode). YAML sidecar para persistência.
- **Individual task files (40-80 linhas):** TDAD Paper: 20 linhas > 107 linhas (4x resolução). BMAD #2003: títulos = código superficial.
- **Namespace colon:** `atomic-flow:1-research` (convenção do ecossistema).
- **Learning loop:** AAR micro-retro + revise pending tasks. Stanford MemoryArena valida.
- **File scoping por fase (não só 3-tier):** Leitura livre em todas as fases. Escrita varia: RESEARCH=docs/research, SPEC=spec+decisions, IMPLEMENT=3-tier (task/feature/block), SHIP=nenhuma.
- **Contracts-first no decompose:** Spec é pure WHAT (sem code). Contracts derivam da spec validada.
- **Hybrid SQLite+Markdown:** SQLite=state enforcement, Markdown=content+git. Padrão Beads (18.7K stars).
- **7 gates em todas as transições forward (não 3):** Humano aprova CADA transição. Backward transitions sem gate (decisão humana de voltar já é o gate). Razão: "a disciplina é humana".
- **Worktrees gerenciados pelo Claude Code nativo:** MCP registra feature no SQLite, AI usa `EnterWorktree`/`ExitWorktree` nativos. Atomic-flow não faz `git worktree add`.
- **Research como patrimônio do projeto:** Research files em `docs/research/` (project-level), não per-feature. Index per-feature aponta para os relevantes. Sobrevive ao lifecycle da feature.
- **Decision journal obrigatório:** `decisions.md` per-feature registra jornada de decisão (Problema→Solução→Como Aplicar). G2 preflight valida existência. Proporcional à feature.
- **Protocolo AI-humano (RN08/RN09):** 7 regras universais + 3 de refinamento. Descobertas empiricamente durante esta entrevista. Encoded em skills e METHOD-NATIVE.md.
- **Formato de skills baseado em evidência (RN02):** Iron Law=code block, HARD-GATE=XML tag (único), Process=positivo, Red Flags=1ª pessoa, Rationalization=tabela. Max 3-5 regras core. Fontes: CSDD Paper, Anthropic docs, Reflexion framework.

## Alternativas Rejeitadas

- **Depender de atomic-skills:** Coupling para 155 linhas de infra.
- **Markdown-only tracking:** Sem enforcement de dados. AI pode editar frontmatter livremente.
- **better-sqlite3:** Compilação nativa falha em Windows sem build tools, Node não-LTS.
- **Application-level enforcement (sem SQLite):** Sem ACID, sem cross-feature queries, sem triggers.
- **SQLite per-worktree (isolado):** Cada worktree teria seu próprio DB. Quebra cross-feature queries (dashboard), auto-incremento, reconcile global. Merge de DBs = complexidade exponencial.
- **7 IDEs no MVP:** Aumenta superfície de teste.
- **Phase subdirectories:** 0 de 6 tools usa. Fases = frontmatter, não dirs.
- **Tasks em single file:** Após /clear, AI precisa de contexto self-contained por task.
- **Prefix `af1-` ou `atomic-flow-1-`:** Não segue convenção de colon namespace.
- **Contracts na fase spec:** Hook bloquearia código. Contracts derivam da spec validada.
- **Annotation tool embutido:** Extraído para pacote separado (`@henryavila/mdprobe`) — reutilizável em outros projetos.
- **Manifest com prompt interativo (overwrite/keep/diff):** Complexidade sem ganho. Simplificado para skip+warn+`--force`.
- **Gates automáticos com override humano:** Viola princípio fundamental "a disciplina é humana". Gates são SEMPRE humanos.
- **3 gates (só G1/G2/G3):** Transições sem gate não tinham checkpoint humano. Expandido para 7.
- **Research per-feature (`.ai/features/NNN/research/`):** Fragmenta conhecimento. Research é patrimônio do projeto, não da feature.
- **P&S como seção na spec:** Spec ficaria 150-200 linhas maior. Arquivo separado preserva narrativa sem bloat.
- **XML tags para todas as seções de skills:** Sem evidência. Só HARD-GATE se beneficia de XML (Claude fine-tuned). Restante usa markdown.
- **Todos artefatos em `.ai/features/` (dot-prefix):** Esconde specs e decisions de arquitetos e novos devs. Precedentes (Rust, Go, Kubernetes) colocam specs em diretórios visíveis.
- **Graduação no ship (mover de .ai/ para docs/ na conclusão):** Step extra no ship, dois locais possíveis para o mesmo arquivo durante lifecycle. Opção B (sempre em docs/) é zero-overhead.

## Test Contracts

### RF01: Install
- **TC-RF01-1** [business]: {projeto limpo, node >= 18} → {10 skills, SQLite inicializado com schema, hooks merged, .ai/features/ criado}
- **TC-RF01-2** [error]: {node < 18} → {stderr: "Node.js >= 18 required", exit 1}
- **TC-RF01-2b** [error]: {diretório sem git} → {stderr: "Git repository required", exit 1}
- **TC-RF01-3** [edge]: {projeto já tem atomic-flow} → {3-hash conflict detection, skip+warn para modificados}
- **TC-RF01-4** [business]: {install em projeto limpo} → {`.gitignore` contém `.ai/atomic-flow.db` e `.ai/atomic-flow.db.lock`}
- **TC-RF01-5** [error]: {sub-step RF02 falha (template var inválida)} → {install aborta inteiro, rollback parcial}

### RF02: Skill rendering
- **TC-RF02-1** [business]: {skill com {{BASH_TOOL}}} → {output: "Bash", sem "{{BASH_TOOL}}"}
- **TC-RF02-2** [boundary]: {skill com {{#if ide.gemini}}} → {bloco removido para claude-code}
- **TC-RF02-3** [error]: {skill com {{UNKNOWN_VAR}}} → {FAIL com lista de vars não substituídas, skill NÃO instalada}

### RF03: Uninstall
- **TC-RF03-1** [business]: {uninstall completo} → {skills, hooks, SQLite, .ai/features/, .atomic-flow/manifest.json removidos}
- **TC-RF03-2** [business]: {uninstall com .mcp.json que tem outros servers} → {apenas entry `atomic-flow` removida, outros servers preservados}
- **TC-RF03-3** [business]: {uninstall} → {entradas de .gitignore mantidas, output menciona "remova manualmente se desejar"}
- **TC-RF03-4** [edge]: {uninstall com feature phase=implement} → {aviso "1 feature ativa", pede confirmação}

### RF04: Manifest
- **TC-RF04-1** [business]: {reinstalação, arquivo não modificado} → {sobrescreve silenciosamente}
- **TC-RF04-2** [business]: {reinstalação, arquivo modificado localmente} → {SKIP com WARN listando arquivos mantidos + informa `--force`}
- **TC-RF04-3** [business]: {reinstalação com `--force`} → {sobrescreve tudo independente de modificação}
- **TC-RF04-4** [error]: {arquivo modificado + sem `--force`} → {NÃO sobrescreve, WARN com instrução de `--force`}

### RF04b: MCP Server
- **TC-RF04b-1** [business]: {install completo} → {`.mcp.json` existe, MCP server inicia, tools listados}
- **TC-RF04b-2** [business]: {AI chama mcp gate_approve("G3")} → {SQLite atualizado, transição habilitada}
- **TC-RF04b-3** [error]: {MCP server sem SQLite} → {erro descritivo: "Run atomic-flow install first"}

### RF04c: Dual activation
- **TC-RF04c-1** [business]: {user invoca /atomic-flow:1-research "auth"} → {skill ativada, feature criada}
- **TC-RF04c-2** [business]: {user diz "quero implementar auth"} → {AI detecta intent, invoca skill}
- **TC-RF04c-3** [edge]: {user diz "implementar auth" sem feature existente} → {MCP cria feature, output informa "Feature 001-auth criada, iniciando fase ① RESEARCH", inicia research — não pula para implement}
- **TC-RF04c-4** [business]: {AI sugere iniciar nova fase} → {mostra status via MCP status (RF22), humano confirma antes da transição}
- **TC-RF04c-5** [error]: {AI transiciona sem confirmação humana} → {violação RN08}

### RF04d: Worktree transparente
- **TC-RF04d-1** [business]: {MCP new_feature("auth")} → {SQLite: feature registrada, branch=`atomic-flow/001-auth`}
- **TC-RF04d-2** [business]: {skill instrui EnterWorktree} → {Claude Code cria worktree nativamente, AI entra, user não percebe}
- **TC-RF04d-3** [business]: {ship concluído} → {branch merged, ExitWorktree nativo, Claude Code faz cleanup}
- **TC-RF04d-4** [edge]: {worktree já existe} → {entra no existente}
- **TC-RF04d-5** [error]: {merge conflict no ship} → {reporta ao humano}
- **TC-RF04d-6** [business]: {dentro do worktree, acessa SQLite} → {resolve main repo via `git worktree list --porcelain`, abre `.ai/atomic-flow.db` do main repo}
- **TC-RF04d-7** [edge]: {write no SQLite a partir do worktree} → {advisory lock acquired antes do write, released após export}

### RF05: New feature
- **TC-RF05-1** [business]: {atomic-flow new "user-login"} → {docs/features/001-user-login/ criado com spec.md + decisions.md + research-index.md; .ai/features/001-user-login/ criado com tasks/ + tracking.md}
- **TC-RF05-2** [boundary]: {3ª feature criada} → {ID = 003}
- **TC-RF05-3** [error]: {nome "user login!@#"} → {erro + sugestão "user-login"}

### RF05b: Research output
- **TC-RF05b-1** [business]: {research de "auth"} → {docs/research/auth-patterns.md criado com Fontes, Análise, Síntese, Decisões}
- **TC-RF05b-2** [business]: {research completo} → {docs/features/NNN/research-index.md com links para research files + resumo executivo}
- **TC-RF05b-3** [business]: {feature 003 reutiliza research de feature 001} → {research-index.md da 003 aponta para mesmo docs/research/auth-patterns.md}
- **TC-RF05b-4** [error]: {research sem fontes externas} → {G1 preflight flag: "Sem referências externas"}
- **TC-RF05b-5** [error]: {research-index.md ausente} → {G1 preflight FAIL}
- **TC-RF05b-6** [edge]: {research file com 900+ linhas} → {WARN: "Considere dividir em tópicos menores"}

### RF05c: Decision journal
- **TC-RF05c-1** [business]: {durante spec interview, problema descoberto} → {decisions.md atualizado com P{N}: título, problema, solução, how to apply}
- **TC-RF05c-2** [business]: {implementador questiona decisão da spec} → {decisions.md contém rationale completo}
- **TC-RF05c-3** [error]: {decisions.md ausente no G2 preflight} → {FAIL: "Decision journal ausente"}
- **TC-RF05c-4** [edge]: {decisions.md com 0 entradas no G2 preflight} → {WARN: "Nenhum problema — confirme que spec é trivial"}
- **TC-RF05c-5** [business]: {feature pequena, 3 RFs} → {decisions.md com 1-2 entradas proporcionais}

### RF05d: Cancel feature
- **TC-RF05d-1** [business]: {cancel_feature(001, "requisitos mudaram")} → {SQLite: status=cancelled, motivo registrado, decisions.md atualizado}
- **TC-RF05d-2** [business]: {cancel de feature em phase=implement} → {ExitWorktree + branch deletada + .ai/features/001/ deletado}
- **TC-RF05d-3** [business]: {cancel} → {docs/features/001/ preservado com spec + decisions + research-index}
- **TC-RF05d-4** [business]: {cancel} → {docs/research/001-slug/ preservado (patrimônio)}
- **TC-RF05d-5** [error]: {cancel_feature(001, "")} → {MCP rejeita: "Motivo obrigatório"}
- **TC-RF05d-6** [error]: {cancel_feature(001) de feature done} → {MCP rejeita: "Feature já concluída"}
- **TC-RF05d-7** [business]: {dashboard após cancel} → {feature com badge "cancelled", visual distinto de done}

### RF21: Reconcile + ship cleanup
- **TC-RF21-4** [business]: {reconcile OK + merge} → {.ai/features/NNN/ deletado, docs/features/NNN/ preservado}
- **TC-RF21-5** [business]: {branch não deletada após ship} → {artefatos efêmeros recuperáveis via git log da branch}

### RF06: Phase transitions
- **TC-RF06-1** [business]: {phase=validate, G3=approved, transition to decompose} → {SQLite updated, phase=decompose}
- **TC-RF06-2** [error]: {phase=spec, transition to implement} → {RAISE(ABORT): "Invalid phase transition"}
- **TC-RF06-3** [error]: {phase=decompose, G4=pending, transition to implement} → {RAISE(ABORT): "Gate G4 not approved"}
- **TC-RF06-4** [boundary]: {phase=review, transition to implement} → {aceito (rework loop válido)}

### RF07: Gates
- **TC-RF07-1** [business]: {atomic-flow gate approve G3} → {SQLite: gates.G3.status = approved}
- **TC-RF07-2** [error]: {gate reject G4} → {SQLite: status=rejected, fase fica na atual (decompose)}
- **TC-RF07-3** [edge]: {AI edita tracking.md para "G3: approved"} → {SQLite não reflete, transição bloqueada}
- **TC-RF07-4** [business]: {gate approve G1} → {commit automático com research files + research-index, research→spec habilitado}
- **TC-RF07-5** [business]: {gate approve G7} → {ship→done, feature concluída}
- **TC-RF07-6** [business]: {gate approve G2, spec.md + decisions.md modified} → {commit "gate(G2): spec + decisions approved" ANTES de SQLite update}
- **TC-RF07-7** [business]: {gate approve G3, spec.md com correções de validação} → {commit "gate(G3): spec validated" com spec corrigida}
- **TC-RF07-8** [edge]: {gate approve G5, arquivos unstaged no worktree} → {WARN "N arquivos não commitados", commit inclui tudo}

### RF07b: Preflight checks
- **TC-RF07b-1** [business]: {preflight G4, task T4 com 5 arquivos} → {flag: "T4 tem 5 arquivos, SPLIT recomendado"}
- **TC-RF07b-2** [business]: {preflight G4, T3 e T5 editam User.php} → {flag: "COLISÃO: T3 e T5 compartilham User.php"}
- **TC-RF07b-3** [business]: {preflight G4, contrato com refund() vs RF03 "não-reembolsável"} → {flag: "CONFLICT: refund() contradiz RF03"}
- **TC-RF07b-4** [business]: {preflight G4, zero problemas} → {0 flags, approve habilitado}
- **TC-RF07b-5** [edge]: {preflight G4, dependência cíclica T2→T3→T5→T2} → {flag: "CICLO de dependência"}
- **TC-RF07b-6** [boundary]: {approve G4 com flags pendentes} → {warning "3 flags unresolved", approve permitido mas registrado}
- **TC-RF07b-7** [business]: {preflight G1, arquivo research não existe} → {flag: "Research file ausente"}
- **TC-RF07b-8** [business]: {preflight G5, 2/5 tasks pending} → {flag: "2 tasks pendentes: T3, T5"}
- **TC-RF07b-9** [business]: {preflight universal, status não atualizado no SQLite} → {flag: "Status da fase não atualizado"}

### RF08: Local UI server
- **TC-RF08-1** [business]: {atomic-flow ui} → {browser abre localhost, /dashboard carrega, SQLite conectado}
- **TC-RF08-2** [edge]: {porta 3000 em uso} → {tenta 3001, abre com sucesso}
- **TC-RF08-3** [error]: {SQLite ausente} → {erro: "Run atomic-flow install first"}

### RF09: Dashboard
- **TC-RF09-1** [business]: {2 features ativas} → {/dashboard lista 2 features com fase, progresso, gates}
- **TC-RF09-2** [business]: {feature com 3/5 tasks done} → {barra de progresso mostra 60%}
- **TC-RF09-3** [edge]: {zero features} → {mensagem "Crie com atomic-flow new"}
- **TC-RF09-4** [boundary]: {feature com drift detectado} → {indicador visual de DRIFT}

### RF10: Feature detail
- **TC-RF10-1** [business]: {/feature/001} → {diagrama de fases, tasks table, gates, learnings}
- **TC-RF10-2** [business]: {link "Review Spec" → /review/001} → {mdprobe renderiza spec com annotation UI}
- **TC-RF10-3** [error]: {/feature/999} → {404 com lista de features válidas}

### RF11: Annotation tool (mdprobe)
- **TC-RF11-1** [business]: {/review/001} → {mdprobe renderiza spec.md, seleção + comentário funciona}
- **TC-RF11-2** [business]: {salvar anotação} → {spec.annotations.yaml criado com selectors, comment, tag, status=open}
- **TC-RF11-3** [edge]: {reabrir com anotações existentes} → {re-anchoring automático, highlights posicionados}
- **TC-RF11-4** [boundary]: {spec 500+ linhas com emoji} → {renderiza corretamente (remark/unified)}
- **TC-RF11-5** [business]: {onComplete callback} → {atomic-flow notificado quando revisão termina}

### RF12: Layer 1 validation
- **TC-RF12-1** [business]: {spec completa, sem violações} → {6/6 checks PASS}
- **TC-RF12-2** [error]: {RF sem ✓/✗} → {FAIL: "RF03 não tem critério de aceitação"}
- **TC-RF12-3** [error]: {weak word "should" em critério} → {FAIL: "Critério deve ser determinístico"}
- **TC-RF12-4** [error]: {`fetchData()` em RF} → {FAIL: "Código não pertence à spec"}

### RF13: Layer 3 validation
- **TC-RF13-1** [business]: {spec com RF contradizendo outro RF} → {D1 finding com severidade, evidência citando ambos RFs}
- **TC-RF13-2** [business]: {spec completa, sem issues óbvios} → {mínimo 3 findings (anti-rubber-stamping)}
- **TC-RF13-3** [error]: {AI gera 0 findings} → {FAIL: "rubber-stamping, anti-sycophancy violado"}
- **TC-RF13-4** [error]: {AI gera 15 findings} → {cap 10 findings, priorizados por severidade}
- **TC-RF13-5** [business]: {finding sem evidência (sem citação de linha/RF)} → {finding rejeitado, evidência obrigatória}
- **TC-RF13-6** [error]: {CRITICAL encontrado} → {bloqueia G3, volta para Layer 2}
- **TC-RF13-7** [business]: {3 HIGH, 2 MEDIUM, 0 CRITICAL} → {G3 não bloqueado, findings registrados na seção Validation da spec.md}

### RF14: Contracts-first
- **TC-RF14-1** [business]: {decompose inicia para feature 001} → {contracts gerados da spec, commitados no source tree antes de task files}
- **TC-RF14-2** [business]: {contract para RF05} → {SQLite tasks: type=contract, feature_id=001}
- **TC-RF14-3** [error]: {contract sem interface pública (arquivo interno)} → {WARN: "Contract sem export público"}

### RF15: Task files
- **TC-RF15-1** [business]: {task T1 criada} → {`.ai/features/001/tasks/T1-name.md` com YAML frontmatter (id, files, deps, status)}
- **TC-RF15-2** [business]: {task com 60 linhas} → {dentro do range 40-80, aceita}
- **TC-RF15-3** [boundary]: {task com 120 linhas} → {WARN: "Task excede 80 linhas, considere dividir"}
- **TC-RF15-4** [error]: {task sem Test Contracts no corpo} → {FAIL no Layer 1 da task}
- **TC-RF15-5** [business]: {5 tasks criadas} → {tracking.md (RF22) contém status compacto de todas 5}

### RF19: Recovery levels
- **TC-RF19-1** [business]: {task falha 1ª vez} → {R1: re-prompt com mais contexto (stacktrace, arquivo, padrão)}
- **TC-RF19-2** [business]: {task falha 2ª vez} → {R2: git checkout . + re-prompt com abordagem diferente}
- **TC-RF19-3** [business]: {task falha 3ª vez, problema complexo} → {R3: subagent de investigação, retorna diagnóstico}
- **TC-RF19-4** [error]: {task falha após R3 (3 strikes)} → {R4: task status=failed no SQLite, documenta tentativas, escala ao humano}
- **TC-RF19-5** [boundary]: {R1 resolve o problema} → {task continua, strike count = 1, sem escalação}

### RF20: Convergence rule
- **TC-RF20-1** [business]: {review round 1: 3 CRITICAL, round 2: 1 CRITICAL} → {convergindo, round 3 permitido}
- **TC-RF20-2** [error]: {review round 1: 2 CRITICAL, round 2: 4 CRITICAL} → {divergindo, rollback + re-prompt do zero}
- **TC-RF20-3** [error]: {3 rounds completos, ainda 1 CRITICAL} → {aceitar com ressalvas OU rollback feature — humano decide}
- **TC-RF20-4** [business]: {round 1: 1 CRITICAL + 3 HIGH, round 2: 0 CRITICAL + 1 HIGH} → {convergindo, G6 habilitado}

### RF16: SessionStart hook
- **TC-RF16-1** [business]: {sessão nova, feature 001 ativa, phase=implement, T3 in_progress} → {output contém: phase, task atual, gates, 3 rules de implement}
- **TC-RF16-2** [edge]: {nenhuma feature ativa} → {mensagem informativa}
- **TC-RF16-3** [boundary]: {spec_hash drift detectado} → {output contém WARNING DRIFT}
- **TC-RF16-4** [business]: {feature em phase=spec, primeira vez} → {output contém "spec:creation"}
- **TC-RF16-5** [business]: {feature retorna para spec após validate falhar} → {output contém "spec:refinement"}
- **TC-RF16-6** [business]: {phase=research} → {3 rules: "Descubra e documente...", "Codebase primeiro...", "Salve granular..."}

### RF17: File scoping por fase
- **TC-RF17-1** [business]: {phase=implement, Write em arquivo declarado na task} → {permitido, exit 0}
- **TC-RF17-2** [business]: {phase=implement, Write em arquivo da feature mas não da task} → {WARNING mostrado, permitido}
- **TC-RF17-3** [error]: {phase=implement, Write em arquivo fora da feature} → {exit 2, BLOCKED}
- **TC-RF17-4** [business]: {phase=research, Write em docs/research/topic.md} → {permitido}
- **TC-RF17-5** [error]: {phase=research, Write em src/app.ts} → {exit 2, BLOCKED: "Research phase: escrita apenas em docs/research/"}
- **TC-RF17-6** [business]: {phase=spec, Write em spec.md} → {permitido}
- **TC-RF17-7** [error]: {phase=spec, Write em src/app.ts} → {exit 2, BLOCKED: "Spec phase: escrita apenas em spec.md e decisions.md"}
- **TC-RF17-8** [error]: {phase=ship, Write em qualquer arquivo} → {exit 2, BLOCKED: "Ship phase: nenhuma escrita — fix = fase anterior"}
- **TC-RF17-9** [business]: {qualquer phase, Read em qualquer arquivo} → {permitido, exit 0}

### RF18: Learning loop
- **TC-RF18-1** [business]: {task T2 done} → {learnings row no SQLite com decisions, constraints}
- **TC-RF18-2** [business]: {T3 depende de T2, T2 mudou interface} → {T3.md auto-updated com nova interface}
- **TC-RF18-3** [edge]: {revisão de escopo para T4} → {flag HUMAN-GATE, não auto-aplica}
- **TC-RF18-4** [boundary]: {2 ciclos com 0 revisões} → {skip futuras revisões}

### RF21: Reconcile
- **TC-RF21-1** [business]: {todos gates OK, todas tasks done, spec_hash match} → {reconcile: OK}
- **TC-RF21-2** [error]: {spec mudou após decompose} → {reconcile: DRIFT + spec_hash mismatch}
- **TC-RF21-3** [error]: {arquivo no git diff não declarado em task} → {reconcile: ORPHAN}

### RF22: Status + export
- **TC-RF22-1** [business]: {atomic-flow status} → {output: feature, phase, gates, tasks table}
- **TC-RF22-2** [business]: {após status} → {tracking.md exportado em .ai/features/NNN/}
- **TC-RF22-3** [edge]: {SQLite ausente} → {regenera do tracking.md existente}

### RN03: Status determinístico
- **TC-RN03-1** [business]: {skill instrui "leia com Read tool"} → {grep no .md encontra Read/{{READ_TOOL}}}
- **TC-RN03-2** [error]: {skill diz "reporte status"} → {grep encontra "report from memory" → FAIL}

### RN05: SQLite=state, Markdown=content
- **TC-RN05-1** [business]: {phase transition via CLI} → {SQLite updated + tracking.md re-exported}
- **TC-RN05-2** [edge]: {edição manual de spec.md} → {conteúdo markdown prevalece, SQLite atualiza spec_hash}

### RN01: Template vars
- **TC-RN01-1** [business]: {skill source com {{BASH_TOOL}}, IDE=claude-code} → {output contém "Bash", zero ocorrências de "{{BASH_TOOL}}"}
- **TC-RN01-2** [error]: {skill source com {{INVALID_VAR}}} → {FAIL: "Template var não reconhecida: {{INVALID_VAR}}", skill NÃO instalada}

### RN02: Skill structure
- **TC-RN02-1** [business]: {skill instalada} → {contém 5 seções: Iron Law (code block), HARD-GATE (XML tag), Process, Red Flags (1ª pessoa), Rationalization table}
- **TC-RN02-2** [error]: {skill com HARD-GATE fora de XML tag} → {FAIL no teste de estrutura}
- **TC-RN02-3** [error]: {skill com Red Flags em 3ª pessoa ("o dev pode...")} → {FAIL: deve ser 1ª pessoa ("Já sei a resposta...")}
- **TC-RN02-4** [boundary]: {skill com 6+ regras core} → {WARN: "CSDD: 3-5 regras = 96% compliance, muitas = 78%"}

### RN04: WHAT/WHY not HOW
- **TC-RN04-1** [business]: {RF com "usuário faz login com email e senha → sessão criada"} → {Layer 1 C3: PASS (comportamento, não implementação)}
- **TC-RN04-2** [error]: {RF com "implement JWT validation using jsonwebtoken library"} → {Layer 1 C3: FAIL "Verbo de implementação + tecnologia específica em requisito"}

### RN07: mdprobe YAML persistence
- **TC-RN07-1** [business]: {humano anota spec via mdprobe} → {spec.annotations.yaml criado ao lado do spec.md com selectors, comment, status=open}
- **TC-RN07-2** [business]: {atomic-flow lê anotações para Layer 2} → {AnnotationFile.load() retorna array de annotations com trecho, comentário, status}
- **TC-RN07-3** [error]: {mdprobe não instalado, user roda atomic-flow install} → {mdprobe instalado como dependência}

### RN08: Protocolo AI-humano
- **TC-RN08-1** [business]: {sessão inicia com feature ativa} → {primeiro output da AI contém fase atual (ex: "Fase ⑤ IMPLEMENT")}
- **TC-RN08-2** [business]: {AI propõe solução} → {output referencia evidência (research file, P&S, spec) — não fabrica do training data}
- **TC-RN08-3** [error]: {AI resolve dúvida sem mostrar análise} → {violação: humano não pode validar raciocínio invisível}
- **TC-RN08-4** [error]: {AI levanta questão já decidida em decisions.md} → {violação: deveria ter consultado antes de perguntar}
- **TC-RN08-5** [business]: {AI resolve dúvida por análise própria} → {output contém: a dúvida + a análise que resolveu}

### RN09: Protocolo de refinamento
- **TC-RN09-1** [business]: {AI discute RF05 durante refinamento} → {output transcreve RF05 inteiro antes de discutir}
- **TC-RN09-2** [error]: {AI pula RF03 por parecer trivial} → {violação: cobrir TODOS sequencialmente}
- **TC-RN09-3** [business]: {análise resolve dúvida sobre RF18} → {output mostra: dúvida + análise + referência a P8 (decisão anterior)}

### RN10: Output estruturado
- **TC-RN10-1** [business]: {Layer 3 apresenta finding com contradição + diagnóstico + proposta} → {3 blocos com `>` header, emojis 🔴🔍✏️, cada seção visualmente separada}
- **TC-RN10-2** [business]: {preflight G4 retorna 3 flags} → {cada flag em bloco com emoji ⚠️, conteúdo estruturado}
- **TC-RN10-3** [error]: {skill apresenta 4 seções sem blockquote headers} → {inconsistência visual, viola RN10}
- **TC-RN10-4** [boundary]: {output com 1 seção apenas (sem multi-bloco)} → {RN10 não aplica, formato livre}

### RN11: spec_hash
- **TC-RN11-1** [business]: {G3 aprovado para feature 001} → {SQLite features.spec_hash = SHA-256 de RF+RN+EC, 64 chars hex}
- **TC-RN11-2** [business]: {SessionStart com spec.md modificada após G3} → {output contém WARNING DRIFT com hash stored vs current}
- **TC-RN11-3** [business]: {G7 reconcile, spec_hash match} → {reconcile OK}
- **TC-RN11-4** [error]: {G7 reconcile, spec_hash mismatch} → {reconcile FAIL: "DRIFT — spec mudou após decompose"}
- **TC-RN11-5** [business]: {Layer 3 adiciona findings na seção Validation da spec.md} → {spec_hash NÃO muda (Validation fora do escopo do hash)}
- **TC-RN11-6** [business]: {human corrige RF02 durante implement, atualiza hash no SQLite, registra em decisions.md} → {preflight passa, decisão rastreável}
- **TC-RN11-7** [error]: {hash atualizado no SQLite SEM registro em decisions.md} → {mudança não rastreável, viola RN11}
- **TC-RN11-8** [boundary]: {spec.md com whitespace changes em RF section} → {hash muda, drift detectado (hash é sobre texto exato)}

### RN06: Learning loop cap
- **TC-RN06-1** [boundary]: {3º ciclo com revisões} → {revisões aplicadas}
- **TC-RN06-2** [boundary]: {4º ciclo} → {STOP: "Problema é a decomposição, não a execução"}

## Fora de Escopo

- Multi-IDE (Cursor, Gemini, Codex, OpenCode, Copilot) — v1.1
- Português (skills em pt/) — v1.1
- Integração com CI/CD
- Dual-model review (Claude + Codex/Gemini) no Layer 3
- Geração automática de spec (skill `atomic-flow:2-spec` faz, não o package)
- Cross-feature dependency management (features são independentes no MVP)
- Vector search / embeddings sobre learnings
- TUI interativo para review em terminal puro (sem browser) — v1.1
- Multi-user collaboration (single developer no MVP)
- Autenticação no dashboard UI (single developer, rede local/Tailscale) — v1.1

---

**Design decisions journal:** [`docs/specs/decisions.md`](decisions.md) — 28 problemas descobertos durante o design desta spec, com soluções e rationale.
