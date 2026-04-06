# Spec: Atomic Flow MVP

Data: 2026-04-06

## Objetivo

Criar um sistema de enforcement de metodologia de desenvolvimento AI-assisted com 7 fases, que garante compliance via SQLite state machine + MCP server + hooks + skills instaláveis, distribuído como npm package (`@henryavila/atomic-flow`).

O projeto tem 3 camadas: método (skills que ensinam), enforcer (MCP server + SQLite + hooks que garantem), distribuição (CLI que instala). O usuário interage via skills ou conversa natural — nunca precisa sair do Claude Code durante o workflow.

---

## Requisitos Funcionais

### Distribuição

- **RF01:** `npx @henryavila/atomic-flow install` instala skills, inicializa SQLite, configura hooks e cria estrutura de diretórios
  - ✓ projeto limpo → 9 skills em `.claude/skills/atomic-flow/`, SQLite em `.ai/atomic-flow.db`, hooks em `.claude/settings.json`, `.ai/features/` criado
  - ✗ Node < 18 → erro "Node.js >= 18 required", exit 1

- **RF02:** Skills renderizadas com template vars e instaladas no namespace `atomic-flow:`
  - ✓ skill `1-research.md` renderizada → `.claude/skills/atomic-flow/1-research/SKILL.md` com `{{BASH_TOOL}}` substituído por `Bash`
  - ✗ template var não substituída no output → var permanece como `{{BASH_TOOL}}` literal

- **RF03:** `npx @henryavila/atomic-flow uninstall` remove skills, hooks, SQLite e diretório `.ai/features/`
  - ✓ remove tudo, projeto volta ao estado pré-install
  - ✗ features com tracking ativo (phase != done) → avisa e pede confirmação

- **RF04:** Manifest em `.atomic-flow/manifest.json` rastreia arquivos instalados com hashes
  - ✓ reinstalação com arquivo não modificado → sobrescreve silenciosamente
  - ✗ arquivo modificado localmente + package mudou → prompt: overwrite/keep/diff

- **RF04b:** `atomic-flow install` configura MCP server em `.mcp.json` para expor tools nativos no Claude Code
  - ✓ `.mcp.json` criado com server `atomic-flow` apontando para `node_modules/@henryavila/atomic-flow/src/mcp-server.js`
  - ✓ MCP tools disponíveis: gate_approve, preflight, status, transition, new_feature, validate_spec, task_done, learn, reconcile, open_ui
  - ✓ tools lazy-loaded (só carregam schema quando invocados — ~95% economia de contexto)
  - ✗ MCP server falha ao iniciar → erro com diagnóstico (SQLite ausente? Node versão?)

- **RF04c:** Fases podem ser ativadas por skill explícita OU por conversa natural com a AI
  - ✓ explícito: `/atomic-flow:1-research "autenticação"` → skill ativada diretamente
  - ✓ natural: "quero implementar autenticação" → AI detecta intent, invoca skill internamente
  - ✓ ambos os caminhos resultam no mesmo fluxo (MCP new_feature → worktree → research)
  - ✗ AI ativa fase sem feature existente → MCP retorna erro, skill orienta criar feature primeiro

- **RF04d:** Cada feature roda em git worktree isolado, criado e gerenciado de forma transparente ao usuário
  - ✓ MCP `new_feature` cria worktree via `git worktree add` automaticamente
  - ✓ AI usa `EnterWorktree` (tool nativo do Claude Code) para entrar no worktree — usuário não percebe
  - ✓ `.ai/` e SQLite criados dentro do worktree (isolados por feature)
  - ✓ ship (Fase 7): merge branch do worktree → cleanup → `ExitWorktree`
  - ✗ worktree já existe para a feature → entra no existente, não cria novo
  - ✗ merge conflict no ship → reporta ao humano para resolver manualmente

### Feature Lifecycle

