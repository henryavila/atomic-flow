# Research: Markdown Viewers from Terminal

**Date:** 2026-04-06
**Purpose:** Landscape de ferramentas de preview/visualização de markdown via terminal, especialmente em WSL2.

---

## Ferramentas Existentes

### grip (GitHub Readme Instant Preview)
- **Como funciona:** Server HTTP Python (porta 6419), envia markdown para GitHub API para render
- **Lifecycle:** Foreground blocking. Ctrl+C para parar
- **Multi-file:** Serve diretório inteiro. Acessa qualquer arquivo via URL path
- **Browser:** `-b` flag auto-abre
- **Pros:** Render idêntico ao GitHub. Simples. Directory browsing built-in
- **Contras:** **Requer internet** (GitHub API). Rate-limited (60 req/h sem token)

### glow (Charmbracelet)
- **Como funciona:** Renderer puro no terminal (TUI). Sem server, sem browser
- **Dois modos:** `glow README.md` (stdout) ou `glow` (TUI interativo com file browser)
- **Pros:** Bonito no terminal. Zero deps. Rápido
- **Contras:** TUI-only. Sem browser. Sem live reload. Não renderiza Mermaid/math

### frogmouth (Textualize)
- **Como funciona:** TUI browser de markdown (Textual framework). Navegação, bookmarks, TOC
- **Pros:** TUI mais rico. GitHub integration
- **Contras:** TUI-only. Python 3.8+

### mdserve (ver research-mdserve-deep-dive.md)
- Rust binary, WebSocket reload, directory mode, 5 themes, Mermaid
- Destaque: Claude Code plugin

### markserv (Node.js)
- Server Node.js com GFM + hot reload via WebSocket
- Directory indexing, múltiplos themes (dark, light, synthwave, solarized)
- MathJax support

### md-review / md-review-plus (ver competitive-analysis.md)

---

## O Padrão "Persistent Server"

### Jupyter Notebook
- Tornado HTTP + ZeroMQ kernels + SQLite sessions
- Foreground default, daemon via systemd/nohup
- Session Manager: sessão separada por notebook aberto
- URL pattern: `localhost:8888/notebooks/path/to/file.ipynb`
- **Key insight:** Server é persistente; arquivos são sessões efêmeras dentro dele
- Instance discovery: JSON files em `~/.local/share/jupyter/runtime/`

### mkdocs serve
- 3 threads: build loop + serve + observer (watchdog)
- Live reload via long-polling (não WebSocket)
- Debouncing: 0.1s para batch de mudanças
- Error resilience: serve último build bem-sucedido durante erros
- `--dirty` para builds incrementais

### Storybook
- `storybook dev` roda Node.js server. Webpack/Vite HMR
- Stories descobertas via glob patterns
- Port auto-detection

### Vite
- Port 5173 default, auto-increment em conflito
- `server.open` config. Respeita `BROWSER` env var
- WebSocket HMR

### Padrões comuns

| Padrão | Jupyter | mkdocs | Vite | Storybook |
|--------|---------|--------|------|-----------|
| Modo default | Foreground | Foreground | Foreground | Foreground |
| Porta | 8888 | 8000 | 5173 | 6006 |
| Conflito de porta | Erro | Erro | Auto-increment | Auto-increment |
| Browser open | Auto + token | `--open` | Config | Auto |
| Live reload | Kernel comms | Long-polling | WebSocket | WebSocket |
| File watching | Per-notebook | watchdog | chokidar | chokidar |

---

## WSL2 + Browser

- `xdg-open` funciona com `google-chrome.desktop` configurado
- `wslview` (wslu) chama browser Windows diretamente — mais confiável
- HTTP localhost port forwarding é automático no WSL2
- `BROWSER=/mnt/c/Windows/explorer.exe` como fallback

---

## Ferramentas que combinam View + Annotate

### md-review (npm)
- CLI → server local (3030). SSE live reload. Tree view sidebar
- Comments separados do markdown. Copy-paste para AI agents

### md-redline
- `npx md-redline /path/to/spec.md`. Sem server persistente
- Anotações como **HTML markers inline no .md** (invisíveis no preview)
- "No account, no cloud, no database. The markdown file stays the source of truth."

### jot (self-hosted)
- Node.js server (3210). JSON files + derived .md
- Comment threads, resolve/reopen. AI CLI integration
- Access levels configuráveis

### Hypothesis
- Browser extension/bookmarklet. Overlay em qualquer web page
- Funciona sobre qualquer markdown server local (localhost)
- Highlights, notes, threads, groups

---

## Sources

- [grip GitHub](https://github.com/joeyespo/grip)
- [glow GitHub](https://github.com/charmbracelet/glow)
- [frogmouth GitHub](https://github.com/Textualize/frogmouth)
- [markserv GitHub](https://github.com/markserv/markserv)
- [md-redline](https://github.com/nicholasgriffintn/md-redline)
- [jot](https://github.com/nicholasgriffintn/jot)
- [Jupyter Notebook Architecture](https://jupyter-notebook.readthedocs.io/)
- [mkdocs serve internals](https://github.com/mkdocs/mkdocs)
