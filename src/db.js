import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import initSqlJs from 'sql.js';

const SCHEMA_PATH = new URL('../meta/schema.sql', import.meta.url).pathname;
const DB_FILENAME = '.ai/atomic-flow.db';

let SQL;

// ═══════════════════════════════════════════════════════════
// Resolution
// ═══════════════════════════════════════════════════════════

export function resolveMainRepo() {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
  const match = output.match(/^worktree\s+(.+)$/m);
  if (!match) throw new Error('Could not resolve main repo from git worktree list');
  return match[1];
}

export function getDbPath() {
  return join(resolveMainRepo(), DB_FILENAME);
}

// ═══════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════

export async function openDb(dbPath) {
  if (!SQL) SQL = await initSqlJs();
  const resolvedPath = dbPath || getDbPath();

  if (existsSync(resolvedPath)) {
    const buffer = readFileSync(resolvedPath);
    return new SQL.Database(buffer);
  }

  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  const db = new SQL.Database();
  db.run(schema);
  return db;
}

export function saveDb(db, dbPath) {
  const resolvedPath = dbPath || getDbPath();
  const data = db.export();
  writeFileSync(resolvedPath, Buffer.from(data));
}

export async function withDb(fn) {
  const db = await openDb();
  try {
    const result = fn(db);
    saveDb(db);
    return result;
  } finally {
    db.close();
  }
}

// ═══════════════════════════════════════════════════════════
// Features
// ═══════════════════════════════════════════════════════════

export function createFeature(db, name) {
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!slug) throw new Error('Invalid name: results in empty slug');

  const result = db.exec('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM features');
  const nextId = result[0].values[0][0];
  const paddedId = String(nextId).padStart(3, '0');
  const branch = `atomic-flow/${paddedId}-${slug}`;

  db.run(
    'INSERT INTO features (name, slug, branch) VALUES (?, ?, ?)',
    [name, slug, branch]
  );

  const [{ id }] = db.exec('SELECT last_insert_rowid() as id')[0].values.map(
    r => ({ id: r[0] })
  );

  const gates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
  for (const gate of gates) {
    db.run('INSERT INTO gates (feature_id, gate) VALUES (?, ?)', [id, gate]);
  }

  return { id, slug, branch };
}

export function getFeature(db, id) {
  const result = db.exec('SELECT * FROM features WHERE id = ?', [id]);
  if (!result.length || !result[0].values.length) return null;
  return rowToFeature(result[0]);
}

export function getFeatureByBranch(db, branch) {
  const result = db.exec('SELECT * FROM features WHERE branch = ?', [branch]);
  if (!result.length || !result[0].values.length) return null;
  return rowToFeature(result[0]);
}

export function getAllFeatures(db) {
  const result = db.exec('SELECT * FROM features ORDER BY id');
  if (!result.length) return [];
  return result[0].values.map((_, i) => rowToFeature(result[0], i));
}

export function setFeaturePhase(db, id, phase) {
  db.run('UPDATE features SET phase = ? WHERE id = ?', [phase, id]);
}

export function setFeatureSpecHash(db, id, hash) {
  db.run('UPDATE features SET spec_hash = ? WHERE id = ?', [hash, id]);
}

export function cancelFeature(db, id, reason) {
  if (!reason) throw new Error('Cancel reason is required');
  const feature = getFeature(db, id);
  if (!feature) throw new Error(`Feature ${id} not found`);
  if (feature.status === 'done') throw new Error('Cannot cancel a completed feature');
  db.run("UPDATE features SET status = 'cancelled', cancel_reason = ? WHERE id = ?", [reason, id]);
}

// ═══════════════════════════════════════════════════════════
// Gates
// ═══════════════════════════════════════════════════════════

export function getGates(db, featureId) {
  const result = db.exec('SELECT * FROM gates WHERE feature_id = ? ORDER BY gate', [featureId]);
  if (!result.length) return [];
  return result[0].values.map((_, i) => rowToObject(result[0], i));
}

