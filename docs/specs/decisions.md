---
name: Problems and Solutions
description: Issues raised by user during spec design, with solutions — essential for handoff
type: project
---

## P1: Spec cobria só o installer, não o método
**Problema:** Spec inicial tinha RFs apenas para instalar skills. O projeto é um ENFORCER de metodologia, não um installer.
**Solução:** Reescrever spec com 3 camadas (método + enforcer + distribuição). 22 RFs cobrindo enforcement via SQLite, hooks, MCP.
**How to apply:** Toda decisão de spec deve verificar: "isso cobre enforcement, não só instalação?"

## P2: Dependency do atomic-skills desnecessária
**Problema:** Planejávamos depender do atomic-skills para render.js+config.js (~155 linhas).
**Solução:** Self-contained. Zero conteúdo compartilhado. 155 linhas não justifica npm dep.
**Análise:** reference/atomic-flow-dependency-analysis.md

## P3: Spec não era machine-parseable
**Problema:** Formato antigo separava RF de critérios. Impossível validar "RF01 tem critério?"
**Solução:** Formato inline com ✓/✗ sob cada requisito. Test Contracts vinculados por ID.
**Regra:** Todo RF deve ter ≥1 ✓ e ≥1 ✗. Todo RF/RN deve ter ≥1 TC.

## P4: Fase VALIDATE não existia
**Problema:** METHOD-NATIVE.md ia direto de SPEC para DECOMPOSE. Contradiz regra 70/30.
**Solução:** Nova fase ③ SPEC VALIDATE com 3 layers (determinístico → humano → AI).
**Evidência:** FORGE: rework caiu 30-50% → <15% com spec review formal.

## P5: Layer 2 era AI-guiada (deveria ser humano-led)
**Problema:** Propus 5 perguntas guiadas pela AI no Layer 2. Isso é papel do Layer 3.
**Solução:** Layer 2 = humano lê spec na annotation tool, anota, AI discute UM A UM.
**Regra:** AI NÃO faz perguntas guiadas no Layer 2. Só apresenta trecho, discute, ajusta.

## P6: Validation results em arquivo separado
**Problema:** Inicialmente resultados iriam no tracking.md.
**Solução:** Resultados ficam NA PRÓPRIA spec.md (seção Validation). One file = all truth.

## P7: Tasks com 5 linhas são insuficientes
**Problema:** BMAD Issue #2003: agent recebe "only task titles" → código superficial.
**Solução:** Task files individuais, 40-80 linhas, self-contained. YAML frontmatter.
**Evidência:** TDAD Paper: 20 linhas > 107 linhas (4x resolução).

## P8: Sem learning loop entre tasks
**Problema:** Implement → done → next task. Sem capturar learnings nem revisar pending tasks.
**Solução:** AAR micro-retro (2-3 min) → save learnings → scan+revise pending tasks.
**Safeguards:** Max 3 ciclos, max 5 min, 2 ciclos com 0 revisões → skip.
**Evidência:** Stanford MemoryArena, LangGraph replanner, PDCA (61% defect reduction).

## P9: Markdown não enforça state transitions
**Problema:** AI pode editar frontmatter do tracking.md livremente. Zero enforcement.
**Solução:** SQLite com triggers BEFORE UPDATE + RAISE(ABORT). Enforcement no nível do dado.
**Decisão:** sql.js (WASM, zero compilação) como backend. Markdown = export para git.

## P10: File scoping — hard block vs warning
**Problema:** Hard block trava fluxo legítimo. Warning puro = 80% compliance.
**Solução:** 3 tiers: task scope=allow, feature scope=warn, outside feature=hard block.

## P11: Contracts-first bloqueado pelo hook durante spec
**Problema:** Hook bloqueia código no source tree durante spec. Mas contracts SÃO código.
**Solução:** Contracts movem para primeiro step do DECOMPOSE (após G1). Spec marca `contract` vs `implementation`. Hook permite contracts durante decompose.
**Regra:** Decompose pode ADD à spec (novos contracts+TCs), nunca MODIFY RFs existentes.

