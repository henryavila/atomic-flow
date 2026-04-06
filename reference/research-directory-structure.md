# Pesquisa: Estrutura de Diretórios para Atomic Flow

**Data:** 2026-04-05
**Fontes:** Kiro, spec-kit, BMAD, Manus, tick-md, ADRs, RFCs, state-tracking-patterns.md
**Propósito:** Definir estrutura fixa de diretórios para features com hook-based enforcement

---

## 1. Consenso: Per-Feature Directories com Flat Files

6 ferramentas independentes convergem no mesmo padrão:

| Tool | Estrutura | Phase Subdirs? |
|---|---|---|
| Kiro (AWS) | `.kiro/specs/{slug}/` → requirements.md, design.md, tasks.md | Não |
| spec-kit (GitHub) | `specs/NNN-slug/` → spec.md, plan.md, tasks.md, research.md | Não |
| BMAD | Flat files no root (product-brief.md, PRD.md, ARCHITECTURE.md) | Não |
| Manus ($2B) | task_plan.md, todo.md, notes.md | Não |
| tick-md | TICK.md (arquivo único) | Não |
| ADRs | `doc/adr/NNNN-title.md` | Não |

**ZERO ferramentas usam subdirectórios por fase.** Fases vivem em YAML frontmatter.

## 2. Formato de ID

| Formato | Usado por | Prós | Contras |
|---|---|---|---|
| **NNN-slug** (001-login) | spec-kit, ADRs | Sortável, legível, compacto | Coordenação em equipes paralelas |
| NNNN-slug | ADRs, adr-tools | 4 dígitos | Mais que necessário |
| Timestamp | spec-kit alt | Zero colisão | Longo, menos escaneável |
| UUID | Manus parallel | Zero colisão | Ilegível |
| Slug only | Kiro | Mais legível | Colisões, sem ordem |

**Recomendação:** NNN-slug (3 dígitos, zero-padded, kebab-case). Suporta 999 features.

## 3. Impacto no Contexto da AI

- Context rot é real — cada arquivo adicional custa tokens
- Sweet spot: 3-5 files por feature (consenso)
- Flat files > nested dirs (menos operações de descoberta)
- Tracking file com TODO o estado da fase = single read
- CLAUDE.md efetivo: <60 linhas; cada regra compete pelo mesmo budget

## 4. Namespace `.ai/`

Não reivindicado por nenhum tool major:
- Claude: `.claude/`
- Cursor: `.cursor/`
- Kiro: `.kiro/`
- Copilot: `.github/`
- Gemini: `.gemini/`
- spec-kit: `.specify/`

`.ai/` é seguro para Atomic Flow.

## 5. Estrutura Recomendada

```
.ai/
  features/
    001-user-login/
      tracking.md       # State machine (phase, gates, serial, tasks status)
      spec.md           # Requisitos + ✓/✗ + Test Contracts + Validation results
      tasks.md          # Decomposição com status por task
      research.md       # (opcional) Notas de pesquisa da Fase 1
    002-payment-flow/
      tracking.md
      spec.md
      tasks.md
    _archive/           # Features concluídas
      000-project-setup/
```

## 6. Hook Enforcement por Fase

Com estrutura fixa, hooks ficam triviais:

| Fase | Permite editar | Bloqueia |
|---|---|---|
| research | `.ai/features/NNN-*/research.md`, `tracking.md` | Tudo mais |
| spec | `.ai/features/NNN-*/spec.md`, `tracking.md` | Código, tasks |
| validate | Nada (read-only) | Tudo |
| decompose | `.ai/features/NNN-*/tasks.md`, `tracking.md` | Código, spec |
| implement | Arquivos declarados no tasks.md + `tracking.md` | Fora do scope |
| review | `.ai/features/NNN-*/tracking.md` | Novos arquivos |
| ship | `tracking.md` | Novos arquivos |

## 7. O que vive FORA de `.ai/`

- Código-fonte (implementação real)
- Testes
- CLAUDE.md
- `.claude/` (skills, settings, hooks)
- `.gitignore`

## Fontes

- Kiro: kiro.dev/docs/specs/
- spec-kit: github.com/github/spec-kit
- BMAD: github.com/bmad-code-org/BMAD-METHOD
- Manus: gist.github.com/renschni/4fbc70b31bad8dd57f3370239dccd58f
- tick-md: tick.md
- ADRs: github.com/joelparkerhenderson/architecture-decision-record
- Factory.ai: context window research
- Morph LLM: context rot research