- **RF05:** Criação de feature via MCP `new_feature` — ID sequencial, worktree isolado, estrutura de diretórios
  - ✓ primeira feature → worktree criado, `.ai/features/001-{name}/` com tracking.md + spec.md template
  - ✓ terceira feature → `003-{name}` (auto-incremento lido do SQLite do repo principal)
  - ✓ chamado internamente pela skill ou por conversa natural — usuário nunca roda CLI para isso
  - ✗ nome com caracteres inválidos → erro com sugestão de slug válido

- **RF06:** Transições de fase são enforçadas pelo SQLite — transições inválidas são impossíveis
  - ✓ research → spec → aceito (transição válida)
  - ✓ spec → decompose com G1 approved → aceito
  - ✗ spec → implement (pula decompose) → trigger RAISE(ABORT), transição bloqueada
  - ✗ decompose → implement com G2 pending → trigger RAISE(ABORT), gate não aprovado

- **RF07:** Gates (G1, G2, G3) requerem aprovação humana explícita via CLI ou skill
  - ✓ humano executa `atomic-flow gate approve G1` → gate atualizado no SQLite, transição habilitada
  - ✗ AI tenta aprovar gate via edição de markdown → SQLite não reflete, transição continua bloqueada
  - ✗ gate rejeitado → fase volta à anterior, motivo registrado no SQLite

- **RF07b:** `atomic-flow preflight G{N}` roda checks automáticos antes de cada gate e apresenta flags na UI
  - ✓ G1 preflight: Layer 1 (6 checks estruturais) + Layer 3 (8 dimensões AI) → lista de flags
  - ✓ G2 preflight: contract-RF cross-reference (AI semântico) + task atomicidade (>3 files?) + colisão de arquivos entre tasks + dependências cíclicas + spec delta desde G1 + TCs faltando para novos contratos
  - ✓ G3 preflight: convergence check (CRITICAL+HIGH diminuindo?) + spec completude (todos RF implementados?) + drift detection (spec_hash) + orphan detection (files não declarados)
  - ✓ resultado mostrado na UI `/feature/:id` com flags acionáveis (link para arquivo/trecho relevante)
  - ✓ checks determinísticos (atomicidade, colisão, deps, delta, TCs) = 100% confiável
  - ✓ checks AI (contract-RF cross-ref, completude) = pré-processado, humano valida flags
  - ✗ zero flags → approve rápido com confiança
  - ✗ flags pendentes não resolvidos → `atomic-flow gate approve` mostra warning "N flags unresolved"

### Spec & Validation

- **RF08:** `atomic-flow ui` abre Local UI no browser — server único para dashboard, review e detalhe de feature
  - ✓ abre localhost em porta livre com 3 páginas: `/dashboard`, `/feature/:id`, `/review/:id`
  - ✓ dados lidos do SQLite via sql.js
  - ✗ porta em uso → tenta próxima porta
  - ✗ SQLite ausente → erro com instrução de rodar install primeiro

- **RF09:** Página `/dashboard` mostra overview de todas as features com progresso visual
  - ✓ lista features com: nome, fase atual, barra de progresso (tasks done/total), gates (✅⏳❌)
  - ✓ última atualização por feature, total de learnings acumulados
  - ✓ cross-feature queries (features in_progress, taxa de strikes, features com drift)
  - ✗ zero features → mensagem "Nenhuma feature. Crie com atomic-flow new <name>"

- **RF10:** Página `/feature/:id` mostra detalhe de uma feature
  - ✓ diagrama de fases (qual ativa, quais concluídas)
  - ✓ tabela de tasks (status, strikes, commit)
  - ✓ gates com timestamp + quem aprovou
  - ✓ learnings desta feature
  - ✓ link para `/review/:id` (annotation tool)
  - ✗ feature ID não existe → erro 404 com lista de features válidas

- **RF11:** Página `/review/:id` é a annotation tool para revisão humana de spec (Layer 2)
  - ✓ spec renderizada como HTML (marked.js), seleção de texto + comentário + salvar
  - ✓ anotações persistem no SQLite com line_start, line_end, selected_text, comment, status
  - ✓ re-abrir com anotações existentes (highlights visíveis, resolved atenuados)
  - ✓ edição/exclusão de comentários, filtro por status, dark mode
  - ✗ spec file não existe → erro com path
  - ✗ browser não abre automaticamente → mostra URL no terminal (acessível via Tailscale/port forward/IP remoto)

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
  - ✗ CRITICAL encontrado → bloqueia G1, volta para Layer 2
  - ✗ AI gera 0 findings → FAIL (rubber-stamping, anti-sycophancy violado)