export function setGateStatus(db, featureId, gate, status, reason) {
  db.run(
    "UPDATE gates SET status = ?, reason = ?, decided_at = datetime('now') WHERE feature_id = ? AND gate = ?",
    [status, reason || null, featureId, gate]
  );
}

// ═══════════════════════════════════════════════════════════
// Tasks
// ═══════════════════════════════════════════════════════════

export function createTask(db, featureId, taskId, name, opts = {}) {
  const { type = 'implementation', files = null, deps = null } = opts;
  db.run(
    'INSERT INTO tasks (feature_id, task_id, name, type, files, deps) VALUES (?, ?, ?, ?, ?, ?)',
    [featureId, taskId, name, type, files ? JSON.stringify(files) : null, deps ? JSON.stringify(deps) : null]
  );
}

export function getTasks(db, featureId) {
  const result = db.exec('SELECT * FROM tasks WHERE feature_id = ? ORDER BY task_id', [featureId]);
  if (!result.length) return [];
  return result[0].values.map((_, i) => {
    const task = rowToObject(result[0], i);
    if (task.files) task.files = JSON.parse(task.files);
    if (task.deps) task.deps = JSON.parse(task.deps);
    return task;
  });
}

export function getCurrentTask(db, featureId) {
  const result = db.exec(
    "SELECT * FROM tasks WHERE feature_id = ? AND status = 'in_progress' LIMIT 1",
    [featureId]
  );
  if (!result.length || !result[0].values.length) return null;
  const task = rowToObject(result[0]);
  if (task.files) task.files = JSON.parse(task.files);
  if (task.deps) task.deps = JSON.parse(task.deps);
  return task;
}

export function setTaskStatus(db, featureId, taskId, status) {
  db.run(
    'UPDATE tasks SET status = ? WHERE feature_id = ? AND task_id = ?',
    [status, featureId, taskId]
  );
}

export function incrementStrikes(db, featureId, taskId) {
  db.run(
    'UPDATE tasks SET strikes = strikes + 1 WHERE feature_id = ? AND task_id = ?',
    [featureId, taskId]
  );
  const result = db.exec(
    'SELECT strikes FROM tasks WHERE feature_id = ? AND task_id = ?',
    [featureId, taskId]
  );
  return result[0].values[0][0];
}

export function setTaskCommit(db, featureId, taskId, hash) {
  db.run(
    'UPDATE tasks SET commit_hash = ? WHERE feature_id = ? AND task_id = ?',
    [hash, featureId, taskId]
  );
}

// ═══════════════════════════════════════════════════════════
// Learnings
// ═══════════════════════════════════════════════════════════

export function addLearning(db, featureId, taskId, category, content) {
  db.run(
    'INSERT INTO learnings (feature_id, task_id, category, content) VALUES (?, ?, ?, ?)',
    [featureId, taskId || null, category, content]
  );
}

export function getLearnings(db, featureId) {
  const result = db.exec('SELECT * FROM learnings WHERE feature_id = ? ORDER BY id', [featureId]);
  if (!result.length) return [];
  return result[0].values.map((_, i) => rowToObject(result[0], i));
}

// ═══════════════════════════════════════════════════════════
// Stats
// ═══════════════════════════════════════════════════════════

export function getFeatureStats(db) {
  const result = db.exec(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM features
  `);
  if (!result.length) return { total: 0, active: 0, done: 0, cancelled: 0 };
  const [total, active, done, cancelled] = result[0].values[0];
  return { total, active, done, cancelled };
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function rowToObject(queryResult, rowIndex = 0) {
  const { columns, values } = queryResult;
  const row = values[rowIndex];
  const obj = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = row[i];
  }
  return obj;
}

function rowToFeature(queryResult, rowIndex = 0) {
  return rowToObject(queryResult, rowIndex);
}