## P12: Novo contrato contradiz RF existente — como detectar?
**Problema:** Contradição semântica entre contrato e spec não é detectável por hooks.
**Solução:** 5 camadas de defesa: hook (structural) → skill cross-reference → Layer 3 D1 re-run → G2 humano → learning loop no implement. Nenhuma é 100% para semântica, mas sobrepostas reduzem risco.

## P13: G2 review — humano lê 600 linhas
**Problema:** Tasks + contracts + spec changes = massa de texto. Humano skim → perde bugs.
**Solução:** Preflight automático antes de cada gate. AI pré-processa e apresenta FLAGS. Humano revisa só flags. Zero flags → approve rápido.
**Checks G2:** contract-RF cross-ref, atomicidade, colisão, deps cíclicas, spec delta, TCs faltando.

## P14: CLI como interface — user sai do Claude Code
**Problema:** `atomic-flow gate approve G1` requer sair do Claude, rodar no shell, voltar.
**Solução:** MCP Server como backend. Skills chamam MCP tools internamente. User nunca sai do Claude Code. CLI só para setup (install) e browser (ui).

## P15: Skills como ÚNICO caminho de ativação
**Problema:** Propus que só `/atomic-flow:1-research` ativasse fases.
**Solução:** Dual activation: slash command OU conversa natural. Superpowers v5 faz isso.

## P16: Worktree visível ao usuário
**Problema:** Propus que user rodasse `claude --worktree`. Não é transparente.
**Solução:** MCP `new_feature` cria worktree. AI usa EnterWorktree (tool nativo). User não sabe que está num worktree. Ship: merge + cleanup + ExitWorktree.

## P17: Research era opcional para features triviais
**Problema:** METHOD-NATIVE.md permite pular research para fixes de 1 arquivo.
**Solução:** Atomic Flow é para features significativas. Se usou Atomic Flow, 7 fases obrigatórias. Fix de typo = não usa Atomic Flow.

## P18: RFs com referências genéricas ("8 dimensões", "6 checks")
**Problema:** RF13 dizia "8 dimensões adversariais" sem listar quais. AI implementando vai inventar.
**Solução:** Todo RF que referencia "N itens" lista explicitamente com exemplo de cada um.
**Regra:** Spec deve ser implementável sem ler nenhum outro arquivo (self-contained).

## P19: Skill de research criando worktree (responsabilidade errada)
**Problema:** Propus que `/atomic-flow:1-research` criasse worktree. Research ≠ infra.
**Solução:** Separar responsabilidades: skill = metodologia, MCP = state, hooks = enforcement, worktree = infra interna.

## P20: Gates em todas as transições — de 3 para 7
**Problema:** Método original tinha 3 gates (G1 spec, G2 tasks, G3 review). Transições sem gate (research→spec, implement→review, ship→done) não tinham checkpoint humano.
**Solução:** 7 gates humanos (G1-G7) em todas as transições forward. Backward transitions NÃO têm gate (a decisão humana de voltar já é o gate). Gates NUNCA automáticos — "a disciplina é humana, a AI é a ferramenta".
**Mapeamento:** antigo G1→G3, antigo G2→G4, antigo G3→G6.
**How to apply:** Toda transição forward precisa de gate approved no SQLite. Preflight automático informa, humano decide.

## P21: SQLite topology — DB por worktree vs DB único
**Problema:** SQLite isolado por worktree quebraria dashboard (cross-feature queries), auto-incremento de IDs, e reconcile global. Merge de DBs entre worktrees = complexidade exponencial.
**Solução:** Opção 2 — SQLite único em `.ai/atomic-flow.db` do main repo. Worktrees acessam via caminho absoluto resolvido com `git worktree list --porcelain`. Advisory file lock (`.ai/atomic-flow.db.lock`) para serializar writes (sql.js não tem file-level locking). v1.1: better-sqlite3 com locking nativo.
**How to apply:** Todo acesso ao SQLite deve primeiro resolver o caminho do main repo. Nunca criar/copiar DB dentro de worktree.