### Decompose & Tasks

- **RF14:** Contracts-first como primeiro step do decompose — interfaces/DTOs commitados antes de tasks
  - ✓ contracts gerados da spec validada → commitados no source tree
  - ✓ registrados no SQLite (tabela tasks com type=contract)
  - ✗ contract sem interface pública → WARN

- **RF15:** Tasks são arquivos individuais (~40-80 linhas) com contexto self-contained
  - ✓ cada task em `.ai/features/NNN/tasks/T1-name.md` com YAML frontmatter (id, files, deps, status)
  - ✓ index.md gerado do SQLite (tabela compacta de status)
  - ✗ task sem Test Contracts → FAIL no Layer 1 da task

### Implement & Learning

- **RF16:** SessionStart hook injeta estado da feature ativa do SQLite no contexto do Claude
  - ✓ sessão nova com feature ativa → mostra: phase, task atual, gates, 3 rules da fase
  - ✓ rules mudam por fase (research=read-only, implement=test-first, review=no-new-features)
  - ✗ nenhuma feature ativa → mensagem informativa, sem erro

- **RF17:** PreToolUse hook enforça file scoping em 3 tiers lendo do SQLite
  - ✓ arquivo na task atual → permitido
  - ✓ arquivo na spec da feature mas não nesta task → WARNING com mensagem
  - ✗ arquivo fora da feature → HARD BLOCK (exit 2)

- **RF18:** Learning loop após cada task: AAR micro-retro → revise pending tasks
  - ✓ após task done → append learnings ao SQLite (decisions, interface changes, constraints, patterns)
  - ✓ scan de pending tasks com deps na task concluída → sugerir revisões
  - ✓ revisões mecânicas (paths, signatures) → auto-update task file
  - ✗ revisões de julgamento (escopo, arch) → flag HUMAN-GATE, não aplica automaticamente

- **RF19:** Recovery em 4 níveis progressivos quando task falha
  - ✓ R1 Retry com contexto: reescrever prompt com mais contexto (stacktrace, arquivo, padrão existente) — 1ª falha, geralmente falta de contexto
  - ✓ R2 Rollback ao checkpoint: `git checkout .` → re-prompt com abordagem diferente — 2ª falha, abordagem errada
  - ✓ R3 Subagent de investigação: spawnar subagent focado no problema, voltar com diagnóstico — problema sistêmico ou área desconhecida
  - ✗ R4 Escalar ao humano: 3 strikes → task status=failed no SQLite, documentar o que tentou e falhou, humano decide

### Review & Ship

- **RF20:** Convergence rule no review — CRITICAL+HIGH deve diminuir a cada round
  - ✓ round 1: 3 CRITICAL → round 2: 1 CRITICAL → convergindo
  - ✗ round 2: 4 CRITICAL (aumentou) → rollback, re-prompt do zero
  - ✗ 3 rounds sem convergência → aceitar com ressalvas ou rollback feature

- **RF21:** Reconcile verifica integridade feature vs filesystem antes de ship
  - ✓ todos gates approved + todas tasks done + spec_hash match + zero orphans → OK
  - ✗ spec_hash mismatch → DRIFT (spec mudou após decompose)
  - ✗ arquivo declarado em task não existe no repo → DRIFT
  - ✗ arquivo no git diff não declarado em nenhuma task → ORPHAN

### Utilitários

- **RF22:** `atomic-flow status` lê do SQLite e exporta tracking.md atualizado
  - ✓ mostra: feature, phase, gates, tasks (status table), learnings count
  - ✓ exporta tracking.md para `.ai/features/NNN/tracking.md` (git-trackable)
  - ✗ SQLite ausente → regenera do tracking.md existente

---

## Regras de Negócio

