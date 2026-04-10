import {
  setFeaturePhase, setGateStatus,
  getFeature, getGates, getTasks,
} from './db.js';

// ═══════════════════════════════════════════════════════════
// transition
// ═══════════════════════════════════════════════════════════

export function transition(db, featureId, toPhase) {
  try {
    setFeaturePhase(db, featureId, toPhase);
    return { success: true, message: `Transitioned to ${toPhase}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// approveGate
// ═══════════════════════════════════════════════════════════

export async function approveGate(db, featureId, gate, repoPath) {
  try {
    setGateStatus(db, featureId, gate, 'approved');
    return { success: true, commit_hash: null, message: `Gate ${gate} approved` };
  } catch (err) {
    return { success: false, commit_hash: null, message: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// rejectGate
// ═══════════════════════════════════════════════════════════

export function rejectGate(db, featureId, gate, reason) {
  try {
    setGateStatus(db, featureId, gate, 'rejected', reason);
    return { success: true, message: `Gate ${gate} rejected: ${reason}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// runPreflight
// ═══════════════════════════════════════════════════════════

export function runPreflight(db, featureId, gate) {
  switch (gate) {
    case 'G4': return preflightG4(db, featureId);
    case 'G5': return preflightG5(db, featureId);
    case 'G7': return preflightG7(db, featureId);
    default:   return { flags: [], can_approve: true };
  }
}

function preflightG4(db, featureId) {
  const tasks = getTasks(db, featureId);
  const flags = [];

  // Check tasks exist
  if (tasks.length === 0) {
    flags.push({ level: 'error', message: 'No tasks defined — decomposition incomplete' });
  }

  // Flag any task with >3 files
  for (const task of tasks) {
    if (task.files && task.files.length > 3) {
      flags.push({
        level: 'warn',
        message: `Task ${task.task_id} has ${task.files.length} files (>3) — consider splitting`,
      });
    }
  }

  // Flag file collision between tasks
  const fileOwners = new Map();
  for (const task of tasks) {
    if (!task.files) continue;
    for (const file of task.files) {
      if (fileOwners.has(file)) {
        flags.push({
          level: 'error',
          message: `File collision: ${file} claimed by ${fileOwners.get(file)} and ${task.task_id}`,
        });
      } else {
        fileOwners.set(file, task.task_id);
      }
    }
  }

  // Detect cyclic dependencies
  const cycles = detectCyclicDeps(tasks);
  for (const cycle of cycles) {
    flags.push({ level: 'error', message: cycle });
  }

  // Warn when >10 tasks (EC04)
  if (tasks.length > 10) {
    flags.push({
      level: 'warn',
      message: `${tasks.length} tasks defined (>10) — consider merging small tasks (EC04)`,
    });
  }

  const can_approve = !flags.some(f => f.level === 'error');
  return { flags, can_approve };
}

function preflightG5(db, featureId) {
  const tasks = getTasks(db, featureId);
  const flags = [];

  for (const task of tasks) {
    if (task.status === 'pending') {
      flags.push({
        level: 'error',
        message: `Task ${task.task_id} is still pending`,
      });
    } else if (task.status === 'in_progress') {
      flags.push({
        level: 'error',
        message: `Task ${task.task_id} is still in progress`,
      });
    }
  }

  const can_approve = !flags.some(f => f.level === 'error');
  return { flags, can_approve };
}

function preflightG7(db, featureId) {
  const gates = getGates(db, featureId);
  const flags = [];

  const required = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
  for (const gateId of required) {
    const gate = gates.find(g => g.gate === gateId);
    if (!gate || gate.status !== 'approved') {
      flags.push({
        level: 'error',
        message: `Gate ${gateId} is not approved (status: ${gate ? gate.status : 'missing'})`,
      });
    }
  }

  const can_approve = !flags.some(f => f.level === 'error');
  return { flags, can_approve };
}

// ═══════════════════════════════════════════════════════════
// reconcile
// ═══════════════════════════════════════════════════════════

export function reconcile(db, featureId, context) {
  const issues = [];
  const gates = getGates(db, featureId);
  const tasks = getTasks(db, featureId);
  const feature = getFeature(db, featureId);

  // Check all G1-G7 approved
  const allGates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
  for (const gateId of allGates) {
    const gate = gates.find(g => g.gate === gateId);
    if (!gate || gate.status !== 'approved') {
      issues.push(`Gate ${gateId} not approved (${gate ? gate.status : 'missing'})`);
    }
  }

  // Check all tasks done
  for (const task of tasks) {
    if (task.status !== 'done') {
      issues.push(`Task ${task.task_id} not done (${task.status})`);
    }
  }

  // Check spec_hash matches context.specHash (if provided)
  if (context && context.specHash !== undefined) {
    if (feature && feature.spec_hash !== context.specHash) {
      issues.push(`spec_hash mismatch: DB has '${feature.spec_hash}', expected '${context.specHash}'`);
    }
  }

  if (issues.length === 0) {
    return { status: 'ok', issues: [] };
  }

  // Determine drift vs incomplete
  const hasDrift = issues.some(i => i.includes('spec_hash'));
  return { status: hasDrift ? 'drift' : 'incomplete', issues };
}

// ═══════════════════════════════════════════════════════════
// detectCyclicDeps (exported for testing)
// ═══════════════════════════════════════════════════════════

export function detectCyclicDeps(tasks) {
  const cycles = [];
  const taskMap = new Map();
  for (const task of tasks) {
    taskMap.set(task.task_id, task);
  }

  const WHITE = 0; // unvisited
  const GRAY = 1;  // in current DFS path
  const BLACK = 2; // fully processed

  const color = new Map();
  for (const task of tasks) {
    color.set(task.task_id, WHITE);
  }

  const path = [];

  function dfs(taskId) {
    color.set(taskId, GRAY);
    path.push(taskId);

    const task = taskMap.get(taskId);
    const deps = task && task.deps ? task.deps : [];

    for (const dep of deps) {
      if (color.get(dep) === GRAY) {
        // Found a cycle — extract it from path
        const cycleStart = path.indexOf(dep);
        const cycle = path.slice(cycleStart);
        cycles.push(`Cyclic dependency: ${cycle.join(' -> ')} -> ${dep}`);
      } else if (color.get(dep) === WHITE || color.get(dep) === undefined) {
        // If dep is not in taskMap (undefined color), skip — it's a dangling ref
        if (color.has(dep)) {
          dfs(dep);
        }
      }
    }

    path.pop();
    color.set(taskId, BLACK);
  }

  for (const task of tasks) {
    if (color.get(task.task_id) === WHITE) {
      dfs(task.task_id);
    }
  }

  return cycles;
}
