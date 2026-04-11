import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, seedFeature } from './setup.js';
import {
  createFeature, getFeature, cancelFeature,
  setFeaturePhase, setGateStatus, getGates,
} from '../src/db.js';
import { transition, approveGate, rejectGate } from '../src/enforcement.js';

// ═══════════════════════════════════════════════════════════
// Full lifecycle: research → done
// ═══════════════════════════════════════════════════════════

describe('feature full lifecycle', () => {
  it('traverses all 7 phases via gate approvals', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'full-lifecycle');

    const steps = [
      { gate: 'G1', toPhase: 'spec' },
      { gate: 'G2', toPhase: 'validate' },
      { gate: 'G3', toPhase: 'decompose' },
      { gate: 'G4', toPhase: 'implement' },
      { gate: 'G5', toPhase: 'review' },
      { gate: 'G6', toPhase: 'ship' },
      { gate: 'G7', toPhase: 'done' },
    ];

    // Feature starts in research phase, active status
    let feature = getFeature(db, id);
    assert.equal(feature.phase, 'research');
    assert.equal(feature.status, 'active');

    for (const step of steps) {
      // Approve the gate
      const gateResult = await approveGate(db, id, step.gate);
      assert.equal(gateResult.success, true, `approve ${step.gate} failed`);

      // Transition to the next phase
      const transResult = transition(db, id, step.toPhase);
      assert.equal(transResult.success, true, `transition to ${step.toPhase} failed: ${transResult.message}`);

      // Verify phase updated
      feature = getFeature(db, id);
      assert.equal(feature.phase, step.toPhase, `expected phase ${step.toPhase}`);
    }

    // After reaching 'done', status should be 'done' (trigger: feature_done_status)
    feature = getFeature(db, id);
    assert.equal(feature.phase, 'done');
    assert.equal(feature.status, 'done');

    // All 7 gates should be approved
    const gates = getGates(db, id);
    assert.equal(gates.length, 7);
    for (const g of gates) {
      assert.equal(g.status, 'approved', `${g.gate} should be approved`);
    }

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// createFeature
// ═══════════════════════════════════════════════════════════

describe('createFeature via MCP path', () => {
  it('generates padded ID starting from 001 in research phase', async () => {
    const db = await createTestDb();

    const f1 = createFeature(db, 'First Feature');
    assert.equal(f1.id, 1);
    assert.equal(f1.branch, 'atomic-flow/001-first-feature');

    const feature = getFeature(db, f1.id);
    assert.equal(feature.phase, 'research');
    assert.equal(feature.status, 'active');

    const f2 = createFeature(db, 'Second Feature');
    assert.equal(f2.branch, 'atomic-flow/002-second-feature');

    const f3 = createFeature(db, 'Third Feature');
    assert.equal(f3.branch, 'atomic-flow/003-third-feature');

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// cancelFeature
// ═══════════════════════════════════════════════════════════

describe('cancelFeature via MCP path', () => {
  it('requires reason string', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'cancel-reason');

    assert.throws(
      () => cancelFeature(db, id, ''),
      /reason.*required/i
    );
    assert.throws(
      () => cancelFeature(db, id, null),
      /reason.*required/i
    );
    assert.throws(
      () => cancelFeature(db, id, undefined),
      /reason.*required/i
    );

    // Valid cancel with reason succeeds
    cancelFeature(db, id, 'Budget cut');
    const feature = getFeature(db, id);
    assert.equal(feature.status, 'cancelled');
    assert.equal(feature.cancel_reason, 'Budget cut');

    db.close();
  });

  it('rejects cancelling already-done features', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'cancel-done');

    // Advance to done
    const gates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
    const phases = ['spec', 'validate', 'decompose', 'implement', 'review', 'ship', 'done'];
    for (let i = 0; i < gates.length; i++) {
      setGateStatus(db, id, gates[i], 'approved');
      setFeaturePhase(db, id, phases[i]);
    }

    const feature = getFeature(db, id);
    assert.equal(feature.status, 'done');

    assert.throws(
      () => cancelFeature(db, id, 'Too late'),
      /Cannot cancel a completed feature/
    );

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// getFeature — nonexistent
// ═══════════════════════════════════════════════════════════

describe('getFeature via MCP path', () => {
  it('returns null for nonexistent ID', async () => {
    const db = await createTestDb();

    assert.equal(getFeature(db, 999), null);
    assert.equal(getFeature(db, 0), null);
    assert.equal(getFeature(db, -1), null);

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// Status flow
// ═══════════════════════════════════════════════════════════

describe('feature status flow', () => {
  it('starts active, cancel makes cancelled, reaching done makes done', async () => {
    const db = await createTestDb();

    // Active on creation
    const { id: activeId } = seedFeature(db, 'status-active');
    let feature = getFeature(db, activeId);
    assert.equal(feature.status, 'active');

    // Cancelled via cancelFeature
    const { id: cancelId } = seedFeature(db, 'status-cancel');
    cancelFeature(db, cancelId, 'Not needed');
    feature = getFeature(db, cancelId);
    assert.equal(feature.status, 'cancelled');

    // Done via phase=done trigger
    const { id: doneId } = seedFeature(db, 'status-done');
    const gates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
    const phases = ['spec', 'validate', 'decompose', 'implement', 'review', 'ship', 'done'];
    for (let i = 0; i < gates.length; i++) {
      setGateStatus(db, doneId, gates[i], 'approved');
      setFeaturePhase(db, doneId, phases[i]);
    }
    feature = getFeature(db, doneId);
    assert.equal(feature.status, 'done');

    db.close();
  });
});
