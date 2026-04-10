# Atomic Flow MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@henryavila/atomic-flow` — a 7-phase AI-assisted development system with enforcement via SQLite state machine + MCP server + Claude Code hooks, distributed as npm package.

**Architecture:** 3 layers — METHOD (10 skills teach workflow), ENFORCER (MCP server + SQLite triggers + hooks guarantee discipline), DISTRIBUTION (npm CLI installs everything). sql.js WASM for zero-native-compilation SQLite. Single DB in main repo at `.ai/atomic-flow.db`; worktrees access via absolute path resolved from `git worktree list --porcelain`. MCP server (stdio) is primary backend; skills call MCP tools internally. Each feature runs in isolated worktree via Claude Code native EnterWorktree/ExitWorktree.

**Tech Stack:** Node.js >= 18 (ESM), sql.js, @modelcontextprotocol/sdk, @henryavila/mdprobe, inquirer, js-yaml, node:test (built-in)

**References:**
- Spec: `docs/specs/2026-04-05-atomic-flow-mvp.md`
- Decisions: `docs/specs/decisions.md` (28 P&S entries)
- Skill Analysis: `docs/specs/skill-requirements-analysis.md`
- Method: `reference/METHOD-NATIVE.md`
- UI Mockups: `docs/specs/mockups/dashboard.html`, `docs/specs/mockups/feature-detail.html`

---

## Dependency Graph

```
T1 (setup)
├── T2 (db) ──────── T4 (enforcement) ── T12 (mcp core) ── T13-T15 (mcp tools)
├── T3 (utils) ───┬── T6 (manifest)
│                 └── T15 (mcp: hash)
├── T5 (render) ──── T8 (install) ──── T10 (cli)
│                     T9 (uninstall) ─┘
├── T7 (templates)
├── T11 (export/hydrate) ── T20 (ui-server)
├── T16 (hooks)
├── T17-T19 (skills)
└── T21-T23 (ui pages)
```

---

## File Structure

