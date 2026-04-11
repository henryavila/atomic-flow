import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, seedFeature } from './setup.js';
import {
  setGateStatus, getGates, createTask, setTaskStatus,
  setFeaturePhase, setFeatureSpecHash,
} from '../src/db.js';
import {
  approveGate, rejectGate, runPreflight, reconcile,
} from '../src/enforcement.js';

// ── Helper: advance a seeded feature to a target phase
function advanceTo(db, id, targetPhase) {
  if (targetPhase === 'research') return;
  const path = [
    { gate: 'G1', phase: 'spec' },
    { gate: 'G2', phase: 'validate' },
    { gate: 'G3', phase: 'decompose' },
    { gate: 'G4', phase: 'implement' },
    { gate: 'G5', phase: 'review' },
    { gate: 'G6', phase: 'ship' },
    { gate: 'G7', phase: 'done' },
  ];
  for (const step of path) {
    setGateStatus(db, id, step.gate, 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', [step.phase, id]);
    if (step.phase === targetPhase) break;
  }
}

// ═══════════════════════════════════════════════════════════
// Gate approve
// ═══════════════════════════════════════════════════════════

describe('gate approve via MCP path', () => {
  it('sets status to approved', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'gate-approve');

    const result = await approveGate(db, id, 'G1');
    assert.equal(result.success, true);

    const gates = getGates(db, id);
    const g1 = gates.find(g => g.gate === 'G1');
    assert.equal(g1.status, 'approved');
    assert.ok(g1.decided_at, 'decided_at should be set');

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// Gate reject
// ═══════════════════════════════════════════════════════════

describe('gate reject via MCP path', () => {
  it('records reason on rejection', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'gate-reject');

    const result = rejectGate(db, id, 'G1', 'Research incomplete');
    assert.equal(result.success, true);
    assert.ok(result.message.includes('rejected'));

    const gates = getGates(db, id);
    const g1 = gates.find(g => g.gate === 'G1');
    assert.equal(g1.status, 'rejected');
    assert.equal(g1.reason, 'Research incomplete');
    assert.ok(g1.decided_at, 'decided_at should be set');

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// Gate re-decision blocked
// ═══════════════════════════════════════════════════════════

describe('gate re-decision', () => {
  it('throws when attempting to change a decided gate', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'gate-redecision');

    // Approve G1
    await approveGate(db, id, 'G1');

    // Try to reject an already-approved gate — should fail via trigger
    assert.throws(
      () => setGateStatus(db, id, 'G1', 'rejected'),
      /Gate already decided/
    );

    // Reject G2, then try to approve it — cross-status change blocked
    rejectGate(db, id, 'G2', 'Not ready');
    assert.throws(
      () => setGateStatus(db, id, 'G2', 'approved'),
      /Gate already decided/
    );

    // Reject G3, then try to reject again with different reason — also blocked
    rejectGate(db, id, 'G3', 'First reason');
    // approveGate returns { success: false } (catches internally)
    const retryResult = await approveGate(db, id, 'G3');
    assert.equal(retryResult.success, false);

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// Preflight G4: flags task with >3 files
// ═══════════════════════════════════════════════════════════

describe('preflight G4 via MCP path', () => {
  it('flags task with >3 files', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'pf-g4-files');
    advanceTo(db, id, 'decompose');

    createTask(db, id, 'T1', 'Small task', { files: ['a.js', 'b.js'] });
    createTask(db, id, 'T2', 'Big task', {
      files: ['c.js', 'd.js', 'e.js', 'f.js'],
    });

    const result = runPreflight(db, id, 'G4');

    // T2 should be flagged (4 files > 3)
    const fileFlag = result.flags.find(f => f.message.includes('T2'));
    assert.ok(fileFlag, 'should flag T2 for >3 files');
    assert.equal(fileFlag.level, 'warn');
    assert.ok(fileFlag.message.includes('4'));

    // T1 should NOT be flagged
    const t1Flag = result.flags.find(f => f.message.includes('T1') && f.message.includes('files'));
    assert.equal(t1Flag, undefined, 'T1 should not be flagged for files');

    // Still approvable (warn, not error)
    assert.equal(result.can_approve, true);

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// Preflight G5: flags pending tasks
// ═══════════════════════════════════════════════════════════

describe('preflight G5 via MCP path', () => {
  it('flags pending and in-progress tasks', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'pf-g5-tasks');
    advanceTo(db, id, 'implement');

    // T1: done (should not be flagged)
    createTask(db, id, 'T1', 'Done task');
    setTaskStatus(db, id, 'T1', 'in_progress');
    setTaskStatus(db, id, 'T1', 'done');

    // T2: pending (should be flagged)
    createTask(db, id, 'T2', 'Pending task');

    // T3: in_progress (should be flagged)
    createTask(db, id, 'T3', 'WIP task');
    setTaskStatus(db, id, 'T3', 'in_progress');

    const result = runPreflight(db, id, 'G5');

    assert.equal(result.can_approve, false);
    assert.ok(result.flags.length >= 2);

    const flagMessages = result.flags.map(f => f.message).join(' ');
    assert.ok(flagMessages.includes('T2'), 'should flag T2 as pending');
    assert.ok(flagMessages.includes('T3'), 'should flag T3 as in progress');
    // T1 is done — should NOT appear in flags
    const t1Flags = result.flags.filter(f => f.message.includes('T1'));
    assert.equal(t1Flags.length, 0, 'T1 should not be flagged');

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// Preflight G7: checks G1-G6 all approved
// ═══════════════════════════════════════════════════════════

describe('preflight G7 via MCP path', () => {
  it('flags unapproved gates among G1-G6', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'pf-g7-gates');

    // Only approve G1-G3 (skip G4-G6)
    advanceTo(db, id, 'decompose');
    // Manually push to ship for the preflight check
    // (bypassing triggers via direct SQL for test setup)
    setGateStatus(db, id, 'G4', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['implement', id]);
    setGateStatus(db, id, 'G5', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['review', id]);
    // G6 is still pending
    setGateStatus(db, id, 'G6', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['ship', id]);

    // All G1-G6 approved — should pass
    const resultOk = runPreflight(db, id, 'G7');
    assert.equal(resultOk.can_approve, true);
    assert.equal(resultOk.flags.length, 0);

    db.close();
  });

  it('fails when G1-G6 are not all approved', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'pf-g7-missing');

    // Only approve G1 — the rest stay pending
    // runPreflight reads gate status directly, so we just need gates in the DB
    setGateStatus(db, id, 'G1', 'approved');

    const result = runPreflight(db, id, 'G7');
    assert.equal(result.can_approve, false);

    // Should flag G2-G6 as not approved
    const flaggedGates = result.flags.map(f => f.message);
    assert.ok(flaggedGates.some(m => m.includes('G2')));
    assert.ok(flaggedGates.some(m => m.includes('G3')));
    assert.ok(flaggedGates.some(m => m.includes('G4')));
    assert.ok(flaggedGates.some(m => m.includes('G5')));
    assert.ok(flaggedGates.some(m => m.includes('G6')));

    db.close();
  });
});

// ═══════════════════════════════════════════════════════════
// Reconcile: ok
// ═══════════════════════════════════════════════════════════

describe('reconcile via MCP path', () => {
  it('returns ok when all gates approved and all tasks done', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'reconcile-ok');

    // Create tasks before advancing
    createTask(db, id, 'T1', 'Task one');
    createTask(db, id, 'T2', 'Task two');

    // Advance to implement, then complete tasks
    advanceTo(db, id, 'implement');
    setTaskStatus(db, id, 'T1', 'in_progress');
    setTaskStatus(db, id, 'T1', 'done');
    setTaskStatus(db, id, 'T2', 'in_progress');
    setTaskStatus(db, id, 'T2', 'done');

    // Continue advancing to done
    setGateStatus(db, id, 'G5', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['review', id]);
    setGateStatus(db, id, 'G6', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['ship', id]);
    setGateStatus(db, id, 'G7', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['done', id]);

    const result = reconcile(db, id);
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.issues, []);

    db.close();
  });

  it('returns incomplete when tasks are still pending', async () => {
    const db = await createTestDb();
    const { id } = seedFeature(db, 'reconcile-pending');

    // Create tasks — leave T2 pending
    createTask(db, id, 'T1', 'Done task');
    createTask(db, id, 'T2', 'Pending task');

    // Advance all the way to done
    advanceTo(db, id, 'implement');
    setTaskStatus(db, id, 'T1', 'in_progress');
    setTaskStatus(db, id, 'T1', 'done');

    setGateStatus(db, id, 'G5', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['review', id]);
    setGateStatus(db, id, 'G6', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['ship', id]);
    setGateStatus(db, id, 'G7', 'approved');
    db.run('UPDATE features SET phase = ? WHERE id = ?', ['done', id]);

    const result = reconcile(db, id);
    assert.equal(result.status, 'incomplete');
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues.some(i => i.includes('T2')));

    db.close();
  });
});
