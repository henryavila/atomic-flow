import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, seedFeature } from './setup.js';
import {
  setFeaturePhase, setGateStatus, setTaskStatus,
  createTask, getCurrentTask, getFeature, getGates,
} from '../src/db.js';
import { formatSessionOutput } from '../src/hooks/session-start.js';
import { checkFileScope } from '../src/hooks/pre-tool-use.js';

// ═══════════════════════════════════════════════════════════
// formatSessionOutput
// ═══════════════════════════════════════════════════════════

describe('formatSessionOutput', () => {
  it('includes phase icon and feature name', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Auth Module');
    const feature = getFeature(db, id);
    const gates = getGates(db, id);

    const output = formatSessionOutput({ feature, task: null, gates });

    assert.ok(output.includes('①'), 'should include research phase icon');
    assert.ok(output.includes('Auth Module'), 'should include feature name');
    db.close();
  });

  it('includes rules for the current phase', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'TDD Feature');

    // Advance to implement phase
    setGateStatus(db, id, 'G1', 'approved');
    setFeaturePhase(db, id, 'spec');
    setGateStatus(db, id, 'G2', 'approved');
    setFeaturePhase(db, id, 'validate');
    setGateStatus(db, id, 'G3', 'approved');
    setFeaturePhase(db, id, 'decompose');
    setGateStatus(db, id, 'G4', 'approved');
    setFeaturePhase(db, id, 'implement');

    const feature = getFeature(db, id);
    const gates = getGates(db, id);

    const output = formatSessionOutput({ feature, task: null, gates });

    assert.ok(output.includes('RED BEFORE GREEN'), 'should include implement phase rule');
    db.close();
  });

  it('includes current task info when task is in_progress', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'Task Feature');

    // Advance to implement
    setGateStatus(db, id, 'G1', 'approved');
    setFeaturePhase(db, id, 'spec');
    setGateStatus(db, id, 'G2', 'approved');
    setFeaturePhase(db, id, 'validate');
    setGateStatus(db, id, 'G3', 'approved');
    setFeaturePhase(db, id, 'decompose');
    setGateStatus(db, id, 'G4', 'approved');
    setFeaturePhase(db, id, 'implement');

    createTask(db, id, 'T1', 'Build auth controller');
    setTaskStatus(db, id, 'T1', 'in_progress');

    const feature = getFeature(db, id);
    const gates = getGates(db, id);
    const task = getCurrentTask(db, id);

    const output = formatSessionOutput({ feature, task, gates });

    assert.ok(output.includes('T1'), 'should include task id');
    assert.ok(output.includes('Build auth controller'), 'should include task name');
    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// checkFileScope
// ═══════════════════════════════════════════════════════════

describe('checkFileScope', () => {
  it('research phase rejects src/ files', () => {
    const result = checkFileScope('research', 'src/app.ts', { featureId: 1, slug: 'test' });
    assert.equal(result.allowed, false);
    assert.ok(result.reason, 'should include a reason');
  });

  it('research phase allows docs/research/ files', () => {
    const result = checkFileScope('research', 'docs/research/topic.md', { featureId: 1, slug: 'test' });
    assert.equal(result.allowed, true);
  });

  it('implement phase allows src/ files', () => {
    const result = checkFileScope('implement', 'src/module.js', { featureId: 1, slug: 'test' });
    assert.equal(result.allowed, true);
  });

  it('implement phase rejects docs/specs/ files', () => {
    const result = checkFileScope('implement', 'docs/specs/spec.md', { featureId: 1, slug: 'test' });
    assert.equal(result.allowed, false);
    assert.ok(result.reason, 'should include a reason');
  });

  it('ship phase rejects all writes', () => {
    const result = checkFileScope('ship', 'any-file.js', { featureId: 1, slug: 'test' });
    assert.equal(result.allowed, false);
    assert.ok(result.reason, 'should include a reason');
  });
});
