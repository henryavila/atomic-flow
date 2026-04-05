# Atomic Flow — Plano de Inicialização do Projeto

## Controle de Fase (Método Atomic Flow)

| Fase | Status | Gate |
|------|--------|------|
| ① RESEARCH | done | — |
| ② SPEC | em progresso (este documento) | G1: pendente |
| ③ DECOMPOSE | pendente | G2: pendente |
| ④ IMPLEMENT | pendente | — |
| ⑤ REVIEW | pendente | G3: pendente |
| ⑥ SHIP | pendente | — |

---

## ① RESEARCH — Findings

### O que é o projeto
`@henryavila/atomic-flow` — a metodologia Atomic Flow (6 fases, tracking determinístico, gates humanos) empacotada como npm package instalável via `npx`.

### Codebase explorado
- **METHOD-NATIVE.md** (1095 linhas) — documento-fonte completo do método
- **atomic-skills/src/render.js** — rendering engine polyglot (82 linhas)
- **atomic-skills/src/config.js** — IDE registry (7 IDEs, 63 linhas)
- **atomic-skills/src/install.js** — lógica de instalação completa (432 linhas)
- **atomic-skills/src/hash.js** — SHA256 hashing
- **atomic-skills/src/manifest.js** — persistência de manifest
- **atomic-skills/src/yaml.js** — parser YAML minimalista
- **atomic-skills/bin/cli.js** — CLI entry point
- **atomic-skills/meta/skills.yaml** — catálogo de skills
- **atomic-skills/skills/en/core/fix.md** — exemplo de skill bem estruturada

### Padrões a seguir (do atomic-skills)
- Skill structure: Iron Law → HARD-GATE → Process → Red Flags → Rationalization
- Template vars: `{{BASH_TOOL}}`, `{{READ_TOOL}}`, etc.
- IDE conditionals: `{{#if ide.gemini}}`

---

## ② SPEC — O que e por quê

### Objetivo
Criar o npm package `@henryavila/atomic-flow` que instala 8 skills de metodologia, template de tracking, e hooks de SessionStart para Claude Code.

### Decisões Tomadas

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| Dependência do atomic-skills | **Self-contained** (copiar ~155 linhas) | Nenhum conteúdo compartilhado. 155 linhas de infra não justifica npm dep. Análise completa: `vibe-codding-KB/docs/atomic-flow-dependency-analysis.md` |
| IDEs no MVP | **Só Claude Code** | Menor superfície de teste. Expandir incrementalmente |
| Idiomas no MVP | **Apenas EN** | Foca na qualidade do conteúdo. PT adicionado quando skills estabilizarem |
| Prefixo de skills | **af1-af6** (fases) + **af-** (utilitários) | Indica sequência de execução |

### Requisitos Funcionais

- **RF01:** `npx @henryavila/atomic-flow install` abre CLI interativo (idioma → install)
- **RF02:** Instala 8 skills (af1-research a af6-ship + af-status + af-gate) em `.claude/skills/`
- **RF03:** Cria diretório `.ai/tracking/` no projeto
- **RF04:** Copia template de tracking para `.ai/tracking/` (referência, não file real)
- **RF05:** Merge hooks de SessionStart no `.claude/settings.json` (injetar tracking state)
- **RF06:** `npx @henryavila/atomic-flow uninstall` remove tudo que foi instalado
- **RF07:** Manifest em `.atomic-flow/manifest.json` rastreia arquivos instalados com hashes

### Regras de Negócio

- **RN01:** Skills usam template vars (`{{BASH_TOOL}}` etc.) — preparado para multi-IDE futuro
- **RN02:** Cada skill tem: Iron Law, HARD-GATE, Red Flags, Rationalization table
- **RN03:** Tracking file é lido (nunca gerado) — regra inviolável do método
- **RN04:** Gates (G1, G2, G3) requerem aprovação humana explícita
- **RN05:** Conflict detection 3-hash na reinstalação

### Edge Cases

- **EC01:** `.ai/tracking/` já existe → não sobrescrever
- **EC02:** hooks já existem em `.claude/settings.json` → merge, não overwrite
- **EC03:** Reinstalação com arquivos localmente modificados → 3-hash conflict detection

### Estrutura do Projeto

```
@henryavila/atomic-flow/
├── package.json
├── bin/cli.js
├── src/
│   ├── install.js          (installer principal)
│   ├── uninstall.js        (remoção limpa)
│   ├── render.js           (template engine — copiado de atomic-skills)
│   ├── config.js           (IDE registry — só claude-code no MVP)
│   ├── hash.js             (SHA256 utility)
│   ├── manifest.js         (persistência)
│   ├── yaml.js             (parser minimalista)
│   └── prompts.js          (inquirer prompts)
├── skills/
│   └── en/
│       ├── af1-research.md
│       ├── af2-spec.md
│       ├── af3-decompose.md
│       ├── af4-implement.md
│       ├── af5-review.md
│       ├── af6-ship.md
│       ├── af-status.md
│       └── af-gate.md
├── templates/
│   ├── tracking.md         (template do tracking file por feature)
│   ├── spec.md             (template da spec)
│   └── hooks.json          (hooks SessionStart)
├── meta/
│   └── skills.yaml         (catálogo de skills)
├── tests/
│   └── install.test.js
├── .gitignore
└── README.md
```

### Fora de Escopo (MVP)
- Multi-IDE (7 IDEs) — será segundo release
- Português — será adicionado quando skills EN estabilizarem
- Dashboard visual de tracking
- Integração com CI/CD

---

## ③ DECOMPOSE — Tasks (rascunho, será refinado após G1)

| Task | Arquivos | Est. | Deps |
|------|----------|------|------|
| T1: Scaffold npm package | package.json, .gitignore, bin/cli.js | 5 min | — |
| T2: Copiar e adaptar infra do atomic-skills | src/render.js, src/config.js, src/hash.js, src/yaml.js | 10 min | — |
| T3: Criar manifest + prompts | src/manifest.js, src/prompts.js | 10 min | — |
| T4: Criar installer + uninstaller | src/install.js, src/uninstall.js | 15 min | T2, T3 |
| T5: Criar meta/skills.yaml + templates | meta/skills.yaml, templates/* | 5 min | — |
| T6: Escrever 8 skills EN | skills/en/*.md | 15 min | — |
| T7: Testes | tests/install.test.js | 10 min | T4 |

---

## T0: Commit inicial com referências

Antes de tudo, criar `reference/` com os arquivos que o ultraplan precisa:
- `reference/METHOD-NATIVE.md` — método completo
- `reference/atomic-flow-briefing.md` — arquitetura e decisões
- `reference/atomic-flow-dependency-analysis.md` — decisão self-contained
- `reference/example-skill-fix.md` — exemplo de skill bem escrita
- `reference/atomic-skills-render.js` — rendering engine a copiar
- `reference/atomic-skills-config.js` — IDE registry a copiar
- `reference/atomic-skills-hash.js` — SHA256 a copiar
- Incluir também o plano atual como `reference/PLAN.md`

---

## Verificação

- `node bin/cli.js` — CLI mostra help
- `node bin/cli.js install` — instala skills em `.claude/skills/`
- `node --test tests/` — testes passam
- Verificar que `.ai/tracking/` é criado
- Verificar que hooks são merged no settings.json
- Testar reinstalação (3-hash conflict detection)
