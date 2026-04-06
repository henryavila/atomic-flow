# Pesquisa: SQLite vs Markdown para State Management do Atomic Flow

**Data:** 2026-04-06
**Fontes:** LangGraph, CrewAI, Beads (18.7K stars), better-sqlite3, node:sqlite, sql.js
**Propósito:** Decidir backend de state management para enforcement de metodologia

---

## 1. Precedentes: Quem Usa SQLite para Agent State

| Framework | Como usa SQLite | Stars |
|---|---|---|
| LangGraph (LangChain) | SqliteSaver — checkpoints após cada node | — |
| CrewAI | LTMSQLiteStorage — outcomes estruturados de tasks | — |
| Beads (Yegge) | SQLite cache + JSONL git-tracked (source of truth) | 18.7K |
| Autonomous agent real | 15MB SQLite, 44 skills, 8-stage pipeline, 24/7 | DEV.to case study |

## 2. Opções de SQLite para Node.js

| Package | Size | Compilação nativa? | Min Node |
|---|---|---|---|
| better-sqlite3 | 10.25 MB | Sim (node-gyp, C++) | 14+ |
| sql.js (WASM) | 19 MB | Não (pure JS/WASM) | Qualquer |
| node:sqlite | 0 MB (built-in) | Não | 22.5+ (experimental) |

**Riscos do better-sqlite3 para npx:**
- Windows sem build tools → falha
- Node não-LTS → sem prebuilt binaries → compilação 30s+ ou falha
- ARM64 Linux → problemas reportados

**node:sqlite status (abril 2026):**
- Node 22 LTS: Experimental (Stability 1.1)
- Node 25.7+: Release Candidate (Stability 1.2)
- Não production-ready no LTS atual

## 3. SQLite Enforcement: Triggers + State Machine

```sql
CREATE TABLE valid_transitions (
  from_phase TEXT, to_phase TEXT, requires_gate TEXT,
  PRIMARY KEY (from_phase, to_phase)
);

CREATE TRIGGER enforce_phase_transition
BEFORE UPDATE OF phase ON features
WHEN NEW.phase != OLD.phase
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM valid_transitions
      WHERE from_phase = OLD.phase AND to_phase = NEW.phase
    ) THEN RAISE(ABORT, 'Invalid phase transition')
  END;
END;
```

CHECK constraints não suportam subqueries. Triggers com RAISE(ABORT) = canonical pattern.

## 4. Padrão Híbrido (Beads Model)

```
SQLite (.ai/atomic-flow.db)     ← runtime query cache, enforcement
  + .gitignore
JSONL/Markdown                   ← git-tracked, human-readable, source of truth
  + git add
```

- SQLite é cache regenerável a partir dos arquivos texto
- Se DB corrupto/ausente: regenera do markdown/JSONL
- Markdown exports para humanos e AI (context loading)
- SQLite para queries, enforcement, annotations

## 5. Markdown vs JSON vs SQLite

| Critério | Markdown | JSON/JSONL | SQLite |
|---|---|---|---|
| Read latency | 1-100ms | 1-100ms | <1ms |
| Git-friendly | Excelente | Bom (JSONL merge-safe) | Ruim (binário) |
| Human-readable | Excelente | Moderado | Requer tooling |
| Queryability | Parse inteiro | Parse inteiro | SQL indexed |
| ACID | Não | Não | Sim |
| Cross-feature queries | Impossível | Impossível | SQL |
| Concurrent | Frágil (serial field) | Frágil | WAL mode |
| Dependencies | Zero | Zero | better-sqlite3 ou node:sqlite |
| Token efficiency | Melhor (34-38% < JSON) | Baseline | N/A |

## 6. Recomendação da Pesquisa

**Abordagem em fases:**
1. **MVP:** Markdown como default, zero deps
2. **Enhancement:** SQLite opcional (--backend=sqlite)
3. **Hybrid:** SQLite cache + markdown source of truth (padrão Beads)

**OU: Application-level enforcement** (sem SQLite):
- Funções JS que validam transições de estado
- Mesma lógica dos triggers, mas no código do CLI
- Zero deps, zero risco de compilação
- Trade-off: sem ACID, sem cross-feature queries

## Fontes

- LangGraph SqliteSaver: docs.langchain.com
- CrewAI LTMSQLiteStorage: docs.crewai.com
- Beads: steve-yegge.medium.com, betterstack.com
- better-sqlite3: github.com/WiseLibs/better-sqlite3
- node:sqlite: nodejs.org/api/sqlite.html
- sql.js: github.com/sql-js/sql.js
- SQLite triggers: sqlite.org/lang_createtrigger.html
