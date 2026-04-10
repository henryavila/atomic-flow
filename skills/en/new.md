---
name: new
description: Use when starting a new feature — creates feature in SQLite, sets up worktree, initializes directory structure and placeholder files
---

# new — Create Feature

## Core

```
Create the workspace. Structure first, work second.
```

### Rules

1. **Feature starts in RESEARCH.** Every new feature begins at phase 1. Never skip directly to spec or implement.
2. **Worktree is mandatory.** Each feature gets an isolated git worktree. Work happens in isolation, not on main.
3. **Structure before content.** Create all placeholder files (spec.md, decisions.md, research-index.md) with the correct format before any work begins.

## Playbook

### Steps

1. Name the feature (slug format: `NNN-descriptive-name`)
2. Register in SQLite via MCP `new_feature` → returns branch name and feature ID
3. Enter worktree: `EnterWorktree` with the branch name
4. Create permanent artifacts: `docs/features/NNN-name/`
   - `spec.md` — placeholder with section headers
   - `decisions.md` — empty P&S template
   - `research-index.md` — pointer to research docs
5. Create ephemeral artifacts: `.ai/features/NNN-name/`
   - `tasks/` — empty directory
   - `tracking.md` — initialized from template
6. Commit: `git commit -m "feat: initialize feature NNN-name"`
7. Transition to RESEARCH phase

### Feature Naming

- Sequential ID from SQLite (001, 002, 003...)
- Slug: lowercase, hyphens, descriptive (`001-user-auth`, `002-vulnerability-mgmt`)
- Branch: `atomic-flow/NNN-name`

## Defense

### Red Flags — If You Catch Yourself Thinking:

- "I'll skip the worktree, it's a small feature"
- "I'll start coding directly, I'll create the structure later"
- "This feature can skip research, I'll go straight to spec"

All of these mean: STOP. Every feature follows the full lifecycle.
