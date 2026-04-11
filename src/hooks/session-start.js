// ═══════════════════════════════════════════════════════════
// Session Start Hook — formatSessionOutput
// ═══════════════════════════════════════════════════════════

const PHASE_ICONS = {
  research: '\u2460', spec: '\u2461', validate: '\u2462', decompose: '\u2463',
  implement: '\u2464', review: '\u2465', ship: '\u2466', done: '\u2713'
};

const PHASE_RULES = {
  research: [
    'DISCOVER AND DOCUMENT. NEVER DECIDE.',
    'Save each finding in docs/research/ granularly',
    'Use WebSearch for external context'
  ],
  spec: [
    'ONE QUESTION AT A TIME. NEVER BATCH.',
    'Interview the human \u2014 do not write spec alone',
    'Every RF needs \u2713 success and \u2717 failure criteria'
  ],
  validate: [
    'THREE LAYERS IN ORDER. NO SHORTCUTS.',
    'Layer 1: deterministic checks via MCP validate_spec',
    'Layer 3: adversarial review must find at least 1 issue'
  ],
  decompose: [
    'CONTRACTS FIRST. TASKS SECOND.',
    'Commit contracts before proposing tasks',
    'Max 10 tasks per feature (EC04)'
  ],
  implement: [
    'NO FIX WITHOUT ROOT CAUSE. RED BEFORE GREEN.',
    'Write failing test before implementation code',
    'One task at a time \u2014 finish before starting next'
  ],
  review: [
    'EXECUTION VS SPECIFICATION. NOT PROCESS.',
    'Compare implementation against spec, not process',
    'Max 3 review rounds before escalation'
  ],
  ship: [
    'RECONCILE BEFORE MERGE. NO CODE CHANGES.',
    'Run full test suite \u2014 all must pass',
    'Merge to main via PR only'
  ],
  done: [
    'Feature complete', 'Archive artifacts', 'Celebrate'
  ]
};

/**
 * Format session output for the session-start hook.
 *
 * @param {{ feature: object, task: object|null, gates: object[] }} input
 * @returns {string} Formatted session context
 */
export function formatSessionOutput({ feature, task, gates }) {
  const phase = feature.phase;
  const icon = PHASE_ICONS[phase] || '?';
  const rules = PHASE_RULES[phase] || [];

  const lines = [];

  // Header: icon + phase + feature name
  lines.push(`${icon} ${phase.toUpperCase()} \u2014 ${feature.name}`);
  lines.push('');

  // Phase rules
  lines.push('Rules:');
  for (const rule of rules) {
    lines.push(`  - ${rule}`);
  }
  lines.push('');

  // Current task (if any)
  if (task) {
    lines.push(`Current task: [${task.task_id}] ${task.name}`);
    lines.push('');
  }

  // Gate summary
  const approved = gates.filter(g => g.status === 'approved').length;
  const pending = gates.filter(g => g.status === 'pending').length;
  lines.push(`Gates: ${approved} approved, ${pending} pending`);

  return lines.join('\n');
}

export { PHASE_ICONS, PHASE_RULES };