- **RN01:** Skills usam template vars (`{{BASH_TOOL}}`, `{{READ_TOOL}}`, etc.) — nunca hardcode
  - ✓ skill renderizada substitui todas template vars para a IDE alvo
  - ✗ skill contém nome de tool hardcoded → falha no teste de estrutura

- **RN02:** Cada skill segue a estrutura com 5 seções obrigatórias
  - ✓ S1 Iron Law: regra inviolável no topo (ex: "NO FIX WITHOUT ROOT CAUSE")
  - ✓ S2 HARD-GATE: paradas obrigatórias antes de ações perigosas (ex: "Se prestes a criar código sem teste: STOP")
  - ✓ S3 Process: passos do processo com instruções concretas
  - ✓ S4 Red Flags: pensamentos que indicam atalho (ex: "Já sei, vou direto ao código")
  - ✓ S5 Rationalization table: mapeamento tentação → por que falha
  - ✗ skill sem qualquer dessas seções → falha no teste de estrutura

- **RN03:** Status é LIDO do SQLite, nunca gerado da memória do LLM
  - ✓ skill `atomic-flow:status` instrui AI a ler via CLI/Read, não inventar
  - ✗ status gerado sem consultar SQLite/arquivo → violação da regra fundamental

- **RN04:** Spec contém WHAT/WHY, nunca HOW — enforçado pelo Layer 1
  - ✓ RF/RN com apenas comportamento esperado → passa
  - ✗ RF com `fetchData()` ou `implement` → FAIL automático

- **RN05:** SQLite é source of truth para STATE; markdown é source of truth para CONTENT
  - ✓ phase, gates, task status, annotations → SQLite
  - ✓ spec text, task descriptions, learnings narrative → markdown files
  - ✗ conflito entre SQLite e markdown → SQLite prevalece para state, markdown para content

- **RN06:** Learning loop cap: max 3 ciclos com revisões por feature, max 5 min por ciclo
  - ✓ 2 ciclos consecutivos com 0 revisões → skip futuras revisões
  - ✗ 4º ciclo com revisões → parar, problema é a decomposição

- **RN07:** Annotation tool persiste no SQLite, não em JSON sidecar
  - ✓ anotação com id, line_start, line_end, selected_text, comment, status (open/resolved)
  - ✗ seleção vazia → anotação não criada

---

## Edge Cases

- **EC01:** SQLite corrompido ou ausente
  - ✓ regenera do tracking.md + task files existentes (markdown → SQLite hydration)

- **EC02:** Duas sessions Claude simultâneas na mesma feature
  - ✓ SQLite WAL mode permite leituras concorrentes, write serializado

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

---

## Arquivos Envolvidos

- `package.json` — novo — npm package definition (dep: sql.js, inquirer)
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
- `src/prompts.js` — novo — implementation — CLI prompts via inquirer
- `src/ui-server.js` — novo — implementation — Local UI HTTP server (dashboard + review)
- `src/ui/dashboard.html` — novo — implementation — overview de todas features
- `src/ui/feature.html` — novo — implementation — detalhe de uma feature
- `src/ui/review.html` — novo — implementation — annotation tool
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
- `templates/tracking.md` — novo — implementation — template de tracking export
- `templates/spec.md` — novo — implementation — template de spec
- `templates/task.md` — novo — implementation — template de task file
- `templates/hooks.json` — novo — implementation — hooks de SessionStart + PreToolUse
- `meta/skills.yaml` — novo — implementation — catálogo de skills
- `meta/schema.sql` — novo — contract — schema SQLite com triggers

## Decisões Tomadas

