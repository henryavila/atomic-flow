# Análise de Dependência: atomic-flow vs atomic-skills

**Data:** 2026-04-05
**Decisão:** atomic-flow é self-contained (zero dependência do atomic-skills)

## Contexto

O atomic-flow precisa instalar skills em 7 IDEs. O atomic-skills já resolve isso. A pergunta era: depender do atomic-skills ou ser independente?

## Análise

### O que o atomic-flow precisa

| Necessidade | Fonte | Tipo |
|-------------|-------|------|
| 8 skills (af1-research a af6-ship + af-status + af-gate) | **Conteúdo novo** — escrito do zero a partir do METHOD-NATIVE.md | Conteúdo |
| Templates (tracking.md, spec.md, hooks.json) | **Conteúdo novo** — específico da metodologia | Conteúdo |
| Rendering engine (trocar `{{BASH_TOOL}}` por nome IDE-específico) | Copiável do atomic-skills — `render.js` (82 linhas) | Infra |
| IDE registry (diretórios, formatos, file patterns de 7 IDEs) | Copiável do atomic-skills — `config.js` (63 linhas) | Infra |
| SHA256 hashing | Copiável do atomic-skills — `hash.js` (~10 linhas) | Infra |
| CLI interativo (idioma, IDEs, scope) | **Próprio** — perguntas diferentes do atomic-skills | Infra |
| Installer (copiar skills + criar tracking dir + merge hooks) | **Próprio** — lógica significativamente diferente | Infra |
| Manifest (rastrear arquivos instalados) | **Próprio** — dir `.atomic-flow/` vs `.atomic-skills/` | Infra |

### Superfície real de reuso: ~155 linhas

Apenas render.js + config.js + hash.js são reutilizáveis sem modificação. Todo o resto diverge.

### Opções avaliadas

| Opção | Prós | Contras | Veredicto |
|-------|------|---------|-----------|
| **npm dependency** | DRY (155 linhas) | Blocker (atomic-skills sem exports), coupling de versão, usuário baixa ~500 linhas inúteis, install mais lento | ❌ Rejeitada |
| **Extrair @henryavila/atomic-core** | Máximo DRY | 3º repo para manter, overengineering para 155 linhas, diamond dependency risk | ❌ Rejeitada |
| **Self-contained (copiar)** | Zero coupling, padrão do ecossistema (BMAD, Superpowers, ECC são todos self-contained), sem blocker | 155 linhas duplicadas, atualizar 2 repos se nova IDE surgir | ✅ Escolhida |

### Por que self-contained vence

1. **Nenhum conteúdo é compartilhado** — zero skills reusadas
2. **A infra compartilhada é trivial** — 155 linhas de código estável
3. **O install.js diverge fundamentalmente** — atomic-flow cria tracking dir, merge hooks, instala templates; atomic-skills não faz nada disso
4. **Padrão do ecossistema** — nenhum projeto comparável (Superpowers 135K installs, ECC 120K, BMAD 44K) depende de installer externo
5. **Risco de nova IDE é baixo** — o IDE registry do atomic-skills não mudou desde v1.0

## Código a copiar do atomic-skills

Fonte: `~/atomic-skills/src/`

### render.js (82 linhas)
- `renderTemplate(content, vars, modules, ideId)` — processa `{{#if ide.X}}` e `{{VAR}}`
- `renderForIDE(format, name, description, body)` — wrap em YAML frontmatter (markdown) ou TOML

### config.js (63 linhas)
- `IDE_CONFIG` — mapa de 7 IDEs com name, dir, format, filePattern, supportsUserScope
- `getSkillPath(ideId, skillName)` — caminho relativo do arquivo da skill
- `getSkillFormat(ideId)` — 'markdown' ou 'toml'

### hash.js (~10 linhas)
- `hashContent(content)` — SHA256 de string

## Lições

- Separar "conteúdo" de "infraestrutura" torna a decisão de dependência óbvia
- Dependência por ~155 linhas de utilitário é anti-pattern (como depender do React só pra usar classNames)
- Self-contained = menos friction para contribuidores, menos pontos de falha