## P22: Hard gates de interação AI-humano descobertos durante a entrevista de spec
**Problema:** Sem regras explícitas, a AI: propõe sem pesquisar, auto-aprova, pula requisitos triviais, dá respostas rasas, fabrica do training data, agrupa múltiplas decisões.
**Solução:** 2 protocolos — RN08 (universal, todas as fases): research antes de propor, recomendar com embasamento sem auto-aprovar, um item por vez, grounded no método. RN09 (refinamento/revisão, quando RFs existem): transcrever requisito inteiro, cobrir todos sequencialmente sem pular, análise profunda.
**Contexto:** Descobertos empiricamente — o user enforçou HARD GATEs manuais durante a entrevista, e a qualidade da entrevista foi drasticamente superior. Aplicam-se a Fase ② (criação e refinamento) e Fase ③ (Layer 2).
**How to apply:** RN08 encoded em todas as skills. RN09 encoded em skill `2-spec` (modo refinamento) e `3-validate` (Layer 2). Também adicionar ao METHOD-NATIVE.md como verdades universais.

## P23: Formato das 5 seções de skills — baseado em evidência de prompt engineering
**Problema:** Os termos "HARD GATE", "Iron Law", "Red Flags" eram usados inconsistentemente. Proposta inicial de wrapping tudo em XML tags não tinha base.
**Solução:** Pesquisa profunda revelou o que funciona e o que não:
- Iron Law: markdown code block (destaque visual, não XML) — padrão validado em atomic-skills
- HARD-GATE: `<HARD-GATE>` XML tag — ÚNICA seção em XML (Claude fine-tuned em XML, evidência forte). Formato condicional: "Se prestes a [ação] sem [condição]: PARE"
- Process: markdown numerado, framing positivo ("faça X" não "não faça X") — Pink Elephant Problem
- Red Flags: lista em primeira pessoa ("Já sei a resposta...") — few-shot negativo, Reflexion framework
- Rationalization table: markdown 2 colunas (Tentação | Por que falha) — pré-inoculação
- Max 3-5 regras core por skill — CSDD Paper: 96% compliance vs 78% com muitas regras
- ALL CAPS: Anthropic recomenda REDUZIR para Claude 4.6 (causa overtriggering)
**How to apply:** RN02 atualizado com formato preciso de cada seção. Skills criadas durante implementação DEVEM seguir esses formatos. Referência para o implementador.

## P24: Output estruturado do método precisa de padrão visual consistente
**Problema:** Skills do atomic-flow apresentam informação estruturada ao usuário em múltiplas fases (findings de validação, resultados de preflight, análise de review, status). Sem padrão visual, cada skill formata de forma diferente — o usuário não consegue escanear rapidamente e a experiência degrada.
**Solução:** Padrão de blocos: blockquote (`>`) + emoji + bold como header de cada seção lógica. Vocabulário fechado de 14 emojis com propósito definido (🔴 problema, 🔍 análise, ✏️ proposta, ✅ resultado, 🟡 warning, etc.). AI seleciona da tabela, nunca inventa. Cada skill define seus blocos específicos, mas o formato visual e o vocabulário são consistentes.
**How to apply:** RN10 define o padrão com vocabulário completo. Skills que apresentam informação estruturada (3-spec-validate, 6-review, gate, status, preflight) DEVEM seguir o formato. O vocabulário é fechado — novos emojis requerem atualização de RN10.

