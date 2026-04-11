// ═══════════════════════════════════════════════════════════
// Pre-Tool-Use Hook — checkFileScope
// ═══════════════════════════════════════════════════════════

const PHASE_SCOPES = {
  research:  { allowed: ['docs/research/'] },
  spec:      { allowed: ['.md'] },
  validate:  { allowed: ['.md'] },
  decompose: { allowed: ['meta/', 'docs/'] },
  implement: { allowed: ['src/', 'tests/', 'package.json'] },
  review:    { allowed: ['src/', 'tests/'] },
  ship:      { allowed: [] },
  done:      { allowed: [] },
};

/**
 * Check whether a file write is allowed in the given phase.
 *
 * @param {string} phase    - Current feature phase
 * @param {string} filePath - Path of the file being written
 * @param {{ featureId: number, slug: string }} context
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkFileScope(phase, filePath, context) {
  const scope = PHASE_SCOPES[phase];

  if (!scope) {
    return { allowed: false, reason: `Unknown phase: ${phase}` };
  }

  const patterns = scope.allowed;

  // No writes allowed at all in this phase
  if (patterns.length === 0) {
    return { allowed: false, reason: `No file writes allowed in ${phase} phase` };
  }

  // Check if filePath matches any allowed pattern
  for (const pattern of patterns) {
    // Exact match (e.g. 'package.json')
    if (!pattern.includes('/') && !pattern.startsWith('.')) {
      if (filePath === pattern) return { allowed: true };
    }
    // Directory prefix (e.g. 'src/', 'docs/research/')
    else if (pattern.endsWith('/')) {
      if (filePath.startsWith(pattern)) return { allowed: true };
    }
    // Extension match (e.g. '.md')
    else if (pattern.startsWith('.')) {
      if (filePath.endsWith(pattern)) return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `File "${filePath}" is outside allowed scope for ${phase} phase (allowed: ${patterns.join(', ')})`
  };
}

export { PHASE_SCOPES };
