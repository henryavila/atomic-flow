# Competitive Analysis: Markdown Review Tools

**Date:** 2026-04-06
**Purpose:** Comparativo detalhado entre ferramentas existentes e o nosso projeto.

---

## Tool 1: md-review

**npm:** md-review v1.3.2 | **GitHub:** ryo-manba/md-review | **MIT**
**Stars:** 18 | **Downloads:** 48/mês | **Último commit:** 2026-02-03

### Core
CLI para comentar markdown no browser. Designed para copy-paste de feedback para AI agents.

### CLI
```
md-review [options]              # Browse all .md in cwd
md-review <file> [options]       # Single file
md-review <directory> [options]  # Browse directory

Options:
  -p, --port <port>      (default: 3030)
      --no-open
  -h, --help
  -v, --version
```

### Rendering
- GFM: ✅ (remark-gfm)
- Syntax highlight: ✅ (rehype-highlight / highlight.js)
- Mermaid: ✅ (v1.1.0+)
- Math/KaTeX: ❌
- Frontmatter: ❌
- Line tracking: ✅ `data-line-start` via AST positions

### Comment System
- Selecionar texto → popover "Comment" → textarea → Cmd+Enter
- Ancorado a line range (startLine, endLine) do markdown source
- Edição via ícone de lápis
- Copy individual: `filename:L17\ncomment text`
- Copy All: todos os comments com separadores

```typescript
interface Comment {
  id: string;
  text: string;
  selectedText: string;
  startLine: number;
  endLine: number;
  createdAt: Date;
}
```

### Persistência
- **Single file mode:** React state only. **PERDIDO no refresh.**
- **Directory mode:** browser localStorage (`md-review-comments`). Persiste no refresh, perdido ao limpar storage ou mudar browser.
- **NENHUMA persistência server-side ou em arquivo.**

### Multi-file
Sim. Directory browsing recursivo com file tree sidebar. Search via Cmd+K.

### AI Integration
Nenhuma. Apenas copy-paste manual de comments formatados.

### Limitações
- Comments perdidos no refresh (single file)
- Sem review workflow (approve/reject)
- Sem export estruturado
- Sem KaTeX
- Sem blocking mode
- Sem persistência em arquivo

---

## Tool 2: md-review-plus

**npm:** md-review-plus v1.1.0 | **GitHub:** Seiraiyu/md-review-plus | **MIT**
**Stars:** 1 | **Downloads:** 300/mês | **Último commit:** 2026-03-13

### Core
Fork do md-review com section-level approval, structured feedback stdout, `--review` blocking mode, e Claude Code skill.

### CLI
```
md-review-plus [options]
md-review-plus <file> --review        # Blocking mode
md-review-plus install --skills       # Install Claude Code skill
md-review-plus install --skills --global

Options:
  -p, --port <port>      (default: 3030)
      --review           Block until submit
      --no-open
      --global           Install skills globally
```

### Rendering
Idêntico ao md-review (mesmo fork): GFM, highlight.js, Mermaid. Sem KaTeX, sem frontmatter.

### Comment System
Dois mecanismos:

**A. Line-level (herdado):** Igual ao md-review.

**B. Section-level (novo):**
- Documento dividido em seções por `##` headings
- Cada seção: Approve (verde) / Reject (vermelho) + textarea
- Sticky top bar: progresso, "Approve All", "Clear All", Submit/Copy
- SectionNav sidebar com TOC e status badges

```typescript
interface Section {
  heading: string;
  status: 'approved' | 'rejected' | 'pending';
  comment: string;
}
```

### Persistência
- Comments: localStorage (dir mode only) — igual md-review
- Section approval: **React state only** — perdido no refresh
- Review mode output: stdout ao clicar Submit

### Blocking Review Mode
- `md-review-plus spec.md --review` → server sobe → browser abre → **bloqueia**
- Submit → structured feedback no stdout → server para → exit 0
- Browser fecha sem submit → 30s timeout → exit 1

### Output format (stdout)
```
Please update the document with the following changes:

## Needs Changes
**Section Name**: Rejected
  -> Reviewer's comment

## Section Comments
**Another Section**
  -> Comment on approved/pending section

## Line Comments
file.md:L17
"selected text"
-> Reviewer's comment

## Approved
- Section Name 1
- Section Name 2
```

### AI Integration
- `--review` blocking mode para agent loops
- `install --skills` copia SKILL.md para `.claude/skills/`
- Skill ensina Claude quando/como invocar `--review`
- Sem MCP server

### Limitações
- Sem persistência real (localStorage + stdout texto)
- `--review` só single file
- Output texto (não JSON/YAML — frágil para parsing)
- Section approval perdido no refresh
- Sem threading/replies
- Sem tags/categorias
- Sem re-anchoring
- Projeto muito novo (1 mês, 1 star)

