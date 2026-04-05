# Briefing: Atomic Flow

## O que é

Atomic Flow é uma metodologia de desenvolvimento de features complexas com AI, empacotada como skills instaláveis via npm. Origem: projeto pessoal do autor (bmad-atomic-flow, 33 arquivos), destilado por pesquisa de 200+ fontes.

## Repositórios

- **KB (backing research):** ~/vibe-codding-KB — pesquisa bruta, evolução do método, decisões
- **Skill installer:** ~/atomic-skills (`@henryavila/atomic-skills`) — installer genérico de skills para 7 IDEs
- **Este projeto:** ~/atomic-flow (`@henryavila/atomic-flow`) — a metodologia como npm package

## Arquivos essenciais para ler (no KB repo)

1. `~/vibe-codding-KB/METHOD-NATIVE.md` — O método completo (6 fases, tracking, gates, recovery, hooks). Este é o documento-fonte. As skills são a implementação executável deste documento.
2. `~/vibe-codding-KB/research/state-tracking-patterns.md` — Pesquisa sobre tracking de progresso (70+ fontes). Define o formato do tracking file (.ai/tracking/{feature}.md).
3. `~/vibe-codding-KB/research/complex-features-with-ai.md` — Pesquisa de melhores práticas (200+ fontes).
4. `~/vibe-codding-KB/.ai/memory/method_arch_status.md` — Estado atual e decisões tomadas.

## Decisões já tomadas

1. **Repo separado** (não módulo do atomic-skills). Razão: atomic-skills é installer genérico; Atomic Flow é metodologia. Nenhum projeto do ecossistema (Superpowers 135K, ECC 120K, BMAD 44K) depende de installer externo.
2. **atomic-skills como dependência** para reutilizar rendering engine (renderTemplate, renderForIDE, IDE_CONFIG). atomic-skills precisa de um campo `"exports"` no package.json.
3. **Modelo BMAD**: `npx @henryavila/atomic-flow install` — interactive CLI, multi-IDE, npm distribution.
4. **Prefixo af1-af6** para skills de fase, `af-` para utilitários.

## Skills a implementar

### Fases (sequenciais)
| Skill | Fase | O que faz |
|-------|------|-----------|
| `af1-research` | 1 | Plan Mode + prompt de pesquisa do codebase |
| `af2-spec` | 2 | Entrevista → spec → cria tracking file → gate G1 |
| `af3-decompose` | 3 | Decomposição assistida → preenche tasks → gate G2 |
| `af4-implement` | 4 | /clear + contexto da task + TDD loop + atualiza tracking |
| `af5-review` | 5 | Review + convergence rule → gate G3 |
| `af6-ship` | 6 | Reconcile (tracking vs filesystem) + commit |

### Utilitários (a qualquer momento)
| Skill | O que faz |
|-------|-----------|
| `af-status` | Lê .ai/tracking/{feature}.md, reporta progresso determinístico. NUNCA gera da memória |
| `af-gate` | Aprova/rejeita gates humanos (G1, G2, G3) |

## Diferencial (o que nenhuma outra ferramenta faz)

1. **Tracking determinístico** — status lido de arquivo, não gerado da memória
2. **spec_hash drift detection** — SHA-256 da spec detecta mudanças pós-decomposição
3. **Review convergence tracking** — CRITICAL+HIGH deve diminuir a cada round
4. **Human gates formais** — G1 (spec), G2 (tasks), G3 (review) com approve/reject
5. **Recovery em 4 níveis** — retry → rollback → subagent → escalate
6. **7 IDEs** via atomic-skills rendering engine

## Arquitetura técnica

```
@henryavila/atomic-flow
├── package.json              (npm package, bin: atomic-flow)
├── bin/cli.js                (CLI entry point)
├── src/
│   └── install.js            (installer: skills + hooks + dirs)
├── skills/
│   ├── en/                   (English skill templates)
│   │   ├── af1-research.md
│   │   ├── af2-spec.md
│   │   ├── af3-decompose.md
│   │   ├── af4-implement.md
│   │   ├── af5-review.md
│   │   ├── af6-ship.md
│   │   ├── af-status.md
│   │   └── af-gate.md
│   └── pt/                   (Portuguese skill templates)
├── templates/
│   ├── tracking.md           (template do tracking file)
│   ├── spec.md               (template da spec)
│   └── hooks.json            (hooks para SessionStart, etc.)
├── meta/
│   └── skills.yaml           (catálogo de skills)
└── tests/
```

Dependência: `@henryavila/atomic-skills` (para renderTemplate, renderForIDE, IDE_CONFIG, getSkillPath).

## O que o installer faz (além de skills)

1. Instala skills nos diretórios das IDEs selecionadas
2. Cria `.ai/tracking/` no projeto
3. Merge hooks no settings.json (SessionStart injeta tracking state)
4. Opcional: adiciona regras mínimas ao CLAUDE.md

## Anti-patterns do skill design (do atomic-skills)

Cada skill deve ter:
- **Iron Law**: uma regra inviolável no topo
- **HARD-GATE**: paradas obrigatórias antes de ações perigosas
- **Red Flags**: pensamentos que indicam atalho
- **Rationalization Table**: mapeamento tentação → por que falha
- **Evidência**: toda afirmação cita arquivo:linha

Usar `{{BASH_TOOL}}`, `{{READ_TOOL}}`, etc. — nunca nomes hardcoded de ferramentas.
Usar `{{#if ide.gemini}}` para lógica específica de IDE.

## Referência: atomic-skills

Ler ~/atomic-skills para entender:
- `src/render.js` — polyglot rendering engine (82 linhas)
- `src/config.js` — IDE registry (7 IDEs)
- `src/install.js` — como installSkills() funciona
- `skills/en/core/fix.md` — exemplo de skill bem escrita (Iron Law, HARD-GATE, Red Flags)
- `skills/modules/memory/module.yaml` — formato de módulo
