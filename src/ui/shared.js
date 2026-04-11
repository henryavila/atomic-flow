/* ==========================================================================
   Atomic Flow — Shared Client-Side JavaScript
   Plain JS, no build step, no module imports.
   All exports attached to `window` for global access via <script src>.
   ========================================================================== */

// ---------------------------------------------------------------------------
// Phase Constants
// ---------------------------------------------------------------------------

var PHASE_ORDER = ['research', 'spec', 'validate', 'decompose', 'implement', 'review', 'ship', 'done'];

var PHASE_LABELS = {
  research: 'Research',
  spec: 'Spec',
  validate: 'Validate',
  decompose: 'Decompose',
  implement: 'Implement',
  review: 'Review',
  ship: 'Ship',
  done: 'Done'
};

var PHASE_ICONS = {
  research: '\u2460',   // ①
  spec: '\u2461',       // ②
  validate: '\u2462',   // ③
  decompose: '\u2463',  // ④
  implement: '\u2464',  // ⑤
  review: '\u2465',     // ⑥
  ship: '\u2466',       // ⑦
  done: '\u2713'        // ✓
};

// Gate labels — G1 through G7, one between each pair of phases
var GATE_LABELS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];


// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the full list of features.
 * @returns {Promise<Array>}
 */
async function fetchFeatures() {
  var res = await fetch('/api/features');
  if (!res.ok) throw new Error('Failed to fetch features');
  return res.json();
}

/**
 * Fetch a single feature by ID.
 * @param {string|number} id
 * @returns {Promise<Object>}
 */
async function fetchFeature(id) {
  var res = await fetch('/api/feature/' + encodeURIComponent(id));
  if (!res.ok) throw new Error('Feature not found');
  return res.json();
}


// ---------------------------------------------------------------------------
// Phase Helpers
// ---------------------------------------------------------------------------

/**
 * Return the 0-based index of a phase in the pipeline.
 * @param {string} phase
 * @returns {number} -1 if not found
 */
function getPhaseIndex(phase) {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Return the CSS variable color for a given status string.
 * @param {string} status
 * @returns {string}
 */
function getStatusColor(status) {
  var colors = {
    pending: 'var(--phase-pending)',
    in_progress: 'var(--phase-active)',
    done: 'var(--phase-done)',
    failed: '#ef4444',
    approved: 'var(--phase-done)',
    rejected: '#ef4444'
  };
  return colors[status] || 'var(--phase-pending)';
}

/**
 * Return the badge class suffix for a given status.
 * @param {string} status
 * @returns {string}
 */
function getBadgeClass(status) {
  var map = {
    pending: 'badge--pending',
    in_progress: 'badge--active',
    done: 'badge--done',
    failed: 'badge--failed',
    approved: 'badge--approved',
    rejected: 'badge--rejected'
  };
  return map[status] || 'badge--pending';
}


// ---------------------------------------------------------------------------
// Date Formatting
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string for display.
 * Returns locale-aware date or em-dash for missing values.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '\u2014'; // em-dash
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}


// ---------------------------------------------------------------------------
// SVG Helpers (inline icon strings)
// ---------------------------------------------------------------------------

var SVG_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';

var SVG_WARNING = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v2m0 4h.01"/></svg>';


// ---------------------------------------------------------------------------
// Render: Pipeline
// ---------------------------------------------------------------------------

/**
 * Render the 7-phase pipeline with gate diamonds.
 *
 * @param {Object} feature - feature object with at least `current_phase`
 * @param {Array}  gates   - array of gate objects { gate, status, decided_at, reason }
 * @returns {string} HTML string
 */
function renderPipeline(feature, gates) {
  var currentPhase = feature.current_phase || 'research';
  var currentIdx = getPhaseIndex(currentPhase);
  // Phases to render (exclude 'done' from visual pipeline)
  var phases = PHASE_ORDER.slice(0, 7);
  gates = gates || [];

  // Build a gate status lookup: { G1: 'approved', G2: 'pending', ... }
  var gateStatus = {};
  gates.forEach(function (g) {
    gateStatus[g.gate] = g.status;
  });

  // Calculate progress line width (percentage of track covered by done phases)
  var progressPct = 0;
  if (currentIdx > 0) {
    // Each phase+gate pair occupies roughly 1/(totalElements) of the width
    // There are 7 phases and 7 gates = 14 elements. Current phase is active,
    // so done portion = (currentIdx phases + currentIdx gates) / 14
    var doneElements = currentIdx * 2;
    progressPct = Math.round((doneElements / 13) * 100);
  }
  if (currentPhase === 'done') {
    progressPct = 100;
  }

  var html = '';
  html += '<div class="pipeline">';
  html += '<div class="pipeline__track">';

  // Background line
  html += '<div class="pipeline__line-bg"></div>';
  // Progress fill line
  html += '<div class="pipeline__line-fill" style="width:' + progressPct + '%"></div>';

  phases.forEach(function (phase, i) {
    var isDone = i < currentIdx || currentPhase === 'done';
    var isActive = i === currentIdx && currentPhase !== 'done';
    var stateClass = isDone ? 'pipeline__phase--done' : (isActive ? 'pipeline__phase--active' : 'pipeline__phase--pending');

    // Phase circle
    html += '<div class="pipeline__phase ' + stateClass + '">';
    html += '<div class="pipeline__phase-circle' + (isActive ? ' pulse' : '') + '">';
    if (isDone) {
      html += SVG_CHECK;
    } else {
      html += '<span>' + (i + 1) + '</span>';
    }
    html += '</div>';
    html += '<span class="pipeline__phase-label">' + PHASE_LABELS[phase] + '</span>';
    html += '</div>';

    // Gate diamond after each phase (G1 after phase 0, ..., G7 after phase 6)
    if (i < 7) {
      var gateKey = GATE_LABELS[i];
      var gs = gateStatus[gateKey] || 'pending';
      var gateState = (gs === 'approved' || gs === 'done') ? 'done' : (gs === 'rejected' ? 'rejected' : 'pending');

      html += '<div class="gate-diamond gate-diamond--' + gateState + '">';
      html += '<div class="gate-diamond__shape"></div>';
      html += '<span class="gate-diamond__label">' + gateKey + '</span>';
      html += '</div>';
    }
  });

  html += '</div>'; // .pipeline__track
  html += '</div>'; // .pipeline
  return html;
}