---

## Tool 3: mdserve

**crates.io:** mdserve v1.1.0 | **GitHub:** jfernandez/mdserve | **MIT**
**Stars:** 399 | **Último commit:** 2026-04-02

(Detalhes completos em research-mdserve-deep-dive.md)

### Resumo
- Pure viewer — ZERO annotation/review
- Rust binary, zero deps
- WebSocket live reload
- 5 themes com picker
- Mermaid, GFM, frontmatter
- Claude Code plugin oficial
- Sem syntax highlight, sem KaTeX

---

## Comparativo Completo

| Feature | md-review | md-review-plus | mdserve | **Nosso** |
|---|---|---|---|---|
| Propósito | Comentar | Revisar/aprovar | Visualizar | **View+Review+Annotate** |
| Linguagem | TypeScript | TypeScript | Rust | Node.js |
| GFM | ✅ | ✅ | ✅ | ✅ |
| Mermaid | ✅ | ✅ | ✅ | ✅ |
| Syntax highlight | ✅ | ✅ | ❌ | ✅ |
| Math/KaTeX | ❌ | ❌ | ❌ | ✅ |
| Frontmatter | ❌ | ❌ | ✅ | ✅ |
| Themes | System dark | System dark | 5 + picker | Themes + picker |
| Live reload | SSE | SSE | WebSocket | WebSocket |
| Dir recursivo | ✅ | ✅ | ❌ | ✅ |
| Search | Cmd+K | Cmd+K | ❌ | ✅ |
| Comments | Line-level | Line + section | ❌ | Line + quote anchor |
| Section approval | ❌ | ✅ | ❌ | ✅ |
| Persistência | ❌ localStorage | ❌ localStorage | N/A | ✅ **YAML sidecar** |
| Sobrevive refresh | ❌ single | ⚠️ dir only | N/A | ✅ sempre |
| Sobrevive git | ❌ | ❌ | N/A | ✅ commitável |
| Anchoring | line number | line number | N/A | TextQuoteSelector |
| Re-anchoring | ❌ | ❌ | N/A | ✅ fuzzy 4-level |
| Tags | ❌ | ❌ | N/A | ✅ 4 categorias |
| Threading | ❌ | ❌ | N/A | ✅ replies |
| Blocking review | ❌ | ✅ --review | ❌ | ✅ --once |
| Server persistente | ❌ | ❌ | ✅ | ✅ |
| View puro | ❌ | ❌ | ✅ | ✅ |
| Export | Clipboard | Stdout texto | ❌ | YAML + JSON Schema |
| Helper API (lib) | ❌ | ❌ | ❌ | ✅ embeddable |
| Claude Code plugin | ❌ | ✅ skill | ✅ plugin+skill | ✅ plugin+skill |
| JSON Schema | ❌ | ❌ | N/A | ✅ |
| Scroll preserve | ❌ | ❌ | ❌ | ✅ |

---

## Nossa Diferenciação Central

### O que nenhum deles tem

1. **YAML sidecar persistente** — anotações sobrevivem refresh, restart, git push/clone
2. **TextQuoteSelector + fuzzy re-anchoring** — anotações sobrevivem edições
3. **JSON Schema como contrato** — consumers validam sem deps
4. **Helper API embeddable** — mount como middleware em qualquer server
5. **View + Review na mesma tool** — substitui grip/mdserve E md-review
6. **Server persistente + --once** — viewer diário E review pontual
7. **Threading/replies** — discussão por anotação
8. **Tags** — bug, question, suggestion, nitpick
9. **KaTeX** — nenhum dos 3 suporta math
10. **Drift detection** — file_hash detecta mudanças desde a review
11. **Orphan detection** — anotações que não re-ancoram são sinalizadas

### Posicionamento no README

```markdown
## How it compares

| Need | Recommended tool |
|------|-----------------|
| Quick markdown preview while coding | [mdserve](https://github.com/jfernandez/mdserve) |
| Add quick comments to share with AI | [md-review](https://github.com/ryo-manba/md-review) |
| Section-level approval workflow | [md-review-plus](https://github.com/Seiraiyu/md-review-plus) |
| **Persistent annotations that survive git** | **This tool** |
| **View + Review in one tool** | **This tool** |
| **Structured feedback (YAML/JSON Schema)** | **This tool** |
| **Embeddable in other tools (library mode)** | **This tool** |
```

---

## Sources

- [md-review GitHub](https://github.com/ryo-manba/md-review)
- [md-review npm](https://npm.im/md-review)
- [md-review-plus GitHub](https://github.com/Seiraiyu/md-review-plus)
- [md-review-plus npm](https://npm.im/md-review-plus)
- [mdserve GitHub](https://github.com/jfernandez/mdserve)
