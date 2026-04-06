# Pesquisa: DX — MCP Server + Worktree + Skills como Interface

**Data:** 2026-04-06
**Propósito:** Eliminar context switching entre Claude Code e terminal

---

## Decisões

### Interface do usuário: Skills + Conversa Natural
- Skills (`/atomic-flow:1-research`) são invocação explícita
- Conversa natural ("quero implementar X") também ativa a fase correta
- Superpowers v5 deprecou slash commands em favor de descoberta automática
- Atomic Flow suporta AMBOS: explícito + natural

### MCP Server: backend invisível
- Expõe tools nativos no Claude Code (gate_approve, preflight, status, etc.)
- Skills chamam MCP tools internamente
- Usuário NUNCA interage com MCP diretamente
- MCP lê/escreve SQLite

### Worktree: transparente e obrigatório
- MCP tool `new_feature` cria worktree via git
- AI usa `EnterWorktree` (tool nativo do Claude Code) para entrar
- Usuário não sabe que está num worktree
- Ship: merge + cleanup automático via `ExitWorktree`
- Multi-feature: cada worktree é isolado (sessions separadas)

### Separação de responsabilidades
- Skill = metodologia (pesquisar, escrever spec, implementar)
- MCP = state management (transitions, gates, SQLite)
- Hooks = enforcement (file scoping, session start)
- Worktree = infra (isolamento, git) — NUNCA na skill de research

## Fontes
- Claude Code MCP: code.claude.com/docs/en/mcp
- Claude Code Skills: code.claude.com/docs/en/skills
- Claude Code Hooks: code.claude.com/docs/en/hooks-guide
- Superpowers v5: blog.fsck.com, deprecated slash commands
- Git worktrees in Claude Code: EnterWorktree/ExitWorktree tools
