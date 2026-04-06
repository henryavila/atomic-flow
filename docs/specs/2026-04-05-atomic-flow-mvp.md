# Spec: Atomic Flow MVP

Data: 2026-04-05

## Objetivo

Criar o npm package `@henryavila/atomic-flow` que instala a metodologia Atomic Flow (7 fases, tracking determinístico, gates humanos) como skills executáveis para Claude Code, incluindo uma annotation tool para revisão humana de specs.

## Requisitos Funcionais

- **RF01:** `npx @henryavila/atomic-flow install` abre CLI interativo que instala skills, cria diretório de tracking, e merge hooks
  - ✓ projeto sem atomic-flow instalado → instala 9 skills em `.claude/skills/`, cria `.ai/tracking/`, merge hooks em `.claude/settings.json`, cria manifest em `.atomic-flow/manifest.json`
  - ✗ projeto sem node >= 18 → mensagem de erro clara com versão mínima

- **RF02:** Instala 9 skills (af1-research a af7-ship + af-status + af-gate) em `.claude/skills/{skill-name}/SKILL.md`
  - ✓ após install, cada skill existe como `SKILL.md` no diretório correto com YAML frontmatter (name + description)
  - ✗ diretório `.claude/skills/` não existe → cria automaticamente

- **RF03:** Cria diretório `.ai/tracking/` no projeto alvo
  - ✓ diretório criado com template de tracking copiado
  - ✗ `.ai/tracking/` já existe → não sobrescreve, mantém conteúdo existente

- **RF04:** Merge hooks de SessionStart no `.claude/settings.json` do projeto alvo
  - ✓ hooks adicionados ao array SessionStart sem remover hooks existentes do usuário
  - ✗ `.claude/settings.json` não existe → cria com apenas os hooks do atomic-flow
  - ✗ hooks do atomic-flow já existem → não duplica

- **RF05:** `npx @henryavila/atomic-flow uninstall` remove todos os artefatos instalados
  - ✓ remove skills, tracking dir (se vazio), hooks, manifest
  - ✗ tracking dir contém arquivos de feature em progresso → avisa e não remove

- **RF06:** Manifest em `.atomic-flow/manifest.json` rastreia arquivos instalados com hashes SHA-256
  - ✓ manifest criado no install com lista de arquivos + hashes
  - ✗ reinstalação com arquivo localmente modificado → 3-hash conflict detection (installed_hash vs current_hash vs new_hash)

- **RF07:** `npx @henryavila/atomic-flow review <spec.md>` abre annotation tool no browser
  - ✓ abre localhost em porta livre, renderiza Markdown como HTML, permite seleção + comentário, salva JSON sidecar
  - ✗ arquivo não existe → mensagem de erro com path
  - ✗ porta em uso → tenta próxima porta

## Regras de Negócio

- **RN01:** Skills usam template vars (`{{BASH_TOOL}}`, `{{READ_TOOL}}`, etc.) — nunca hardcode de tool names
  - ✓ skill renderizada para Claude Code substitui `{{BASH_TOOL}}` por `Bash`
  - ✗ skill contém nome de tool hardcoded → falha no teste

- **RN02:** Cada skill segue a estrutura: Iron Law, HARD-GATE, Process, Red Flags, Rationalization table
  - ✓ skill tem todas as 5 seções obrigatórias
  - ✗ skill sem Iron Law ou HARD-GATE → falha no teste de estrutura

- **RN03:** Tracking file é lido do filesystem, nunca gerado da memória do LLM
  - ✓ af-status skill instrui a AI a ler `.ai/tracking/{feature}.md` com Read tool
  - ✗ skill pede para AI "reportar status" sem apontar para arquivo → violação

- **RN04:** Gates (G1, G2, G3) requerem aprovação humana explícita — AI não auto-aprova
  - ✓ af-gate skill bloqueia avanço até humano declarar "aprovado"
  - ✗ AI tenta avançar sem aprovação humana → skill contém HARD-GATE que impede avanço

- **RN05:** Reinstalação usa conflict detection 3-hash (installed vs current vs new)
  - ✓ arquivo não modificado localmente → sobrescreve silenciosamente
  - ✓ arquivo modificado localmente, package não mudou → mantém local
  - ✗ ambos mudaram → pergunta ao usuário (overwrite/keep/diff)

- **RN06:** Annotation tool salva anotações como JSON sidecar (`{spec}.annotations.json`)
  - ✓ anotação contém: id, line_start, line_end, selected_text, comment, status
  - ✗ anotação sem selected_text → inválida

- **RN07:** Spec que contém HOW (verbos de implementação, código, nomes de tecnologia) falha no Layer 1 do gate determinístico
  - ✓ spec com apenas WHAT/WHY → passa
  - ✗ spec com `fetchData()` em RF → FAIL

## Edge Cases

- **EC01:** Projeto com `.ai/tracking/` de outro tool (ex: Kiro)
  - ✓ detecta presença, avisa, e não sobrescreve