## P25: spec_hash referenciado em 6+ locais mas nunca formalmente definido
**Problema:** `spec_hash` aparece em RF07b, RF21, RF22, EC05, TC-RF16-3, TC-RF21-2 mas nenhum RF ou RN definia: o que é hashado, quando é computado, onde é armazenado, como atualizações legítimas evitam falsos positivos de drift.
**Solução:** RN11 define spec_hash como SHA-256 de RF+RN+EC (seções que geram tasks). Baseline em G3. Comparado em 4 pontos (SessionStart, G5, G6, G7). Drift legítimo requer atualização explícita do hash + registro em decisions.md. Seções fora de RF/RN/EC (Validation, Arquivos, preamble) excluídas do hash para evitar falsos positivos.
**How to apply:** Implementar `src/hash.js` com extração de seções RF+RN+EC antes do hash. SQLite coluna `features.spec_hash` armazena 64 chars, display truncado 8 chars. G7 reconcile falha em mismatch; demais pontos apenas warn.

## P26: Artefatos de feature em `.ai/` são invisíveis para arquitetos e novos devs
**Problema:** Spec, decisions e research-index viviam em `.ai/features/NNN/` — git-tracked mas em diretório dot-prefix. Um arquiteto que faz `ls docs/` não encontra os requisitos. Novo dev que clona o repo não sabe que `.ai/` contém documentação arquitetural valiosa.
**Solução:** Separar artefatos por natureza:
- **Permanentes** (patrimônio do projeto) em `docs/features/NNN/`: spec.md, decisions.md, research-index.md — visíveis, descobríveis, sobrevivem a ship/cancel
- **Efêmeros** (ferramental de trabalho) em `.ai/features/NNN/`: tasks/, tracking.md — deletados no ship, recuperáveis via histórico da branch
**Evidência:** Rust (text/), Go (design/), Kubernetes (keps/), GitHub Spec Kit (specs/) — todos colocam specs em diretórios visíveis do repo desde a criação. ADRs (ThoughtWorks Adopt) em docs/adr/. Nenhum projeto relevante esconde specs em diretórios dot-prefix.
**How to apply:** RF05 atualizado com 2 locais. RF21 deleta `.ai/features/NNN/` no ship. RF05d (cancel) preserva `docs/features/NNN/`. RF03 (uninstall) não remove `docs/features/` nem `docs/research/` — são patrimônio, não ferramental.

## P27: Feature cancellation inexistente — sem mecanismo para abandonar feature individual
**Problema:** Spec cobria criação (RF05) e lifecycle completo (7 fases), mas não havia como cancelar uma feature mid-flight. RF03 (uninstall) remove o sistema inteiro. User que quer abandonar feature 001 não tinha opção.
**Solução:** RF05d: MCP `cancel_feature(id, reason)` com motivo obrigatório. Fluxo: marca cancelled no SQLite + registra em decisions.md + ExitWorktree + deleta branch + deleta .ai/features/NNN/. docs/features/NNN/ e docs/research/ preservados. Dashboard mostra feature com badge "cancelled".
**How to apply:** Adicionar cancel_feature à lista de MCP tools (RF04b). Implementar estado `cancelled` no schema SQLite. Dashboard (RF09) precisa de visual distinto para cancelled vs done.

## P28: Artefatos não tinham commit formalizado — risco de perda em crash de sessão
**Problema:** Commits estavam definidos apenas para IMPLEMENT (micro-commit) e DECOMPOSE (contracts). Research, spec, validação, tasks, review — nenhum tinha commit obrigatório. Sessão de validação inteira quase ficou sem commit — só foi salva por pedido manual do humano.
**Solução:** Gate approve executa commit automático ANTES de registrar aprovação no SQLite. Cada gate commita os artefatos da fase sendo aprovada. Mensagem descritiva: "gate(G{N}): {descrição}". G7 é o merge commit (já era implícito).
**How to apply:** RF07 atualizado com commit automático por gate e lista de artefatos por gate (G1-G7). MCP `gate_approve` deve executar `git add` + `git commit` antes de atualizar SQLite.
