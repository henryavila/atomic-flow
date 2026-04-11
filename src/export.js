import {
  getFeature, getGates, getTasks, getLearnings,
  getAllFeatures, getFeatureStats,
} from './db.js';

// ═══════════════════════════════════════════════════════════
// exportTracking — Feature state → Markdown string
// ═══════════════════════════════════════════════════════════

export function exportTracking(db, featureId) {
  const feature = getFeature(db, featureId);
  if (!feature) throw new Error(`Feature ${featureId} not found`);

  const gates = getGates(db, featureId);
  const tasks = getTasks(db, featureId);
  const learnings = getLearnings(db, featureId);

  const lines = [];

  // ── Header ──────────────────────────────────────────────
  lines.push(`# Tracking: ${feature.name}`);
  lines.push('');
  lines.push(`**ID:** ${feature.id} | **Branch:** ${feature.branch} | **Phase:** ${feature.phase} | **Status:** ${feature.status}`);
  lines.push('');

  // ── Gates table ─────────────────────────────────────────
  lines.push('## Gates');
  lines.push('');
  lines.push('| Gate | Status | Decided At | Reason |');
  lines.push('|------|--------|------------|--------|');
  for (const g of gates) {
    const decidedAt = g.decided_at || '';
    const reason = g.reason || '';
    lines.push(`| ${g.gate} | ${g.status} | ${decidedAt} | ${reason} |`);
  }
  lines.push('');

  // ── Tasks table ─────────────────────────────────────────
  lines.push('## Tasks');
  lines.push('');
  lines.push('| Task ID | Name | Status | Strikes | Commit Hash |');
  lines.push('|---------|------|--------|---------|-------------|');
  for (const t of tasks) {
    const commitHash = t.commit_hash || '';
    lines.push(`| ${t.task_id} | ${t.name} | ${t.status} | ${t.strikes} | ${commitHash} |`);
  }
  lines.push('');

  // ── Learnings ───────────────────────────────────────────
  lines.push('## Learnings');
  lines.push('');
  lines.push(`Total: ${learnings.length}`);
  lines.push('');

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════
// exportStatus — Feature state → Structured object
// ═══════════════════════════════════════════════════════════

export function exportStatus(db, featureId) {
  if (featureId !== undefined && featureId !== null) {
    const feature = getFeature(db, featureId);
    if (!feature) throw new Error(`Feature ${featureId} not found`);

    const gates = getGates(db, featureId);
    const tasks = getTasks(db, featureId);
    const learnings = getLearnings(db, featureId);

    return {
      feature,
      gates,
      tasks,
      learnings_count: learnings.length,
    };
  }

  // No featureId — return summary of all features
  const features = getAllFeatures(db);
  const stats = getFeatureStats(db);

  return { features, stats };
}