- **EC02:** settings.json com JSON inválido
  - ✓ reporta erro, não corrompe o arquivo

- **EC03:** Install interrompido pelo usuário (Ctrl+C)
  - ✓ cleanup de arquivos parcialmente escritos, nenhum artefato órfão

- **EC04:** Annotation tool — browser não abre automaticamente
  - ✓ mostra URL no terminal para o usuário abrir manualmente

- **EC05:** Annotation tool — spec com caracteres especiais (emoji, unicode)
  - ✓ renderiza corretamente, line numbers se mantêm consistentes

## Arquivos Envolvidos

- `package.json` — novo — npm package definition
- `bin/cli.js` — novo — CLI entry point (install/uninstall/review)
- `src/install.js` — novo — lógica de instalação
- `src/uninstall.js` — novo — lógica de remoção
- `src/render.js` — novo (copiado de atomic-skills) — template rendering engine
- `src/config.js` — novo (copiado de atomic-skills) — IDE registry
- `src/hash.js` — novo (copiado de atomic-skills) — SHA-256 utility
- `src/manifest.js` — novo — persistência de manifest
- `src/yaml.js` — novo (copiado de atomic-skills) — YAML parser
- `src/prompts.js` — novo — CLI prompts via inquirer
- `src/review-server.js` — novo — annotation tool HTTP server
- `src/review-ui/index.html` — novo — annotation tool frontend
- `src/review-ui/style.css` — novo — annotation tool styles
- `src/review-ui/app.js` — novo — annotation tool logic
- `skills/en/af1-research.md` a `af7-ship.md` — novo — 7 skills de fase
- `skills/en/af-status.md` — novo — skill utilitária
- `skills/en/af-gate.md` — novo — skill utilitária
- `templates/tracking.md` — novo — template do tracking file
- `templates/spec.md` — novo — template da spec
- `templates/hooks.json` — novo — hooks de SessionStart
- `meta/skills.yaml` — novo — catálogo de skills

## Decisões Tomadas

- **Self-contained:** Copiar ~155 linhas de infra do atomic-skills em vez de npm dep. Razão: nenhum conteúdo compartilhado, 155 linhas não justifica dep. Análise completa: `reference/atomic-flow-dependency-analysis.md`
- **Só Claude Code no MVP:** Menor superfície de teste. Multi-IDE no v1.1.
- **Só EN no MVP:** Foco na qualidade do conteúdo. PT quando skills estabilizarem.
- **7 fases (não 6):** Fase ③ VALIDATE adicionada. Pesquisa: spec review dedicado reduz rework de 30-50% → <15% (FORGE).
- **Annotation tool no MVP:** Experiência de Layer 2 é crítica. Sem tool, revisão humana é lossy.
- **Formato spec machine-parseable:** ✓/✗ inline + Test Contracts. Permite gate determinístico.

## Alternativas Rejeitadas

- **Depender de atomic-skills como npm dep:** Coupling desnecessário para 155 linhas de infra
- **7 IDEs no MVP:** Custo zero de código, mas aumenta superfície de teste
- **Annotation via markdown comments (`<!-- REVIEW: -->`):** Polui o arquivo da spec
- **6 fases (sem VALIDATE):** Contradiz regra 70/30 e evidência de FORGE/Superpowers

## Test Contracts

### RF01: Install
- **TC-RF01-1** [business]: {projeto limpo, node >= 18} → {9 skills em .claude/skills/, .ai/tracking/ criado, hooks merged, manifest criado}
- **TC-RF01-2** [error]: {node < 18} → {stderr contém "Node.js >= 18 required", exit code 1}
- **TC-RF01-3** [edge]: {projeto já tem atomic-flow instalado} → {3-hash conflict detection, pergunta overwrite/keep}

### RF02: Skill installation
- **TC-RF02-1** [business]: {install com IDE claude-code} → {cada skill existe em .claude/skills/{name}/SKILL.md com frontmatter válido}
- **TC-RF02-2** [boundary]: {skill com {{BASH_TOOL}} template var} → {renderizada como "Bash" no output}

### RF03: Tracking directory
- **TC-RF03-1** [business]: {projeto sem .ai/tracking/} → {diretório criado}
- **TC-RF03-2** [edge]: {.ai/tracking/ já existe com features} → {não sobrescreve, conteúdo preservado}

### RF04: Hooks merge
- **TC-RF04-1** [business]: {settings.json sem hooks} → {SessionStart hook adicionado}
- **TC-RF04-2** [edge]: {settings.json com hooks existentes} → {hooks do atomic-flow adicionados ao array, hooks do usuário preservados}
- **TC-RF04-3** [error]: {settings.json com JSON inválido} → {erro reportado, arquivo não corrompido}