// ---------------------------------------------------------------------------
// Render: Task Table
// ---------------------------------------------------------------------------

/**
 * Render an HTML table for tasks.
 *
 * @param {Array} tasks - array of task objects
 *   { id, name, status, strikes, commit_hash }
 * @returns {string} HTML string
 */
function renderTaskTable(tasks) {
  tasks = tasks || [];
  var html = '';

  html += '<div class="task-table">';
  html += '<table>';

  // Header
  html += '<thead><tr>';
  html += '<th>ID</th>';
  html += '<th>Name</th>';
  html += '<th>Status</th>';
  html += '<th>Strikes</th>';
  html += '<th>Commit</th>';
  html += '</tr></thead>';

  // Body
  html += '<tbody>';
  if (tasks.length === 0) {
    html += '<tr><td colspan="5" style="text-align:center;color:var(--slate-500);padding:2rem;">No tasks yet</td></tr>';
  }

  tasks.forEach(function (task) {
    var status = task.status || 'pending';
    var rowClass = '';
    if (status === 'in_progress') rowClass = ' class="task-row--active"';
    else if (status === 'pending') rowClass = ' class="task-row--pending"';

    html += '<tr' + rowClass + '>';

    // ID
    html += '<td><span class="task-table__id">' + escapeHtml(task.id || '') + '</span></td>';

    // Name
    html += '<td><span class="task-table__name">' + escapeHtml(task.name || '') + '</span></td>';

    // Status badge
    html += '<td><span class="badge ' + getBadgeClass(status) + '">' + escapeHtml(status.replace('_', ' ')) + '</span></td>';

    // Strikes
    var strikes = task.strikes || 0;
    var strikesClass = strikes > 0 ? 'task-table__strikes--warn' : '';
    html += '<td><span class="task-table__strikes ' + strikesClass + '">' + strikes + '</span></td>';

    // Commit
    var commit = task.commit_hash || '\u2014';
    if (task.commit_hash) {
      html += '<td><span class="task-table__commit">' + escapeHtml(task.commit_hash.slice(0, 7)) + '</span></td>';
    } else {
      html += '<td><span style="color:var(--slate-600);font-family:var(--font-mono);font-size:0.625rem;">' + commit + '</span></td>';
    }

    html += '</tr>';
  });

  html += '</tbody>';
  html += '</table>';
  html += '</div>';

  return html;
}


// ---------------------------------------------------------------------------
// Render: Gates Table
// ---------------------------------------------------------------------------

/**
 * Render an HTML table for gates.
 *
 * @param {Array} gates - array of gate objects
 *   { gate, status, decided_at, reason }
 * @returns {string} HTML string
 */
function renderGatesTable(gates) {
  gates = gates || [];
  var html = '';

  html += '<div class="task-table">';
  html += '<table>';

  // Header
  html += '<thead><tr>';
  html += '<th>Gate</th>';
  html += '<th>Status</th>';
  html += '<th>Decided At</th>';
  html += '<th>Reason</th>';
  html += '</tr></thead>';

  // Body
  html += '<tbody>';
  if (gates.length === 0) {
    html += '<tr><td colspan="4" style="text-align:center;color:var(--slate-500);padding:2rem;">No gates recorded</td></tr>';
  }

  gates.forEach(function (gate) {
    var status = gate.status || 'pending';

    html += '<tr>';

    // Gate label
    html += '<td><span class="mono text-sm" style="color:var(--slate-300);">' + escapeHtml(gate.gate || '') + '</span></td>';

    // Status badge
    html += '<td><span class="badge ' + getBadgeClass(status) + '">' + escapeHtml(status) + '</span></td>';

    // Decided at
    html += '<td><span class="mono text-xs" style="color:var(--slate-500);">' + formatDate(gate.decided_at) + '</span></td>';

    // Reason
    html += '<td><span class="text-xs" style="color:var(--slate-400);">' + escapeHtml(gate.reason || '\u2014') + '</span></td>';

    html += '</tr>';
  });

  html += '</tbody>';
  html += '</table>';
  html += '</div>';

  return html;
}


// ---------------------------------------------------------------------------
// Utility: HTML Escaping
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}


// ---------------------------------------------------------------------------
// Attach everything to window for global access
// ---------------------------------------------------------------------------

window.PHASE_ORDER = PHASE_ORDER;
window.PHASE_LABELS = PHASE_LABELS;
window.PHASE_ICONS = PHASE_ICONS;
window.GATE_LABELS = GATE_LABELS;

window.fetchFeatures = fetchFeatures;
window.fetchFeature = fetchFeature;

window.getPhaseIndex = getPhaseIndex;
window.getStatusColor = getStatusColor;
window.getBadgeClass = getBadgeClass;
window.formatDate = formatDate;

window.renderPipeline = renderPipeline;
window.renderTaskTable = renderTaskTable;
window.renderGatesTable = renderGatesTable;

window.escapeHtml = escapeHtml;
