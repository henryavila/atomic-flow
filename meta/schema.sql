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