### RF05: Uninstall
- **TC-RF05-1** [business]: {atomic-flow instalado} → {skills removidas, hooks removidos, manifest removido}
- **TC-RF05-2** [edge]: {tracking dir com features em progresso} → {aviso, dir não removido}

### RF06: Manifest
- **TC-RF06-1** [business]: {após install} → {manifest.json contém lista de files com installed_hash}
- **TC-RF06-2** [boundary]: {reinstall, arquivo modificado localmente} → {conflict detection: installed_hash ≠ current_hash ≠ new_hash → prompt}

### RF07: Annotation tool
- **TC-RF07-1** [business]: {spec.md existe} → {browser abre, Markdown renderizado como HTML, seleção + comentário funciona, JSON salvo}
- **TC-RF07-2** [error]: {spec.md não existe} → {stderr com path, exit code 1}
- **TC-RF07-3** [edge]: {porta default em uso} → {tenta próxima porta, abre com sucesso}
- **TC-RF07-4** [boundary]: {spec com 500+ linhas, emoji, tabelas} → {renderiza corretamente, line numbers consistentes}

### RN01: Template vars
- **TC-RN01-1** [business]: {skill com {{BASH_TOOL}}} → {output contém "Bash", não contém "{{BASH_TOOL}}"}
- **TC-RN01-2** [error]: {skill com hardcoded "Bash tool"} → {falha no teste de estrutura}

### RN02: Skill structure
- **TC-RN02-1** [business]: {skill af1-research.md} → {contém seções: Iron Law, HARD-GATE, Red Flags, Rationalization table}
- **TC-RN02-2** [error]: {skill sem seção Iron Law} → {teste de estrutura falha com "Missing required section: Iron Law"}
- **TC-RN02-3** [boundary]: {skill com HARD-GATE mas sem conteúdo dentro do bloco} → {teste falha com "Empty HARD-GATE section"}

### RN03: Tracking file lido, nunca gerado
- **TC-RN03-1** [business]: {af-status skill executada com .ai/tracking/feature.md existindo} → {output contém dados lidos do arquivo, não inventados}
- **TC-RN03-2** [error]: {af-status skill executada sem tracking file} → {skill instrui: "Nenhum tracking file encontrado em .ai/tracking/"}
- **TC-RN03-3** [edge]: {skill text contém instrução de ler com Read tool} → {grep no .md encontra "Read" ou "{{READ_TOOL}}", não encontra "report from memory"}

### RN04: Gates requerem aprovação humana
- **TC-RN04-1** [business]: {af-gate skill executada, humano diz "aprovado"} → {gate status atualizado para approved no tracking file}
- **TC-RN04-2** [error]: {af-gate skill executada, humano diz "rejeitado"} → {gate status atualizado para rejected, skill indica próximo passo (voltar à fase anterior)}
- **TC-RN04-3** [edge]: {skill text contém bloqueio explícito} → {grep no .md encontra "STOP" ou "HARD-GATE" antes de auto-aprovação}

### RN05: 3-hash conflict
- **TC-RN05-1** [business]: {installed_hash == current_hash, new_hash diferente} → {sobrescreve silenciosamente}
- **TC-RN05-2** [business]: {installed_hash ≠ current_hash, installed_hash == new_hash} → {mantém local}
- **TC-RN05-3** [boundary]: {todos os 3 hashes diferentes} → {prompt: overwrite/keep/diff}

### RN06: Annotation JSON sidecar
- **TC-RN06-1** [business]: {humano seleciona trecho e salva comentário} → {JSON contém: id, line_start, line_end, selected_text, comment, status:"open"}
- **TC-RN06-2** [error]: {seleção vazia (sem texto selecionado)} → {botão de comentário desabilitado, anotação não criada}
- **TC-RN06-3** [edge]: {re-abrir spec com anotações existentes} → {anotações carregadas do JSON, trechos highlighted, status preservado}
- **TC-RN06-4** [boundary]: {marcar anotação como resolved} → {status muda para "resolved", highlight visual muda (atenuado)}

### RN07: Spec implementation-free
- **TC-RN07-1** [business]: {spec com apenas WHAT/WHY em RF/RN/EC} → {Layer 1 check 3 retorna PASS}
- **TC-RN07-2** [error]: {spec com `fetchData()` dentro de RF} → {Layer 1 retorna FAIL com "Código não pertence à spec" + linha}
- **TC-RN07-3** [error]: {spec com "implement" dentro de RN} → {Layer 1 retorna FAIL com "Verbo de implementação" + linha}
- **TC-RN07-4** [edge]: {spec com "REST" dentro de RF} → {Layer 1 retorna WARN, humano decide}

## Fora de Escopo

- Multi-IDE (Cursor, Gemini, Codex, OpenCode, Copilot) — v1.1
- Português (skills em pt/) — v1.1
- Dashboard visual de tracking
- Integração com CI/CD
- Dual-model review (Claude + Codex/Gemini) no Layer 3
- Geração automática de spec (isso é a skill af2-spec fazendo, não o package)