- **Self-contained:** Copiar ~155 linhas de infra do atomic-skills. Razão: zero conteúdo compartilhado.
- **SQLite (sql.js WASM):** Enforcement no nível do dado via triggers. Markdown sozinho não enforça. Zero compilação nativa.
- **Só Claude Code MVP:** Menor superfície de teste. Multi-IDE v1.1.
- **Só EN MVP:** Foco na qualidade do conteúdo.
- **7 fases (não 6):** Fase ③ SPEC VALIDATE adicionada. FORGE: rework 30-50% → <15%.
- **Annotation tool no MVP:** Layer 2 é crítico. SQLite-backed.
- **Individual task files (40-80 linhas):** TDAD Paper: 20 linhas > 107 linhas (4x resolução). BMAD #2003: títulos = código superficial.
- **Namespace colon:** `atomic-flow:1-research` (convenção do ecossistema).
- **Learning loop:** AAR micro-retro + revise pending tasks. Stanford MemoryArena valida.
- **File scoping 3-tier:** task=allow, feature=warn, outside=block.
- **Contracts-first no decompose:** Spec é pure WHAT (sem code). Contracts derivam da spec validada.
- **Hybrid SQLite+Markdown:** SQLite=state enforcement, Markdown=content+git. Padrão Beads (18.7K stars).

## Alternativas Rejeitadas

- **Depender de atomic-skills:** Coupling para 155 linhas de infra.
- **Markdown-only tracking:** Sem enforcement de dados. AI pode editar frontmatter livremente.
- **better-sqlite3:** Compilação nativa falha em Windows sem build tools, Node não-LTS.
- **Application-level enforcement (sem SQLite):** Sem ACID, sem cross-feature queries, sem triggers.
- **7 IDEs no MVP:** Aumenta superfície de teste.
- **Phase subdirectories:** 0 de 6 tools usa. Fases = frontmatter, não dirs.
- **Tasks em single file:** Após /clear, AI precisa de contexto self-contained por task.
- **Prefix `af1-` ou `atomic-flow-1-`:** Não segue convenção de colon namespace.
- **Contracts na fase spec:** Hook bloquearia código. Contracts derivam da spec validada.
- **JSON sidecar para annotations:** SQLite já existe, integração natural.

## Test Contracts

### RF01: Install
- **TC-RF01-1** [business]: {projeto limpo, node >= 18} → {9 skills, SQLite inicializado com schema, hooks merged, .ai/features/ criado}
- **TC-RF01-2** [error]: {node < 18} → {stderr: "Node.js >= 18 required", exit 1}
- **TC-RF01-3** [edge]: {projeto já tem atomic-flow} → {3-hash conflict detection, prompt overwrite/keep}

