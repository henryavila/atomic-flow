import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, seedFeature } from './setup.js';
import {
  createFeature, getFeature, getFeatureByBranch, getAllFeatures,
  setFeaturePhase, setFeatureSpecHash, cancelFeature,
  getGates, setGateStatus,
  createTask, getTasks, getCurrentTask, setTaskStatus,
  incrementStrikes, setTaskCommit,
  addLearning, getLearnings,
  getFeatureStats,
} from '../src/db.js';

describe('createFeature', () => {
  it('generates sequential padded ID, slug, and branch', async () => {
    const db = await createTestDb();

    const f1 = createFeature(db, 'Auth Module');
    assert.equal(f1.slug, 'auth-module');
    assert.equal(f1.branch, 'atomic-flow/001-auth-module');

    const f2 = createFeature(db, 'Dashboard UI');
    assert.equal(f2.branch, 'atomic-flow/002-dashboard-ui');

    db.close();
  });

  it('rejects name with only special characters', async () => {
    const db = await createTestDb();
    assert.throws(() => createFeature(db, '!!!@@@'), /invalid.*name/i);
    db.close();
  });
});

describe('phase transitions', () => {
  it('forward with approved gate succeeds', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Forward Test');

    setGateStatus(db, id, 'G1', 'approved');
    setFeaturePhase(db, id, 'spec');

    const feature = getFeature(db, id);
    assert.equal(feature.phase, 'spec');
    db.close();
  });

  it('forward without approved gate throws', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'No Gate Test');

    assert.throws(
      () => setFeaturePhase(db, id, 'spec'),
      /Gate not approved/
    );
    db.close();
  });

  it('skip phase throws', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Skip Test');

    assert.throws(
      () => setFeaturePhase(db, id, 'decompose'),
      /Invalid phase transition/
    );
    db.close();
  });

  it('backward without gate succeeds', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Backward Test');

    setGateStatus(db, id, 'G1', 'approved');
    setFeaturePhase(db, id, 'spec');
    setGateStatus(db, id, 'G2', 'approved');
    setFeaturePhase(db, id, 'validate');

    // validate -> spec (backward) — no gate needed
    setFeaturePhase(db, id, 'spec');

    const feature = getFeature(db, id);
    assert.equal(feature.phase, 'spec');
    db.close();
  });
});

describe('gate enforcement', () => {
  it('blocks re-approval of decided gate', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Gate Reapprove Test');

    setGateStatus(db, id, 'G1', 'approved');

    assert.throws(
      () => setGateStatus(db, id, 'G1', 'rejected'),
      /Gate already decided/
    );
    db.close();
  });

  it('getGates returns all 7 gates', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Gates List Test');

    const gates = getGates(db, id);
    assert.equal(gates.length, 7);
    assert.equal(gates[0].gate, 'G1');
    assert.equal(gates[6].gate, 'G7');
    assert.equal(gates[0].status, 'pending');
    db.close();
  });
});

describe('task status enforcement', () => {
  it('enforces valid transitions', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Task Status Test');

    createTask(db, id, 'T1', 'Setup');

    setTaskStatus(db, id, 'T1', 'in_progress');
    setTaskStatus(db, id, 'T1', 'done');

    // done -> in_progress INVALID
    assert.throws(
      () => setTaskStatus(db, id, 'T1', 'in_progress'),
      /Invalid task status/
    );
    db.close();
  });

  it('allows retry from failed to in_progress', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Task Retry Test');

    createTask(db, id, 'T1', 'Setup');
    setTaskStatus(db, id, 'T1', 'in_progress');
    setTaskStatus(db, id, 'T1', 'failed');

    // failed -> in_progress OK
    setTaskStatus(db, id, 'T1', 'in_progress');

    const current = getCurrentTask(db, id);
    assert.equal(current.task_id, 'T1');
    assert.equal(current.status, 'in_progress');
    db.close();
  });
});

describe('incrementStrikes', () => {
  it('returns new strike count', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Strikes Test');

    createTask(db, id, 'T1', 'Setup');

    const s1 = incrementStrikes(db, id, 'T1');
    assert.equal(s1, 1);

    const s2 = incrementStrikes(db, id, 'T1');
    assert.equal(s2, 2);

    db.close();
  });
});

describe('CRUD operations', () => {
  it('getFeature and getFeatureByBranch', async () => {
    const db = await createTestDb();
    const { id, branch } = createFeature(db, 'CRUD Test');

    const byId = getFeature(db, id);
    assert.equal(byId.name, 'CRUD Test');
    assert.equal(byId.phase, 'research');

    const byBranch = getFeatureByBranch(db, branch);
    assert.equal(byBranch.id, id);

    assert.equal(getFeature(db, 999), null);
    assert.equal(getFeatureByBranch(db, 'nonexistent'), null);

    db.close();
  });

  it('getAllFeatures returns ordered list', async () => {
    const db = await createTestDb();
    createFeature(db, 'First');
    createFeature(db, 'Second');

    const all = getAllFeatures(db);
    assert.equal(all.length, 2);
    assert.equal(all[0].name, 'First');
    assert.equal(all[1].name, 'Second');
    db.close();
  });

  it('setFeatureSpecHash stores hash', async () => {
    const db = await createTestDb();
    const { id } = createFeature(db, 'Hash Test');

    setFeatureSpecHash(db, id, 'abcd1234');
    const f = getFeature(db, id);
    assert.equal(f.spec_hash, 'abcd1234');
    db.close();
  });

  it('cancelFeature requires reason and non-done feature', async () => {
    const db = await createTestDb();
    const { id } = createFeature(db, 'Cancel Test');

    assert.throws(() => cancelFeature(db, id, ''), /reason.*required/i);

    cancelFeature(db, id, 'Out of scope');
    const f = getFeature(db, id);
    assert.equal(f.status, 'cancelled');
    assert.equal(f.cancel_reason, 'Out of scope');
    db.close();
  });

  it('createTask with opts, getTasks, setTaskCommit', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Tasks CRUD');

    createTask(db, id, 'T1', 'Setup', { files: ['package.json'], deps: [] });
    createTask(db, id, 'T2', 'Database', { deps: ['T1'] });

    const tasks = getTasks(db, id);
    assert.equal(tasks.length, 2);
    assert.deepEqual(tasks[0].files, ['package.json']);
    assert.deepEqual(tasks[1].deps, ['T1']);

    setTaskCommit(db, id, 'T1', 'abc123');
    const updated = getTasks(db, id);
    assert.equal(updated[0].commit_hash, 'abc123');
    db.close();
  });

  it('addLearning and getLearnings', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Learnings Test');

    addLearning(db, id, 'T1', 'decision', 'Use sql.js for WASM');
    addLearning(db, id, null, 'pattern', 'Contracts first');

    const learnings = getLearnings(db, id);
    assert.equal(learnings.length, 2);
    assert.equal(learnings[0].category, 'decision');
    assert.equal(learnings[1].task_id, null);
    db.close();
  });

  it('getFeatureStats counts correctly', async () => {
    const db = await createTestDb();

    let stats = getFeatureStats(db);
    assert.equal(stats.total, 0);

    createFeature(db, 'Active One');
    createFeature(db, 'To Cancel');
    cancelFeature(db, 2, 'not needed');

    stats = getFeatureStats(db);
    assert.equal(stats.total, 2);
    assert.equal(stats.active, 1);
    assert.equal(stats.cancelled, 1);
    db.close();
  });
});