| File | Type | Responsibility |
|------|------|---------------|
| `package.json` | config | npm package, bin, deps, exports |
| `bin/cli.js` | entry | CLI: install, uninstall, ui, status, gate, new, hook |
| `src/db.js` | core | SQLite wrapper: open, save, CRUD, main-repo resolution |
| `src/enforcement.js` | core | Phase transitions, gate logic, preflight, reconcile |
| `src/hash.js` | util | SHA-256 for spec_hash and manifest checksums |
| `src/lock.js` | util | Advisory file lock for concurrent SQLite access |
| `src/yaml.js` | util | YAML frontmatter parse/stringify via js-yaml |
| `src/config.js` | util | IDE registry, template vars (claude-code only MVP) |
| `src/render.js` | core | Skill template rendering with var substitution |
| `src/manifest.js` | core | 3-hash manifest for installed file tracking |
| `src/prompts.js` | ui | CLI interactive prompts via inquirer |
| `src/install.js` | cmd | Install: skills, SQLite, hooks, MCP, dirs, manifest |
| `src/uninstall.js` | cmd | Uninstall: remove skills, hooks, SQLite, .ai/ |
| `src/validate.js` | core | Layer 1 spec validation (6 deterministic checks) |
| `src/export.js` | data | SQLite to tracking.md markdown export |
| `src/hydrate.js` | data | tracking.md to SQLite recovery hydration |
| `src/mcp-server.js` | server | MCP server (stdio), 11+1 tools, lazy schemas |
| `src/hooks/session-start.js` | hook | Inject phase + rules + status at session start |
| `src/hooks/pre-tool-use.js` | hook | File scoping enforcement by phase |
| `src/ui-server.js` | server | HTTP: /dashboard, /feature/:id, /review/:id, /api/* |
| `src/ui/dashboard.html` | page | Stats cards, feature cards, pipeline visualization |
| `src/ui/feature.html` | page | Hero pipeline, tabs, tasks table, sidebar |
| `src/ui/shared.css` | style | Functional shared styles |
| `src/ui/shared.js` | logic | SQLite WASM loader, query/render helpers |
| `skills/en/*.md` | skill | 10 skills (7 phases + status + gate + new) |
| `templates/*.md` | tmpl | 6 markdown templates + hooks.json |
| `meta/schema.sql` | contract | SQLite DDL with triggers |
| `meta/skills.yaml` | meta | Skill catalog for install routing |

---

## Contracts (RF14)

Contracts are committed BEFORE any task implementation. They define the data model, module boundaries, and MCP tool interfaces.

### C1: SQLite Schema — `meta/schema.sql`

```sql
-- Atomic Flow MVP — SQLite Schema v1
-- Engine: sql.js (WASM), zero native compilation
-- Topology: Single DB at {main-repo}/.ai/atomic-flow.db
-- All worktrees access via absolute path (P21)

PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════════════
-- LOOKUP TABLES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE valid_transitions (
  from_phase TEXT NOT NULL,
  to_phase   TEXT NOT NULL,
  gate       TEXT,           -- NULL = backward (no gate needed)
  direction  TEXT NOT NULL CHECK (direction IN ('forward', 'backward')),
  PRIMARY KEY (from_phase, to_phase)
);

INSERT INTO valid_transitions (from_phase, to_phase, gate, direction) VALUES
  ('research',  'spec',       'G1', 'forward'),
  ('spec',      'validate',   'G2', 'forward'),
  ('validate',  'decompose',  'G3', 'forward'),
  ('decompose', 'implement',  'G4', 'forward'),
  ('implement', 'review',     'G5', 'forward'),
  ('review',    'ship',       'G6', 'forward'),
  ('ship',      'done',       'G7', 'forward'),
  -- Backward transitions (rework loops) — human decision IS the gate (P20)
  ('validate',  'spec',       NULL,  'backward'),
  ('decompose', 'spec',       NULL,  'backward'),
  ('implement', 'decompose',  NULL,  'backward'),
  ('review',    'implement',  NULL,  'backward'),
  ('ship',      'review',     NULL,  'backward');

-- ═══════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════

CREATE TABLE features (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  slug          TEXT    NOT NULL UNIQUE,
  phase         TEXT    NOT NULL DEFAULT 'research'
                  CHECK (phase IN ('research','spec','validate','decompose',
                                   'implement','review','ship','done')),
  status        TEXT    NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','cancelled','done')),
  branch        TEXT    NOT NULL UNIQUE,
  spec_hash     TEXT,       -- SHA-256 hex 64 chars, set at G3 (RN11)
  cancel_reason TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE gates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id  INTEGER NOT NULL REFERENCES features(id),
  gate        TEXT    NOT NULL
                CHECK (gate IN ('G1','G2','G3','G4','G5','G6','G7')),
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  reason      TEXT,
  decided_at  TEXT,
  UNIQUE(feature_id, gate)
);

CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id  INTEGER NOT NULL REFERENCES features(id),
  task_id     TEXT    NOT NULL,              -- T1, T2, etc.
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'implementation'
                CHECK (type IN ('contract','implementation')),
  files       TEXT,                           -- JSON array of file paths
  deps        TEXT,                           -- JSON array of task_ids
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','done','failed')),
  strikes     INTEGER NOT NULL DEFAULT 0,
  commit_hash TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(feature_id, task_id)
);

CREATE TABLE learnings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id  INTEGER NOT NULL REFERENCES features(id),
  task_id     TEXT,                           -- NULL for feature-level
  category    TEXT    NOT NULL
                CHECK (category IN ('decision','constraint','pattern','interface')),
  content     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE session_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_id  INTEGER NOT NULL REFERENCES features(id),
  phase       TEXT    NOT NULL,
  started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT,
  summary     TEXT
);

CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO schema_version (version) VALUES (1);

-- ═══════════════════════════════════════════════════════════
-- ENFORCEMENT TRIGGERS
-- ═══════════════════════════════════════════════════════════

-- Phase transition: validate direction + gate approval
CREATE TRIGGER enforce_phase_transition
BEFORE UPDATE OF phase ON features
WHEN NEW.phase != OLD.phase AND OLD.status = 'active'
BEGIN
  -- 1. Transition must exist in lookup table
  SELECT RAISE(ABORT, 'Invalid phase transition')
  WHERE NOT EXISTS (
    SELECT 1 FROM valid_transitions
    WHERE from_phase = OLD.phase AND to_phase = NEW.phase
  );
  -- 2. Forward transitions require approved gate
  SELECT RAISE(ABORT, 'Gate not approved for forward transition')
  WHERE EXISTS (
    SELECT 1 FROM valid_transitions
    WHERE from_phase = OLD.phase AND to_phase = NEW.phase
      AND direction = 'forward'
  )
  AND NOT EXISTS (
    SELECT 1 FROM valid_transitions vt
    JOIN gates g ON g.gate = vt.gate
                AND g.feature_id = OLD.id
                AND g.status = 'approved'
    WHERE vt.from_phase = OLD.phase AND vt.to_phase = NEW.phase
  );
END;

-- Gate status: only pending to approved|rejected (P20: never auto)
CREATE TRIGGER enforce_gate_status
BEFORE UPDATE OF status ON gates
WHEN NEW.status != OLD.status
BEGIN
  SELECT RAISE(ABORT, 'Gate already decided')
  WHERE OLD.status != 'pending';
END;

-- Task status: valid transitions only
CREATE TRIGGER enforce_task_status
BEFORE UPDATE OF status ON tasks
WHEN NEW.status != OLD.status
BEGIN
  SELECT RAISE(ABORT, 'Invalid task status transition')
  WHERE NOT (
    (OLD.status = 'pending'     AND NEW.status = 'in_progress') OR
    (OLD.status = 'in_progress' AND NEW.status IN ('done', 'failed')) OR
    (OLD.status = 'failed'      AND NEW.status = 'in_progress')
  );
END;

-- Auto-set feature status to done when phase reaches done
CREATE TRIGGER feature_done_status
AFTER UPDATE OF phase ON features
WHEN NEW.phase = 'done'
BEGIN
  UPDATE features SET status = 'done' WHERE id = NEW.id;
END;

-- Auto-update timestamps
CREATE TRIGGER update_feature_ts
AFTER UPDATE ON features
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE features SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER update_task_ts
AFTER UPDATE ON tasks
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

### C2: Module Interfaces

Each module's public API. Implementation code MUST match these signatures.

**`src/db.js`** — SQLite wrapper + CRUD
```javascript
// Resolution
export function resolveMainRepo()                                     // string
export function getDbPath()                                           // string

// Lifecycle
export async function openDb(dbPath?)                                 // sql.js Database
export function saveDb(db, dbPath?)                                   // void
export async function withDb(fn)                                      // result of fn(db)

// Features
export function createFeature(db, name)                               // { id, slug, branch }
export function getFeature(db, id)                                    // Feature | null
export function getFeatureByBranch(db, branch)                        // Feature | null
export function getAllFeatures(db)                                     // Feature[]
export function setFeaturePhase(db, id, phase)                        // void (trigger validates)
export function setFeatureSpecHash(db, id, hash)                      // void
export function cancelFeature(db, id, reason)                         // void

// Gates
export function getGates(db, featureId)                               // Gate[]
export function setGateStatus(db, featureId, gate, status, reason?)   // void (trigger validates)

// Tasks
export function createTask(db, featureId, taskId, name, opts?)        // void
export function getTasks(db, featureId)                                // Task[]
export function getCurrentTask(db, featureId)                          // Task | null
export function setTaskStatus(db, featureId, taskId, status)           // void (trigger validates)
export function incrementStrikes(db, featureId, taskId)                // number (new count)
export function setTaskCommit(db, featureId, taskId, hash)             // void

// Learnings
export function addLearning(db, featureId, taskId, category, content)  // void
export function getLearnings(db, featureId)                             // Learning[]

// Stats
export function getFeatureStats(db)                                    // { total, active, done, cancelled }
```

**`src/enforcement.js`** — Transition logic + gate checks + preflight + reconcile
```javascript
export function transition(db, featureId, toPhase)                    // { success, message }
export async function approveGate(db, featureId, gate, repoPath)      // { success, commit_hash, message }
export function rejectGate(db, featureId, gate, reason)               // { success, message }
export function runPreflight(db, featureId, gate)                     // { flags[], can_approve }
export function reconcile(db, featureId, context)                     // { status, issues[] }
```

**`src/hash.js`** — SHA-256 utilities
```javascript
export function computeHash(content)                                  // string (64 hex chars)
export function extractSpecSections(specMd)                           // string (RF+RN+EC only)
export function computeSpecHash(specMd)                               // string (hash of sections)
export function computeFileHash(filePath)                             // string
export function truncateHash(hash, len?)                              // string (default 8 chars)
```

**`src/lock.js`** — Advisory file lock (EC02)
```javascript
export function acquireLock(lockPath, opts?)                          // boolean
export function releaseLock(lockPath)                                 // void
export async function withLock(lockPath, fn)                          // result of fn()
```

**`src/config.js`** — IDE registry + template vars
```javascript
export const IDE_REGISTRY                                             // { 'claude-code': { name, skillDir, settingsFile, mcpFile } }
export const TEMPLATE_VARS                                            // { 'claude-code': { BASH_TOOL, READ_TOOL, ... } }
export function getConfig(ide)                                        // IdeConfig
export function getTemplateVars(ide)                                  // vars object
```

**`src/render.js`** — Template rendering (RN01)
```javascript
export function renderTemplate(source, vars, context?)                // string
export function renderSkill(source, ide?)                             // string
export function validateRendered(content)                             // { valid, unresolvedVars[] }
```

**`src/manifest.js`** — 3-hash file tracking (RF04)
```javascript
export function createManifest()                                      // Manifest
export function readManifest(dir)                                     // Manifest | null
export function addEntry(manifest, relPath, hashes)                   // void
export function checkConflicts(manifest)                              // Conflict[]
export function saveManifest(manifest, dir)                           // void
```

**`src/validate.js`** — Layer 1 spec validation (RF12)
```javascript
export function runCheck(checkId, specContent)                        // { pass, details }
export function validateSpec(specContent)                              // { checks[], passed }
```

**`src/export.js`** — SQLite to markdown (RF22)
```javascript
export function exportTracking(db, featureId)                         // string (tracking.md)
export function exportStatus(db, featureId?)                          // FeatureStatus object
```

**`src/hydrate.js`** — markdown to SQLite recovery (EC01)
```javascript
export function hydrateFromTracking(db, trackingMd)                   // { features, tasks }
export function hydrateFromTaskFiles(db, taskDir)                     // { tasks }
```

### C3: MCP Tool Schemas

11 user-facing tools + 1 internal. Schemas kept minimal for context economy (RF04b).

| Tool | Params | Returns | Internal? |
|------|--------|---------|-----------|
| `new_feature` | `{ name: string }` | `{ id, slug, branch }` | no |
| `cancel_feature` | `{ id: number, reason: string }` | `{ success, message }` | no |
| `status` | `{ id?: number }` | `{ feature, phase, gates, tasks, learnings_count }` | no |
| `gate_approve` | `{ id: number, gate: string }` | `{ success, commit_hash, message }` | no |
| `preflight` | `{ id: number, gate: string }` | `{ flags[], can_approve }` | no |
| `validate_spec` | `{ id: number }` | `{ checks[], passed }` | no |
| `task_done` | `{ id: number, task_id: string }` | `{ success, learnings_prompt }` | no |
| `learn` | `{ id: number, task_id?: string, category: string, content: string }` | `{ success, revisions[] }` | no |
| `reconcile` | `{ id: number }` | `{ status, issues[] }` | no |
| `open_ui` | `{ id?: number }` | `{ url, message }` | no |
| `transition` | `{ id: number, to_phase: string }` | `{ success, message }` | **yes** |

---

## Sub-feature A: Core Engine (T1-T4)

### Task 1: Project Setup [~5 min]

**Files:**
- Create: `package.json`, `tests/setup.js`

**Deps:** none
**Covers:** RF01 (package definition)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@henryavila/atomic-flow",
  "version": "0.1.0",
  "description": "7-phase AI-assisted development system with enforcement",
  "type": "module",
  "bin": { "atomic-flow": "./bin/cli.js" },
  "exports": { ".": "./src/index.js", "./hooks/*": "./src/hooks/*.js" },
  "engines": { "node": ">=18" },
  "files": ["bin/", "src/", "skills/", "templates/", "meta/"],
  "scripts": {
    "test": "node --test tests/",
    "test:watch": "node --test --watch tests/"
  },
  "dependencies": {
    "sql.js": "^1.10.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@henryavila/mdprobe": "^0.1.0",
    "inquirer": "^9.0.0",
    "js-yaml": "^4.1.0"
  },
  "keywords": ["ai", "development", "workflow", "enforcement", "claude"],
  "license": "MIT"
}
```

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p src/ui src/hooks tests bin skills/en templates meta
```

- [ ] **Step 3: Create test helper — `tests/setup.js`**

Provides `createTestDb()` (in-memory SQLite with schema) and `seedFeature(db, name)` (create feature + 7 gates). Uses `meta/schema.sql` as the source of truth.

- [ ] **Step 4: Install deps, verify sql.js loads**

```bash
npm install
node -e "import('sql.js').then(() => console.log('OK'))"
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/setup.js meta/schema.sql
git commit -m "feat(core): project setup with deps and SQLite schema contract"
```

---

### Task 2: Database Module [~15 min]

**Files:**
- Create: `src/db.js`, `tests/db.test.js`

**Deps:** T1
**Covers:** RF04d, RF05, RF06, RF07, RN05, TC-RF04d-6, TC-RF05-1, TC-RF05-2, TC-RF06-1 through TC-RF06-4, TC-RF07-1

- [ ] **Step 1: Write failing tests**

Tests to write in `tests/db.test.js`:
1. `createFeature` — sequential padded ID (001, 002), slug, branch format
2. `createFeature` — rejects invalid name (special chars only)
3. Phase transition — forward with approved gate succeeds
4. Phase transition — forward without gate throws "Gate not approved"
5. Phase transition — skip phase throws "Invalid phase transition"
6. Phase transition — backward without gate succeeds
7. Gate status — blocks re-approval of decided gate
8. Task status — enforces valid transitions (pending to in_progress to done)
9. Task status — allows retry from failed to in_progress
10. `incrementStrikes` — returns new count

- [ ] **Step 2: Implement `src/db.js`**

Implement all functions from C2 interface. Key implementation details:
- `resolveMainRepo()`: runs `git worktree list --porcelain`, extracts first "worktree" field
- `openDb(dbPath)`: uses `initSqlJs()`, reads file or creates new DB with schema
- `saveDb(db, dbPath)`: `db.export()` to Buffer, writeFileSync
- `withDb(fn)`: auto open/save/close wrapper
- `createFeature(db, name)`: slugify name, get next ID via MAX+1, pad to 3 digits, insert + create 7 gates
- `setFeaturePhase(db, id, phase)`: direct UPDATE — trigger validates
- `cancelFeature(db, id, reason)`: validates reason not empty, feature not done

- [ ] **Step 3: Run tests — all pass**

```bash
node --test tests/db.test.js
```

- [ ] **Step 4: Commit**

```bash
git add src/db.js tests/db.test.js
git commit -m "feat(core): database module with trigger-enforced transitions"
```

---

### Task 3: Utility Modules [~10 min]

**Files:**
- Create: `src/hash.js`, `src/lock.js`, `src/yaml.js`, `src/config.js`
- Create: `tests/hash.test.js`, `tests/lock.test.js`, `tests/config.test.js`

**Deps:** T1
**Covers:** RN11 (spec_hash), EC02 (lock), RN01 (template vars), TC-RN11-1, TC-RN11-5

- [ ] **Step 1: Write failing tests**

`tests/hash.test.js`:
1. `computeHash('hello')` returns known SHA-256 hex (64 chars)
2. `extractSpecSections` includes RF+RN+EC, excludes Objetivo/Arquivos/TestContracts
3. `computeSpecHash` unchanged when Validation section changes (RN11 scoping)

`tests/lock.test.js`:
1. `acquireLock` + `releaseLock` lifecycle
2. Second `acquireLock` on same path fails (returns false)

`tests/config.test.js`:
1. `TEMPLATE_VARS['claude-code']` has BASH_TOOL='Bash', READ_TOOL='Read', etc.

- [ ] **Step 2: Implement all four modules**

`src/hash.js`: Uses `node:crypto` createHash('sha256'). `extractSpecSections` scans for `## Requisitos Funcionais`, `## Regras de Negocio`, `## Edge Cases` headers and collects lines until next `## ` header.

`src/lock.js`: Uses `writeFileSync(path, pid, { flag: 'wx' })` for atomic create. Retry with configurable timeout/retries. `releaseLock` = unlinkSync.

`src/yaml.js`: Thin wrapper around js-yaml. Adds `parseFrontmatter(content)` for task files.

`src/config.js`: Exports IDE_REGISTRY and TEMPLATE_VARS constants. Only claude-code for MVP.

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/hash.test.js tests/lock.test.js tests/config.test.js
git add src/hash.js src/lock.js src/yaml.js src/config.js tests/hash.test.js tests/lock.test.js tests/config.test.js
git commit -m "feat(core): utility modules — hash, lock, yaml, config"
```

---

### Task 4: Enforcement Module [~15 min]

**Files:**
- Create: `src/enforcement.js`, `tests/enforcement.test.js`

**Deps:** T2 (db.js)
**Covers:** RF06, RF07, RF07b, RF19, RF21, EC04, TC-RF06-*, TC-RF07-*, TC-RF07b-*, TC-RF21-*

- [ ] **Step 1: Write failing tests**

`tests/enforcement.test.js`:
1. `transition` — succeeds for valid forward with gate approved
2. `transition` — returns `{ success: false }` with message for missing gate
3. `runPreflight('G4')` — flags task with >3 files
4. `runPreflight('G4')` — flags file collision between tasks
5. `runPreflight('G4')` — detects cyclic dependencies
6. `runPreflight('G5')` — flags pending tasks
7. `runPreflight('G4')` — warns when >10 tasks (EC04)
8. `reconcile` — returns 'ok' when all checks pass
8. `reconcile` — returns 'drift' when spec_hash differs

- [ ] **Step 2: Implement `src/enforcement.js`**

Key functions:
- `transition(db, featureId, toPhase)` — wraps `setFeaturePhase` in try/catch, returns `{ success, message }`
- `approveGate(db, featureId, gate, repoPath)` — (1) git add + commit with gate message per P28, (2) set gate status, (3) return commit hash
- `runPreflight(db, featureId, gate)` — switch on gate, runs gate-specific checks per RF07b
- `reconcile(db, featureId, context)` — checks all gates approved, all tasks done, spec_hash match, no orphans
- Helper: `detectCyclicDeps(tasks)` — DFS cycle detection on task dependency graph
- Helper: `gateDescription(gate)` — human-readable gate name for commit messages

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/enforcement.test.js
git add src/enforcement.js tests/enforcement.test.js
git commit -m "feat(core): enforcement — transitions, gates, preflight, reconcile"
```

---

## Sub-feature B: Distribution (T5-T10)

### Task 5: Template Rendering [~10 min]

**Files:**
- Create: `src/render.js`, `tests/render.test.js`

**Deps:** T1
**Covers:** RF02, RN01, TC-RF02-1, TC-RF02-2, TC-RF02-3

- [ ] **Step 1: Write tests**

1. `renderTemplate` substitutes `{{BASH_TOOL}}` with 'Bash'
2. `renderTemplate` removes `{{#if ide.gemini}}...{{/if}}` block for claude-code
3. `validateRendered` catches `{{UNKNOWN_VAR}}`

- [ ] **Step 2: Implement `src/render.js`**

`renderTemplate(source, vars, context)`:
1. Remove conditional blocks: `{{#if ide.X}}...{{/if}}` — keep block only if context.ide matches X
2. Substitute vars: `{{KEY}}` replaced by vars[KEY]

`renderSkill(source, ide)`: gets template vars from config, renders, validates no unresolved vars.

`validateRendered(content)`: regex scan for `{{WORD}}` patterns — return list of unresolved.

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/render.test.js
git add src/render.js tests/render.test.js
git commit -m "feat(dist): template rendering with var substitution and validation"
```

---

### Task 6: Manifest Module [~10 min]

**Files:**
- Create: `src/manifest.js`, `tests/manifest.test.js`

**Deps:** T3 (hash.js)
**Covers:** RF04, TC-RF04-1 through TC-RF04-4

- [ ] **Step 1: Write tests**

1. Create manifest, add entry, save, reload — data preserved
2. `checkConflicts` detects modified file (installed != current hash)
3. No conflict when file unchanged (installed == current)

- [ ] **Step 2: Implement `src/manifest.js`**

Manifest lives at `.atomic-flow/manifest.json`. Each entry has 3 hashes: `installed` (at install time), `current` (on disk now), `package` (in npm package). Conflict = installed != current (user modified the file).

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/manifest.test.js
git add src/manifest.js tests/manifest.test.js
git commit -m "feat(dist): manifest module with 3-hash conflict detection"
```

---

### Task 7: All Templates [~10 min]

**Files:**
- Create: `templates/spec.md`, `templates/task.md`, `templates/tracking.md`, `templates/research-index.md`, `templates/research-topic.md`, `templates/decisions.md`, `templates/hooks.json`

**Deps:** none (pure content)
**Covers:** RF05 (feature artifacts), RF15 (task format), RF16/RF17 (hooks)

- [ ] **Step 1: Create all templates**

Each template uses `{{VAR}}` placeholders filled at feature creation:
- `spec.md`: Sections — Objetivo, Requisitos Funcionais (RF with checkmark/X), Regras de Negocio, Edge Cases, Arquivos, Decisoes, Alternativas, Test Contracts, Fora de Escopo
- `task.md`: YAML frontmatter (id, name, type, files, deps, status, strikes) + body (Contexto, Arquivos, Criterio de Done, Test Contracts)
- `tracking.md`: Feature header + Gates table + Tasks table + Learnings count
- `research-index.md`: Resumo Executivo + links to research files + shared
- `research-topic.md`: Fontes, Analise, Sintese, Decisoes Derivadas
- `decisions.md`: Header + empty journal
- `hooks.json`: SessionStart + PreToolUse hook config pointing to `bin/cli.js hook` commands

`templates/hooks.json`:
```json
{
  "hooks": {
    "SessionStart": [{
      "type": "command",
      "command": "node node_modules/@henryavila/atomic-flow/bin/cli.js hook session-start"
    }],
    "PreToolUse": [{
      "type": "command",
      "command": "node node_modules/@henryavila/atomic-flow/bin/cli.js hook pre-tool-use",
      "toolNames": ["Write", "Edit", "MultiEdit", "NotebookEdit"]
    }]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add templates/
git commit -m "feat(dist): all templates — spec, task, tracking, research, decisions, hooks"
```

---

### Task 8: Install Module [~15 min]

**Files:**
- Create: `src/install.js`, `tests/install.test.js`

**Deps:** T2, T3, T5, T6, T7
**Covers:** RF01, RF02, RF04b, EC03, EC07, TC-RF01-*

- [ ] **Step 1: Write tests**

1. Install in clean git repo creates: skills dir, SQLite, .mcp.json, .gitignore entries
2. Installs 10 skills with rendered template vars
3. Aborts if not a git repo ("Git repository required")
4. Creates manifest with hashes

- [ ] **Step 2: Implement `src/install.js`**

`install(opts)` orchestrates:
1. Check git repo + Node version + detect `.ai/` conflict (EC07: warn if exists)
2. Register SIGINT handler for cleanup on Ctrl+C (EC03)
3. Create dirs: `.ai/features/`, `.claude/skills/atomic-flow/`
3. Read `meta/skills.yaml`, render each skill via `renderSkill`, write to skillDir
4. Initialize SQLite via `openDb` + `saveDb`
5. Merge hooks from `templates/hooks.json` into `.claude/settings.json`
6. Add MCP server entry to `.mcp.json`
7. Append to `.gitignore`: `.ai/atomic-flow.db`, `.ai/atomic-flow.db.lock`
8. Create manifest with all installed file hashes

Returns `{ success, installed[], skipped[], errors[] }`.

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/install.test.js
git add src/install.js tests/install.test.js
git commit -m "feat(dist): install module — skills, SQLite, hooks, MCP, manifest"
```

---

### Task 9: Uninstall Module [~8 min]

**Files:**
- Create: `src/uninstall.js`, `tests/uninstall.test.js`

**Deps:** T2, T6
**Covers:** RF03, TC-RF03-*

- [ ] **Step 1: Write tests**

1. Removes skills, hooks, SQLite, .ai/features/, manifest, MCP entry
2. Preserves `docs/features/` and `docs/research/`
3. Warns about active features

- [ ] **Step 2: Implement `src/uninstall.js`**

`uninstall(opts)`:
1. Check for active features — warn if found, require confirmation
2. Remove: skills dir, SQLite + lock, .ai/features/, .atomic-flow/manifest.json
3. Remove hook entries from settings.json (filter by 'atomic-flow' in command)
4. Remove MCP entry from .mcp.json (only 'atomic-flow', preserve others)
5. Preserve: docs/features/, docs/research/, .gitignore entries (mention in output)

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/uninstall.test.js
git add src/uninstall.js tests/uninstall.test.js
git commit -m "feat(dist): uninstall — removes tools, preserves project patrimony"
```

---

### Task 10: CLI Prompts + Entry Point [~10 min]

**Files:**
- Create: `src/prompts.js`, `bin/cli.js`, `tests/cli.test.js`

**Deps:** T8, T9
**Covers:** All CLI commands

- [ ] **Step 1: Implement `src/prompts.js`**

Thin wrapper around inquirer: `confirm(message)` returns boolean.

- [ ] **Step 2: Implement `bin/cli.js`**

Hashbang `#!/usr/bin/env node`. Routes commands: install, uninstall, ui, status, gate, new, hook. Each command lazily imports its module. Help text shows all commands.

CLI commands:
- `install [--force]`: calls `install()`
- `uninstall`: calls `uninstall()`, prompts if active features
- `ui [feature_id]`: calls `startServer()`
- `status [feature_id]`: calls `withDb` + `exportStatus`
- `gate approve|reject GN`: calls `approveGate` or `rejectGate`
- `new <name>`: calls `createFeature`
- `hook session-start|pre-tool-use`: calls hook handler (internal)

- [ ] **Step 3: Run tests, commit**

```bash
chmod +x bin/cli.js
node --test tests/cli.test.js
git add bin/cli.js src/prompts.js tests/cli.test.js
git commit -m "feat(dist): CLI entry point with all commands"
```

---

## Sub-feature C: MCP + Skills + Hooks (T11-T19)

### Task 11: Export + Hydrate [~10 min]

**Files:**
- Create: `src/export.js`, `src/hydrate.js`, `tests/export.test.js`

**Deps:** T2
**Covers:** RF22, EC01, TC-RF22-*, TC-RF21-4

- [ ] **Step 1: Write tests**

1. `exportTracking` produces markdown with feature name, tasks table, gates table
2. `hydrateFromTracking` parses markdown tables back into SQLite
3. Round-trip: create data, export, hydrate into fresh DB, compare

- [ ] **Step 2: Implement**

`src/export.js`: Reads feature, gates, tasks, learnings from DB. Fills tracking.md template with actual data. Returns markdown string.

`src/hydrate.js`: Parses tracking.md markdown tables. Extracts feature info, gates, tasks. Inserts into SQLite. Used for EC01 recovery when SQLite is lost.

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/export.test.js
git add src/export.js src/hydrate.js tests/export.test.js
git commit -m "feat(mcp): export + hydrate for tracking round-trip and recovery"
```

---

### Task 12: MCP Server Core [~15 min]

**Files:**
- Create: `src/mcp-server.js`, `tests/mcp.test.js`

**Deps:** T2, T4
**Covers:** RF04b, RF18, RN06, TC-RF04b-*

- [ ] **Step 1: Write tests**

1. `getToolList()` returns exactly 11 tools with expected names
2. Each tool has name, description, inputSchema

- [ ] **Step 2: Implement `src/mcp-server.js`**

Structure:
- TOOLS array with minimal schemas (name, description, inputSchema with required params only)
- `handleToolCall(name, args)` switch — delegates to db/enforcement/export modules
- Advisory lock acquired for write operations, released after
- Server startup: `@modelcontextprotocol/sdk` Server with stdio transport
- Conditional startup: only when file is the entry point

Tool implementations delegate to existing modules:
- `new_feature` calls `createFeature` from db.js
- `cancel_feature` calls `cancelFeature` from db.js
- `status` calls `exportStatus` from export.js
- `gate_approve` calls `approveGate` from enforcement.js
- `preflight` calls `runPreflight` from enforcement.js
- `validate_spec` calls `validateSpec` from validate.js
- `task_done` calls `setTaskStatus` from db.js
- `learn` calls `addLearning` from db.js + scans pending tasks for interface revisions (RF18) + enforces max 3 learning cycles per feature (RN06)
- `reconcile` calls `reconcile` from enforcement.js
- `open_ui` calls `startServer` from ui-server.js
- `transition` calls `transition` from enforcement.js

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/mcp.test.js
git add src/mcp-server.js tests/mcp.test.js
git commit -m "feat(mcp): MCP server with stdio transport and 11 tools"
```

---

### Task 13: MCP Integration Tests — Feature Lifecycle [~10 min]

**Files:**
- Create: `tests/mcp-lifecycle.test.js`

**Deps:** T12
**Covers:** RF05, RF05d, TC-RF05-*, TC-RF05d-*

Tests:
1. `createFeature` generates padded ID, starts in research phase
2. `cancelFeature` requires reason, rejects done features
3. Full lifecycle: research through done with all gates
4. `getFeature` returns null for nonexistent ID

- [ ] **Commit**

```bash
git add tests/mcp-lifecycle.test.js
git commit -m "test(mcp): feature lifecycle integration tests"
```

---

### Task 14: MCP Integration Tests — Gates + Preflight [~10 min]

**Files:**
- Create: `tests/mcp-gates.test.js`

**Deps:** T12, T4
**Covers:** RF07, RF07b, TC-RF07-*, TC-RF07b-*

Tests:
1. Gate approve sets status, returns success
2. Gate reject keeps phase, records reason
3. Preflight G4 returns flags array with can_approve boolean
4. Preflight universal: check phase status updated

- [ ] **Commit**

```bash
git add tests/mcp-gates.test.js
git commit -m "test(mcp): gate approval and preflight integration tests"
```

---

### Task 15: Spec Validation (Layer 1) [~15 min]

**Files:**
- Create: `src/validate.js`, `tests/validate.test.js`

**Deps:** T2, T3
**Covers:** RF12, TC-RF12-*

- [ ] **Step 1: Write tests for 6 checks**

1. C1: RF without checkmark/X criteria detected
2. C2: weak word "should" in criterion flagged
3. C3: implementation language "implement JWT" flagged
4. C4: missing required sections detected
5. C5: RF without matching TC detected
6. C6: pending marker [TODO] detected

- [ ] **Step 2: Implement `src/validate.js`**

6 deterministic checks:
- C1: regex for `- **RF\d+:**` then verify section has both checkmark and X
- C2: regex for weak words in checkmark/X criteria lines
- C3: regex for implementation verbs and code patterns in RF/RN/EC sections
- C4: check all 7 required section headers present
- C5: cross-reference RF IDs with TC-RF IDs
- C6: scan for `[TBD]`, `[TODO]`, `[?]`, `[DECIDIR]`

`validateSpec(content)` runs all 6, returns `{ checks[], passed }`.

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/validate.test.js
git add src/validate.js tests/validate.test.js
git commit -m "feat(mcp): Layer 1 spec validation — 6 deterministic checks"
```

---

### Task 16: Hook Scripts [~10 min]

**Files:**
- Create: `src/hooks/session-start.js`, `src/hooks/pre-tool-use.js`, `tests/hooks.test.js`

**Deps:** T2, T12
**Covers:** RF16, RF17, TC-RF16-*, TC-RF17-*

- [ ] **Step 1: Write tests**

1. `formatSessionOutput` includes phase icon, rules for implement phase, task info
2. `checkFileScope('research', 'src/app.ts', ...)` returns `{ allowed: false }`
3. `checkFileScope('research', 'docs/research/topic.md', ...)` returns `{ allowed: true }`
4. `checkFileScope('ship', 'any-file', ...)` returns `{ allowed: false }` (ship = no writes)

- [ ] **Step 2: Implement**

`src/hooks/session-start.js`:
- `handleSessionStart()`: reads branch, looks up feature in SQLite, outputs phase + rules + task
- `formatSessionOutput({ feature, task, gates })`: renders status block with phase icon, 3 rules (from PHASE_RULES lookup), current task, drift warning if spec_hash exists
- PHASE_RULES: constant mapping phase to 3 rules (from spec RF16)
- PHASE_ICONS: research='①', spec='②', ..., done='✓'

`src/hooks/pre-tool-use.js`:
- `handlePreToolUse()`: reads stdin (JSON with tool info), extracts file_path, looks up feature phase, checks scope
- `checkFileScope(phase, filePath, featureId, slug)`: PHASE_SCOPES lookup per RF17
- PHASE_SCOPES: research=docs/research/, spec=spec.md+decisions.md, validate=spec.md, decompose=tasks+contracts, implement=3-tier, review=src+tests, ship=none
- Exit 0 = allow, exit 2 = block with reason in stderr

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/hooks.test.js
git add src/hooks/ tests/hooks.test.js
git commit -m "feat(mcp): SessionStart + PreToolUse hook scripts"
```

---

### Task 17: Skills Batch 1 — Research, Spec, Validate [~15 min]

**Files:**
- Create: `skills/en/1-research.md`, `skills/en/2-spec.md`, `skills/en/3-spec-validate.md`
- Create: `tests/skills-structure.test.js`

**Deps:** T5
**Covers:** RN02, RF05b, RF12, RF13, TC-RN02-*

- [ ] **Step 1: Create skill structure test**

`tests/skills-structure.test.js` — runs for ALL skills in `skills/en/`:
1. Has Iron Law section (in code block)
2. Has `<HARD-GATE>` XML tag
3. Has Process section with numbered steps
4. Has Red Flags in first person (quotes with "eu"/"ja sei"/"nao preciso"/"vou")
5. Has Rationalization table (pipe-delimited)
6. No hardcoded tool names (uses `{{VAR}}` template vars)

- [ ] **Step 2: Create skills**

Each skill follows RN02 structure. Content derived from `docs/specs/skill-requirements-analysis.md`.

**`1-research.md`**: Iron Law = `DISCOVER AND DOCUMENT. NEVER DECIDE. NEVER IMPLEMENT.` / HARD-GATE = creating file outside docs/research / Process: read codebase, WebSearch, save granularly / MCP: `transition(id, 'research')`

**`2-spec.md`**: Iron Law = `ONE QUESTION AT A TIME. NEVER BATCH.` / HARD-GATE = writing spec without 3+ questions / Process: read research, interview, write spec with checkmark/X, generate TCs, update decisions.md / MCP: `transition(id, 'spec')`

**`3-spec-validate.md`**: Iron Law = `THREE LAYERS IN ORDER. NO SHORTCUTS.` / HARD-GATE = approving G3 without all layers / Process: Layer 1 via MCP validate_spec, Layer 2 via mdprobe, Layer 3 adversarial / MCP: `validate_spec(id)`, `transition(id, 'validate')`

- [ ] **Step 3: Run structure test, commit**

```bash
node --test tests/skills-structure.test.js
git add skills/en/1-research.md skills/en/2-spec.md skills/en/3-spec-validate.md tests/skills-structure.test.js
git commit -m "feat(skills): 1-research, 2-spec, 3-spec-validate with RN02 structure"
```

---

### Task 18: Skills Batch 2 — Decompose, Implement, Review [~10 min]

**Files:**
- Create: `skills/en/4-decompose.md`, `skills/en/5-implement.md`, `skills/en/6-review.md`

**Deps:** T5, T17 (structure test)
**Covers:** RF14, RF15, RF19, RF20

**`4-decompose.md`**: Iron Law = `CONTRACTS FIRST. TASKS SECOND.` / HARD-GATE = creating tasks without committed contracts / Process: generate contracts, commit, propose tasks, human reviews, create task files

**`5-implement.md`**: Iron Law = `NO FIX WITHOUT ROOT CAUSE. RED BEFORE GREEN.` / HARD-GATE = writing code without failing test / Process: read task, write test, implement, run, commit, MCP task_done / Recovery: R1-R4 escalation

**`6-review.md`**: Iron Law = `EXECUTION VS SPECIFICATION. NOT PROCESS.` / HARD-GATE = approving G6 with CRITICAL pending / Process: compare impl vs spec, check convergence, max 3 rounds

- [ ] **Run structure test, commit**

```bash
node --test tests/skills-structure.test.js
git add skills/en/4-decompose.md skills/en/5-implement.md skills/en/6-review.md
git commit -m "feat(skills): 4-decompose, 5-implement, 6-review"
```

---

### Task 19: Skills Batch 3 + Meta [~10 min]

**Files:**
- Create: `skills/en/7-ship.md`, `skills/en/status.md`, `skills/en/gate.md`, `skills/en/new.md`
- Create: `meta/skills.yaml`

**Deps:** T5, T17
**Covers:** RF21, RF22, RF07, RF05

**`7-ship.md`**: Iron Law = `RECONCILE BEFORE MERGE. NO CODE CHANGES.` / Process: MCP reconcile, full test suite, merge, ExitWorktree, cleanup .ai/features/

**`status.md`**: Read-only utility. Process: MCP status, format with RN10 blocks.

**`gate.md`**: Process: MCP preflight, display flags, human decides, MCP gate_approve or reject.

**`new.md`**: Process: MCP new_feature, EnterWorktree, create dirs, copy templates.

**`meta/skills.yaml`**: Catalog of all 10 skills with name, slug (atomic-flow:X), source path, phase.

- [ ] **Run structure test, commit**

```bash
node --test tests/skills-structure.test.js
git add skills/en/7-ship.md skills/en/status.md skills/en/gate.md skills/en/new.md meta/skills.yaml
git commit -m "feat(skills): 7-ship, status, gate, new + skills.yaml catalog"
```

---

## Sub-feature D: UI (T20-T23)

### Task 20: UI Server [~10 min]

**Files:**
- Create: `src/ui-server.js`, `tests/ui-server.test.js`

**Deps:** T2, T11
**Covers:** RF08, RF11, RN07, EC08, TC-RF08-*, TC-RF11-*

- [ ] **Step 1: Write test**

1. Server starts on available port, returns URL
2. `/api/features` returns JSON array
3. Port in use triggers retry on next port

- [ ] **Step 2: Implement `src/ui-server.js`**

Pure `node:http` server. Routes:
- `/` and `/dashboard` serve `src/ui/dashboard.html`
- `/feature/:id` serves `src/ui/feature.html`
- `/review/:id` delegates to mdprobe via `createHandler()`
- `/api/features` returns all features from SQLite
- `/api/feature/:id` returns feature + gates + tasks + learnings
- Static files from `src/ui/` directory
- Listens on 0.0.0.0 (EC08 remote access), warns about no auth
- EADDRINUSE retry on next port

- [ ] **Step 3: Run tests, commit**

```bash
node --test tests/ui-server.test.js
git add src/ui-server.js tests/ui-server.test.js
git commit -m "feat(ui): HTTP server with API routes and static serving"
```

---

### Task 21: UI Shared Styles + JS [~10 min]

**Files:**
- Create: `src/ui/shared.css`, `src/ui/shared.js`

**Deps:** T20
**Covers:** RF09 styles, RF10 styles

- [ ] **Step 1: Create `shared.css`**

Dark theme functional styles. No external deps (no Tailwind CDN). Reference mockups for design tokens:
- Colors: surface-900=#020617, surface-800=#0f172a, accent-500=#0ea5e9, phase-done=#22c55e, phase-active=#f59e0b
- Typography: system font stack (Inter if available)
- Components: `.feature-card`, `.stats-card`, `.phase-line`, `.gate-diamond`, `.pulse`, `.task-table`, `.tab-active`/`.tab-inactive`

- [ ] **Step 2: Create `shared.js`**

Client-side helpers (no build step):
- `fetchFeatures()`, `fetchFeature(id)` — API calls
- `renderPipeline(feature)` — 7 phases + 7 gates as HTML
- `renderTaskTable(tasks)` — HTML table
- `formatDate(iso)` — locale-aware date formatting

- [ ] **Step 3: Commit**

```bash
git add src/ui/shared.css src/ui/shared.js
git commit -m "feat(ui): shared styles and client-side JS helpers"
```

---

### Task 22: Dashboard Page [~10 min]

**Files:**
- Create: `src/ui/dashboard.html`

**Deps:** T20, T21
**Covers:** RF09, TC-RF09-*

Structure (reference `docs/specs/mockups/dashboard.html`):
1. Header: "Atomic Flow" + branding
2. Stats cards row: Total features, Active, Tasks done (progress bar), Strike rate
3. Filter bar: phase/status
4. Feature cards grid: each card has slug, pipeline viz, task progress, last update
5. Empty state: "Nenhuma feature. Crie com `atomic-flow new <name>`"

HTML loads shared.css + shared.js inline. Fetches `/api/features` on load, renders dynamically.

- [ ] **Commit**

```bash
git add src/ui/dashboard.html
git commit -m "feat(ui): dashboard page with stats, pipeline, feature cards"
```

---

### Task 23: Feature Detail Page [~10 min]

**Files:**
- Create: `src/ui/feature.html`

**Deps:** T20, T21
**Covers:** RF10, TC-RF10-*

Structure (reference `docs/specs/mockups/feature-detail.html`):
1. Header with back link to dashboard
2. Hero: full 7-phase pipeline with gate diamonds and completion dates
3. Tabs: Tasks | Gates | Learnings | Preflight
4. Main: tab content area
5. Sidebar: feature info (ID, branch, created, phase, spec_hash), all 7 gates with status, actions (Review Spec, Run Preflight, Approve Gate, Export Tracking)

HTML loads shared.css + shared.js inline. Fetches `/api/feature/:id` on load, renders dynamically. Feature ID extracted from URL path. 404 handling for invalid IDs.

- [ ] **Commit**

```bash
git add src/ui/feature.html
git commit -m "feat(ui): feature detail page with tabs, pipeline, sidebar"
```

---

## Self-Review Checklist

After implementing all tasks, verify:

- [ ] **Spec coverage:** Every RF, RN, EC mapped to at least one task
- [ ] **Type consistency:** Function signatures across tasks match C2 interfaces
- [ ] **No placeholders:** No TBD, TODO, or implement-later in any task
- [ ] **Test coverage:** Core modules have unit tests; MCP tools have integration tests
- [ ] **Trigger enforcement:** SQLite triggers tested for valid/invalid transitions
- [ ] **Template vars:** All skills use `{{VAR}}` syntax, no hardcoded tool names (TC-RN01-*)
- [ ] **Skill structure:** All 10 skills have 5 RN02 sections (TC-RN02-*)
- [ ] **Hook behavior:** SessionStart outputs phase+rules; PreToolUse blocks correctly (TC-RF16-*, TC-RF17-*)
- [ ] **spec_hash scope:** Computed from RF+RN+EC only, not entire spec (TC-RN11-*)
- [ ] **Advisory lock:** Concurrent access serialized (EC02)
- [ ] **MCP tool count:** Exactly 11 tools listed (10 user-facing + 1 internal)
- [ ] **Gate auto-commit:** Every gate_approve commits artifacts BEFORE recording (P28)