### RF02: Skill rendering
- **TC-RF02-1** [business]: {skill com {{BASH_TOOL}}} → {output: "Bash", sem "{{BASH_TOOL}}"}
- **TC-RF02-2** [boundary]: {skill com {{#if ide.gemini}}} → {bloco removido para claude-code}

### RF04b: MCP Server
- **TC-RF04b-1** [business]: {install completo} → {`.mcp.json` existe, MCP server inicia, tools listados}
- **TC-RF04b-2** [business]: {AI chama mcp gate_approve("G1")} → {SQLite atualizado, transição habilitada}
- **TC-RF04b-3** [error]: {MCP server sem SQLite} → {erro descritivo: "Run atomic-flow install first"}

### RF04c: Dual activation
- **TC-RF04c-1** [business]: {user invoca /atomic-flow:1-research "auth"} → {skill ativada, feature criada}
- **TC-RF04c-2** [business]: {user diz "quero implementar auth"} → {AI detecta intent, invoca skill}
- **TC-RF04c-3** [edge]: {user diz "implementar auth" sem feature existente} → {MCP cria feature, depois ativa research}

### RF04d: Worktree transparente
- **TC-RF04d-1** [business]: {MCP new_feature("auth")} → {worktree criado, AI entra via EnterWorktree, user não percebe}
- **TC-RF04d-2** [business]: {ship concluído} → {branch merged, worktree removido, AI volta via ExitWorktree}
- **TC-RF04d-3** [edge]: {worktree já existe} → {entra no existente}
- **TC-RF04d-4** [error]: {merge conflict no ship} → {reporta ao humano}

### RF05: New feature
- **TC-RF05-1** [business]: {atomic-flow new "user-login"} → {.ai/features/001-user-login/ criado com tracking.md + spec.md template}
- **TC-RF05-2** [boundary]: {3ª feature criada} → {ID = 003}
- **TC-RF05-3** [error]: {nome "user login!@#"} → {erro + sugestão "user-login"}

### RF06: Phase transitions
- **TC-RF06-1** [business]: {phase=spec, G1=approved, transition to decompose} → {SQLite updated, phase=decompose}
- **TC-RF06-2** [error]: {phase=spec, transition to implement} → {RAISE(ABORT): "Invalid phase transition"}
- **TC-RF06-3** [error]: {phase=decompose, G2=pending, transition to implement} → {RAISE(ABORT): "Gate G2 not approved"}
- **TC-RF06-4** [boundary]: {phase=review, transition to implement} → {aceito (rework loop válido)}

### RF07: Gates
- **TC-RF07-1** [business]: {atomic-flow gate approve G1} → {SQLite: gates.status = approved}
- **TC-RF07-2** [error]: {gate reject G2} → {SQLite: status=rejected, phase volta a anterior}
- **TC-RF07-3** [edge]: {AI edita tracking.md para "G1: approved"} → {SQLite não reflete, transição bloqueada}

### RF07b: Preflight checks
- **TC-RF07b-1** [business]: {preflight G2, task T4 com 5 arquivos} → {flag: "T4 tem 5 arquivos, SPLIT recomendado"}
- **TC-RF07b-2** [business]: {preflight G2, T3 e T5 editam User.php} → {flag: "COLISÃO: T3 e T5 compartilham User.php"}
- **TC-RF07b-3** [business]: {preflight G2, contrato com refund() vs RF03 "não-reembolsável"} → {flag: "CONFLICT: refund() contradiz RF03"}
- **TC-RF07b-4** [business]: {preflight G2, zero problemas} → {0 flags, approve habilitado}
- **TC-RF07b-5** [edge]: {preflight G2, dependência cíclica T2→T3→T5→T2} → {flag: "CICLO de dependência"}
- **TC-RF07b-6** [boundary]: {approve G2 com flags pendentes} → {warning "3 flags unresolved", approve permitido mas registrado}

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
- **TC-RF10-2** [business]: {link para /review/001} → {navega para annotation tool}
- **TC-RF10-3** [error]: {/feature/999} → {404 com lista de features válidas}

### RF11: Annotation tool (review)
- **TC-RF11-1** [business]: {/review/001} → {spec renderizada, seleção + comentário funciona}
- **TC-RF11-2** [business]: {salvar anotação} → {SQLite: annotations row com line_start, selected_text, comment, status=open}
- **TC-RF11-3** [edge]: {reabrir com anotações existentes} → {highlights visíveis, resolved atenuados}
- **TC-RF11-4** [boundary]: {spec 500+ linhas com emoji} → {renderiza corretamente}
- **TC-RF11-5** [edge]: {acesso remoto via Tailscale/port forward} → {UI completa funciona via IP remoto, anotações salvam no SQLite normalmente}

### RF12: Layer 1 validation
- **TC-RF09-1** [business]: {spec completa, sem violações} → {6/6 checks PASS}
- **TC-RF09-2** [error]: {RF sem ✓/✗} → {FAIL: "RF03 não tem critério de aceitação"}
- **TC-RF09-3** [error]: {weak word "should" em critério} → {FAIL: "Critério deve ser determinístico"}
- **TC-RF09-4** [error]: {`fetchData()` em RF} → {FAIL: "Código não pertence à spec"}

### RF16: SessionStart hook
- **TC-RF16-1** [business]: {sessão nova, feature 001 ativa, phase=implement, T3 in_progress} → {output contém: phase, task atual, gates, 3 rules de implement}
- **TC-RF16-2** [edge]: {nenhuma feature ativa} → {mensagem informativa}
- **TC-RF16-3** [boundary]: {spec_hash drift detectado} → {output contém WARNING DRIFT}

### RF17: File scoping
- **TC-RF17-1** [business]: {Write em arquivo declarado na task} → {permitido, exit 0}
- **TC-RF17-2** [business]: {Write em arquivo da feature mas não da task} → {WARNING mostrado, permitido}
- **TC-RF17-3** [error]: {Write em arquivo fora da feature} → {exit 2, BLOCKED}

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
