import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, seedFeature } from './setup.js';
import {
  getFeature, getGates, getTasks, getLearnings,
  setGateStatus, createTask, setTaskStatus,
  setTaskCommit, addLearning, getFeatureStats,
  createFeature, setFeaturePhase, getAllFeatures,
  incrementStrikes,
} from '../src/db.js';
import { exportTracking, exportStatus } from '../src/export.js';
import { hydrateFromTracking } from '../src/hydrate.js';

// ═══════════════════════════════════════════════════════════
// exportTracking
// ═══════════════════════════════════════════════════════════

describe('exportTracking', () => {
  it('produces markdown with feature name, phase, gates table, tasks table', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Export Test');

    // Approve G1, add a task
    setGateStatus(db, id, 'G1', 'approved', 'Research complete');
    setFeaturePhase(db, id, 'spec');
    createTask(db, id, 'T1', 'Setup project', { type: 'implementation' });

    const md = exportTracking(db, id);

    // Feature header
    assert.ok(md.includes('# Tracking: Export Test'), 'should have feature name in header');
    assert.ok(md.includes('spec'), 'should include current phase');

    // Gates table
    assert.ok(md.includes('## Gates'), 'should have gates section');
    assert.ok(md.includes('| G1 '), 'should have G1 gate row');
    assert.ok(md.includes('approved'), 'should show G1 as approved');
    assert.ok(md.includes('Research complete'), 'should show gate reason');
    assert.ok(md.includes('| G7 '), 'should have G7 gate row');
    assert.ok(md.includes('pending'), 'should show unapproved gates as pending');

    // Tasks table
    assert.ok(md.includes('## Tasks'), 'should have tasks section');
    assert.ok(md.includes('| T1 '), 'should have T1 task row');
    assert.ok(md.includes('Setup project'), 'should show task name');

    db.close();
  });

  it('includes learnings count', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Learnings Count Test');

    addLearning(db, id, null, 'decision', 'Use sql.js for WASM');
    addLearning(db, id, null, 'pattern', 'Contracts first');
    addLearning(db, id, null, 'constraint', 'No native deps');

    const md = exportTracking(db, id);

    assert.ok(md.includes('## Learnings'), 'should have learnings section');
    assert.ok(md.includes('3'), 'should show learnings count of 3');

    db.close();
  });

  it('includes feature ID, branch, and status in header', async () => {
    const db = await createTestDb();
    const { id, branch } = seedFeature(db, 'Header Test');

    const md = exportTracking(db, id);

    assert.ok(md.includes(`**ID:** ${id}`), 'should have feature ID');
    assert.ok(md.includes(branch), 'should include branch name');
    assert.ok(md.includes('active'), 'should include status');

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// exportStatus
// ═══════════════════════════════════════════════════════════

describe('exportStatus', () => {
  it('returns structured object for a single feature', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Status Single');

    setGateStatus(db, id, 'G1', 'approved', 'Done');
    createTask(db, id, 'T1', 'First task');
    addLearning(db, id, 'T1', 'decision', 'Use TDD');

    const status = exportStatus(db, id);

    assert.ok(status.feature, 'should have feature object');
    assert.equal(status.feature.name, 'Status Single');
    assert.ok(Array.isArray(status.gates), 'gates should be an array');
    assert.equal(status.gates.length, 7);
    assert.ok(Array.isArray(status.tasks), 'tasks should be an array');
    assert.equal(status.tasks.length, 1);
    assert.equal(status.learnings_count, 1);

    db.close();
  });

  it('returns all features summary when no featureId provided', async () => {
    const db = await createTestDb();
    createFeature(db, 'Feature A');
    createFeature(db, 'Feature B');

    const status = exportStatus(db);

    assert.ok(Array.isArray(status.features), 'should have features array');
    assert.equal(status.features.length, 2);
    assert.ok(status.stats, 'should have stats');
    assert.equal(status.stats.total, 2);
    assert.equal(status.stats.active, 2);

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// hydrateFromTracking
// ═══════════════════════════════════════════════════════════

describe('hydrateFromTracking', () => {
  it('parses markdown tables back into SQLite', async () => {
    const db = await createTestDb();
    const { id, branch } = seedFeature(db, 'Hydrate Source');

    // Build up some state
    setGateStatus(db, id, 'G1', 'approved', 'Research done');
    setFeaturePhase(db, id, 'spec');
    setGateStatus(db, id, 'G2', 'approved', 'Spec reviewed');
    setFeaturePhase(db, id, 'validate');
    createTask(db, id, 'T1', 'Setup project');
    setTaskStatus(db, id, 'T1', 'in_progress');
    setTaskStatus(db, id, 'T1', 'done');
    setTaskCommit(db, id, 'T1', 'abc1234');
    createTask(db, id, 'T2', 'Database layer');

    // Export
    const md = exportTracking(db, id);
    db.close();

    // Hydrate into fresh db
    const freshDb = await createTestDb();
    const result = hydrateFromTracking(freshDb, md);

    assert.ok(result.features >= 1, 'should hydrate at least 1 feature');
    assert.ok(result.tasks >= 2, 'should hydrate at least 2 tasks');

    // Verify the feature was created
    const features = getAllFeatures(freshDb);
    assert.equal(features.length, 1);
    assert.equal(features[0].name, 'Hydrate Source');

    // Verify gates
    const gates = getGates(freshDb, features[0].id);
    const g1 = gates.find(g => g.gate === 'G1');
    assert.equal(g1.status, 'approved');

    // Verify tasks
    const tasks = getTasks(freshDb, features[0].id);
    assert.equal(tasks.length, 2);
    const t1 = tasks.find(t => t.task_id === 'T1');
    assert.equal(t1.name, 'Setup project');

    freshDb.close();
  });
});

// ═══════════════════════════════════════════════════════════
// Round-trip
// ═══════════════════════════════════════════════════════════

describe('round-trip: export → hydrate', () => {
  it('create data → exportTracking → hydrateFromTracking → compare', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Round Trip Feature');

    // Build realistic state: approve gates, advance phase, add tasks
    setGateStatus(db, id, 'G1', 'approved', 'Research done');
    setFeaturePhase(db, id, 'spec');
    setGateStatus(db, id, 'G2', 'approved', 'Spec approved');
    setFeaturePhase(db, id, 'validate');
    setGateStatus(db, id, 'G3', 'approved', 'Validated');
    setFeaturePhase(db, id, 'decompose');
    setGateStatus(db, id, 'G4', 'approved', 'Tasks decomposed');
    setFeaturePhase(db, id, 'implement');

    createTask(db, id, 'T1', 'Setup project');
    setTaskStatus(db, id, 'T1', 'in_progress');
    setTaskStatus(db, id, 'T1', 'done');
    setTaskCommit(db, id, 'T1', 'aaa1111');
    incrementStrikes(db, id, 'T1');

    createTask(db, id, 'T2', 'Core module');
    setTaskStatus(db, id, 'T2', 'in_progress');

    createTask(db, id, 'T3', 'Tests');

    // Capture original state
    const origFeature = getFeature(db, id);
    const origGates = getGates(db, id);
    const origTasks = getTasks(db, id);

    // Export
    const md = exportTracking(db, id);
    db.close();

    // Hydrate into fresh DB
    const freshDb = await createTestDb();
    hydrateFromTracking(freshDb, md);

    // Compare
    const features = getAllFeatures(freshDb);
    assert.equal(features.length, 1, 'should have 1 feature');
    assert.equal(features[0].name, origFeature.name, 'feature name should match');

    const hydratedGates = getGates(freshDb, features[0].id);
    // Check approved gates are preserved
    const approvedOriginal = origGates.filter(g => g.status === 'approved').map(g => g.gate);
    const approvedHydrated = hydratedGates.filter(g => g.status === 'approved').map(g => g.gate);
    assert.deepEqual(approvedHydrated, approvedOriginal, 'approved gates should match');

    const hydratedTasks = getTasks(freshDb, features[0].id);
    assert.equal(hydratedTasks.length, origTasks.length, 'task count should match');

    // Verify task details
    for (const origTask of origTasks) {
      const hydrated = hydratedTasks.find(t => t.task_id === origTask.task_id);
      assert.ok(hydrated, `task ${origTask.task_id} should exist`);
      assert.equal(hydrated.name, origTask.name, `task ${origTask.task_id} name should match`);
    }

    freshDb.close();
  });
});
