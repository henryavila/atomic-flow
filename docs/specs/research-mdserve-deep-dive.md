# Research: mdserve Deep Dive

**Date:** 2026-04-06
**Purpose:** Análise completa do mdserve para informar o design do nosso markdown viewer/reviewer.

---

## Identidade

- **Repo:** github.com/jfernandez/mdserve
- **Autor:** Jose Fernandez
- **Linguagem:** Rust (binário único)
- **Licença:** MIT
- **Stars:** 399 | Forks: 44
- **Criado:** 2025-09-22 | Release: v1.1.0 (2026-03-08)
- **Tagline:** "Markdown preview server for AI coding agents"

---

## Features Completas

### Core
- Zero config — `mdserve file.md` funciona sem flags
- Binário estático único, sem deps de runtime
- Live reload via WebSocket
- GFM: tables, task lists, code blocks, strikethrough
- Mermaid diagrams (bundled mermaid.min.js, não CDN)
- Directory mode com sidebar
- YAML/TOML frontmatter (stripped)
- Serve imagens (png, jpg, gif, svg, webp, bmp, ico)
- HTML passthrough em markdown
- 5 themes com picker modal
- Persistência de tema via localStorage
- Sidebar colapsável com estado persistente
- Port auto-increment (até 10 tentativas)
- `--open` para auto-abrir browser
- Custom hostname (`-H`)
- ETag caching para mermaid.min.js
- HTML pré-renderizado em memória
- Directory traversal prevention

### CLI
```
mdserve [OPTIONS] <path>

Arguments:
  <path>     Path to markdown file or directory

Options:
  -H, --hostname <HOST>  Hostname (default: 127.0.0.1)
  -p, --port <PORT>      Port (default: 3000)
  -o, --open             Open browser
  -h, --help
  -V, --version
```

---

## Arquitetura

### Stack
- **Web framework:** Axum 0.7.9 (WebSocket)
- **Async runtime:** Tokio
- **Markdown parser:** `markdown-rs` v1.0 (NÃO pulldown-cmark, NÃO comrak)
- **Template:** MiniJinja 2.12.0 (compile-time embed)
- **File watcher:** `notify` v8.2.0 (inotify/FSEvents/ReadDirectoryChangesW)
- **CLI:** clap 4.5

### Estrutura (~790 linhas de Rust)
- `src/main.rs` — CLI, entry point, mode detection
- `src/app.rs` — TODO o server logic (~790 linhas)
- `templates/main.html` — template monolítico com CSS/JS embedded
- `static/js/mermaid.min.js` — bundled
- `build.rs` — 3 linhas (embed templates)

### State
```rust
struct MarkdownState {
    base_dir: PathBuf,
    tracked_files: HashMap<String, TrackedFile>,
    is_directory_mode: bool,
    change_tx: broadcast::Sender<ServerMessage>,
}

struct TrackedFile {
    path: PathBuf,
    last_modified: SystemTime,
    html: String,  // pré-renderizado em memória
}
```

### Routing
- `GET /` — primeiro arquivo alfabeticamente
- `GET /:filename.md` — arquivo específico
- `GET /:filename.<ext>` — imagens
- `GET /ws` — WebSocket
- `GET /mermaid.min.js` — bundled com ETag

---

## Live Reload

1. `notify::RecommendedWatcher` observa diretório (não-recursivo)
2. Eventos via Tokio mpsc channel (buffer 100)
3. Task processa: Create/Modify → re-lê, re-renderiza, atualiza state
4. Broadcast `ServerMessage::Reload` via channel (capacity 16)
5. WebSocket envia `{"type":"Reload"}` ao client
6. Client faz `window.location.reload()` — **full page reload**
7. **Sem debouncing** — cada evento dispara reload imediato
8. **Sem preservação de scroll** — perde posição no reload

---

## Themes

5 themes, todos como CSS custom properties:

| Theme | Background | Text |
|-------|-----------|------|
| Light | `#fff` | `#333` |
| Dark | `#0d1117` | `#e6edf3` |
| Catppuccin Latte | `#eff1f5` | `#4c4f69` |
| Catppuccin Macchiato | `#24273a` | `#cad3f5` |
| Catppuccin Mocha (default) | `#1e1e2e` | `#cdd6f4` |

Anti-flash: inline `<script>` no `<head>` lê localStorage antes do primeiro paint.
Customização: NENHUMA. PRs de custom themes rejeitados.

---

## Claude Code Plugin

### Estrutura
```
.claude-plugin/
  plugin.json        # Manifest (name, version, description)
  marketplace.json   # Registry metadata
skills/
  mdserve/
    SKILL.md          # Instruções para Claude
```

### Como funciona
1. `/plugin install mdserve@mdserve` — Claude Code busca o repo
2. Registra `skills/mdserve/SKILL.md` como skill
3. Skill ensina Claude QUANDO e COMO usar mdserve
4. NÃO é hook, NÃO é MCP — é uma **skill pura**

### O que a SKILL.md ensina
- Use quando markdown > 40-60 linhas, tabelas, diagramas
- NÃO use para respostas curtas, snippets simples
- Workflow: escrever arquivo → `mdserve --open` com `run_in_background: true` → continuar editando → live reload atualiza → parar quando terminar
- Como lidar com conflitos de porta
- Quando usar directory mode vs single-file

### Scopes
- `user` (default) — todos os projetos
- `project` — compartilhado com collaborators via `.claude/`
- `local` — só você, só este repo

---

## O que NÃO tem (gaps)

### Confirmados (issues abertas)
1. **Syntax highlighting** — Issue #24, PR #54 (highlight.js proposto, não merged)
2. **LaTeX/math** — Issue #14 (rejeitado por tamanho do binário)
3. **Header anchors/IDs** — Issue #22, PR #55
4. **RTL** — PR #75
5. **Task list bullet fix** — PR #78

### Rejeitados explicitamente
- Recursive directory scanning
- Custom templates/themes (PRs #43, #48)
- Sidebar resize (PR #45)
- File rename/removal tracking (PR #46)
- Collapsible folder tree (PR #47)
- Canonical/no-sidebar flag (PR #53)

### Gaps para nós
- Zero annotation/commenting
- Full page reload (perde scroll)
- Sem debouncing
- Sem print-friendly
- Sem keyboard shortcuts
- Sem search
- Sem export (PDF, HTML)
- Sem API para tools externas
- Sem diff view

---

## Decisão

**Não faremos fork do mdserve.** Faremos projeto novo em Node.js, "Inspired by mdserve" no README.

**Razões:**
1. Precisamos de remark (JS) para posições inline — Rust não resolve
2. mdserve rejeita extensibilidade (custom themes, recursive dirs, etc.)
3. Fork que diverge muito é pior que projeto novo
4. Coerência de stack com atomic-flow (Node.js)

**O que copiaremos (ideias, não código):**
- Plugin/skill para Claude Code
- Auto-detect quando lançar
- 5 themes (inspirar CSS)
- Anti-flash theme loading
- Port auto-increment
- DX de zero config

---

## Sources

- [mdserve GitHub](https://github.com/jfernandez/mdserve)
- [mdserve 1.0 Blog Post](https://jrfernandez.com/mdserve-1.0/)
- [mdserve Intro Blog](https://jrfernandez.com/mdserve-fast-markdown-preview-terminal-workflows/)
- [mdserve on crates.io](https://crates.io/crates/mdserve)
