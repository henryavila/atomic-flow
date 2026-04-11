import { setGateStatus, createTask } from './db.js';

// ═══════════════════════════════════════════════════════════
// hydrateFromTracking — Markdown string → SQLite state
// ═══════════════════════════════════════════════════════════

export function hydrateFromTracking(db, trackingMd) {
  const lines = trackingMd.split('\n');

  // ── Parse feature header ────────────────────────────────
  const featureName = parseFeatureName(lines);
  const { id: featureIdStr, branch, phase, status } = parseFeatureHeader(lines);

  // ── Insert feature row (bypass triggers by inserting directly) ──
  db.run(
    'INSERT INTO features (name, slug, branch, phase, status) VALUES (?, ?, ?, ?, ?)',
    [featureName, slugify(featureName), branch, phase, status]
  );
  const featureId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];

  // ── Insert 7 gates with default pending ─────────────────
  const allGates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
  for (const gate of allGates) {
    db.run('INSERT INTO gates (feature_id, gate) VALUES (?, ?)', [featureId, gate]);
  }

  // ── Parse and apply gate statuses ───────────────────────
  const gateRows = parseGatesTable(lines);
  for (const row of gateRows) {
    if (row.status !== 'pending') {
      // Use direct SQL to bypass trigger (gate already inserted as pending)
      db.run(
        'UPDATE gates SET status = ?, reason = ?, decided_at = ? WHERE feature_id = ? AND gate = ?',
        [row.status, row.reason || null, row.decidedAt || null, featureId, row.gate]
      );
    }
  }

  // ── Parse and insert tasks ──────────────────────────────
  const taskRows = parseTasksTable(lines);
  let taskCount = 0;
  for (const row of taskRows) {
    // Insert with direct SQL to set status/strikes/commit without triggers
    db.run(
      'INSERT INTO tasks (feature_id, task_id, name, status, strikes, commit_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [featureId, row.taskId, row.name, row.status, row.strikes, row.commitHash || null]
    );
    taskCount++;
  }

  return { features: 1, tasks: taskCount };
}

// ═══════════════════════════════════════════════════════════
// Parsers
// ═══════════════════════════════════════════════════════════

function parseFeatureName(lines) {
  for (const line of lines) {
    if (line.startsWith('# Tracking: ')) {
      return line.slice('# Tracking: '.length).trim();
    }
  }
  throw new Error('Could not parse feature name from tracking markdown');
}

function parseFeatureHeader(lines) {
  for (const line of lines) {
    if (line.includes('**ID:**')) {
      // Format: **ID:** 1 | **Branch:** atomic-flow/xxx | **Phase:** implement | **Status:** active
      const parts = line.split('|').map(p => p.trim());
      const extractValue = (part) => {
        const idx = part.indexOf('**');
        if (idx === -1) return part.trim();
        // Find the closing **
        const end = part.indexOf('**', idx + 2);
        if (end === -1) return part.trim();
        return part.slice(end + 2).trim();
      };

      return {
        id: extractValue(parts[0]),
        branch: extractValue(parts[1]),
        phase: extractValue(parts[2]),
        status: extractValue(parts[3]),
      };
    }
  }
  throw new Error('Could not parse feature header from tracking markdown');
}

function parseGatesTable(lines) {
  const rows = [];
  let inGates = false;

  for (const line of lines) {
    if (line.startsWith('## Gates')) {
      inGates = true;
      continue;
    }
    if (inGates && line.startsWith('##')) {
      break; // Next section
    }
    if (!inGates) continue;
    if (!line.startsWith('|')) continue;

    // Skip table header and separator
    if (line.includes('Gate') && line.includes('Status')) {
      continue;
    }
    if (line.match(/^\|[\s-|]+$/)) {
      continue;
    }

    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length >= 2) {
      rows.push({
        gate: cells[0],
        status: cells[1],
        decidedAt: cells[2] || null,
        reason: cells[3] || null,
      });
    }
  }

  return rows;
}

function parseTasksTable(lines) {
  const rows = [];
  let inTasks = false;

  for (const line of lines) {
    if (line.startsWith('## Tasks')) {
      inTasks = true;
      continue;
    }
    if (inTasks && line.startsWith('##')) {
      break; // Next section
    }
    if (!inTasks) continue;
    if (!line.startsWith('|')) continue;

    // Skip table header and separator
    if (line.includes('Task ID') && line.includes('Name')) {
      continue;
    }
    if (line.match(/^\|[\s-|]+$/)) {
      continue;
    }

    const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length >= 3) {
      rows.push({
        taskId: cells[0],
        name: cells[1],
        status: cells[2],
        strikes: parseInt(cells[3], 10) || 0,
        commitHash: cells[4] || null,
      });
    }
  }

  return rows;
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
