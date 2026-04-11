// ── Spec Validation — Layer 1 (deterministic checks) ─────────
// Six checks that run against raw spec markdown content.
// No AI, no network — pure regex/string analysis.

const REQUIRED_SECTIONS = [
  '## Objetivo',
  '## Requisitos Funcionais',
  '## Regras de Negócio',
  '## Edge Cases',
  '## Arquivos',
  '## Test Contracts',
  '## Fora de Escopo',
];

const WEAK_WORDS = /\b(should|might|maybe|possibly|could|would|probably)\b/i;

const IMPL_PATTERNS =
  /\b(implement|use \w+ library|import \w+|require\(\)|\.js\b|\.ts\b|function\s+\w+|class\s+\w+|JWT|OAuth|Redis|MongoDB)\b/i;

const PENDING_MARKERS = /\[(TODO|TBD|\?|DECIDIR)\]/i;

// ── Check registry ───────────────────────────────────────────

const CHECKS = {
  C1: { name: 'checkmark/X criteria', fn: checkCriteria },
  C2: { name: 'weak words', fn: checkWeakWords },
  C3: { name: 'implementation language', fn: checkImplLanguage },
  C4: { name: 'required sections', fn: checkRequiredSections },
  C5: { name: 'RF/TC cross-reference', fn: checkCrossRef },
  C6: { name: 'pending markers', fn: checkPendingMarkers },
};

// ── Public API ───────────────────────────────────────────────

/**
 * Run a single named check against spec content.
 * @param {string} checkId  One of C1..C6
 * @param {string} specContent  Raw markdown
 * @returns {{ pass: boolean, details: string[] }}
 */
export function runCheck(checkId, specContent) {
  const check = CHECKS[checkId];
  if (!check) throw new Error(`Unknown check: ${checkId}`);
  return check.fn(specContent);
}

/**
 * Run all 6 checks and return an aggregate result.
 * @param {string} specContent  Raw markdown
 * @returns {{ checks: Array<{ id: string, name: string, pass: boolean, details: string[] }>, passed: boolean }}
 */
export function validateSpec(specContent) {
  const checks = Object.entries(CHECKS).map(([id, { name, fn }]) => {
    const { pass, details } = fn(specContent);
    return { id, name, pass, details };
  });
  const passed = checks.every(c => c.pass);
  return { checks, passed };
}

// ── C1: checkmark/X criteria ─────────────────────────────────
// Every RF in ## Requisitos Funcionais must have at least one ✓ AND one ✗
// line (indented under it) before the next RF or section header.

function checkCriteria(spec) {
  const details = [];
  const lines = spec.split('\n');

  // Find the RF section boundaries
  const rfSectionStart = lines.findIndex(l => /^## Requisitos Funcionais/.test(l));
  if (rfSectionStart === -1) return { pass: true, details };

  // Find where the section ends (next ## header or EOF)
  let rfSectionEnd = lines.length;
  for (let i = rfSectionStart + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { rfSectionEnd = i; break; }
  }

  const sectionLines = lines.slice(rfSectionStart, rfSectionEnd);

  // Parse RFs and their criteria
  let currentRF = null;
  let hasCheck = false;
  let hasX = false;

  for (const line of sectionLines) {
    const rfMatch = line.match(/- \*\*RF(\d+):\*\*/);
    if (rfMatch) {
      // Flush previous RF
      if (currentRF !== null) {
        if (!hasCheck) details.push(`RF${currentRF}: missing ✓ criterion`);
        if (!hasX) details.push(`RF${currentRF}: missing ✗ criterion`);
      }
      currentRF = rfMatch[1];
      hasCheck = false;
      hasX = false;
      continue;
    }
    if (currentRF !== null) {
      if (/✓/.test(line)) hasCheck = true;
      if (/✗/.test(line)) hasX = true;
    }
  }

  // Flush last RF
  if (currentRF !== null) {
    if (!hasCheck) details.push(`RF${currentRF}: missing ✓ criterion`);
    if (!hasX) details.push(`RF${currentRF}: missing ✗ criterion`);
  }

  return { pass: details.length === 0, details };
}

// ── C2: weak words ───────────────────────────────────────────
// In ✓/✗ criterion lines, flag weak words.

function checkWeakWords(spec) {
  const details = [];
  const lines = spec.split('\n');

  for (const line of lines) {
    if (!/[✓✗]/.test(line)) continue;
    const match = line.match(WEAK_WORDS);
    if (match) {
      details.push(`weak word: "${match[1]}" in: ${line.trim()}`);
    }
  }

  return { pass: details.length === 0, details };
}

// ── C3: implementation language ──────────────────────────────
// In RF/RN/EC sections, flag implementation-level patterns.

function checkImplLanguage(spec) {
  const details = [];
  const lines = spec.split('\n');
  const targetSections = ['## Requisitos Funcionais', '## Regras de Negócio', '## Edge Cases'];

  let inTarget = false;

  for (const line of lines) {
    if (/^## /.test(line)) {
      inTarget = targetSections.some(s => line.startsWith(s));
      continue;
    }
    if (!inTarget) continue;

    const match = line.match(IMPL_PATTERNS);
    if (match) {
      details.push(`implementation detail: "${match[1]}" in: ${line.trim()}`);
    }
  }

  return { pass: details.length === 0, details };
}

// ── C4: required sections ────────────────────────────────────

function checkRequiredSections(spec) {
  const details = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!spec.includes(section)) {
      const name = section.replace('## ', '');
      details.push(`missing required section: ${name}`);
    }
  }

  return { pass: details.length === 0, details };
}

// ── C5: RF/TC cross-reference ────────────────────────────────
// Every RF## must have at least one matching TC-RF##.

function checkCrossRef(spec) {
  const details = [];

  // Extract all RF IDs
  const rfIds = new Set();
  const rfMatches = spec.matchAll(/\bRF(\d+)\b/g);
  for (const m of rfMatches) {
    // Only count RF IDs, not TC-RF IDs
    // Check that this is not preceded by "TC-"
    const idx = m.index;
    const prefix = spec.slice(Math.max(0, idx - 3), idx);
    if (!prefix.endsWith('TC-')) {
      rfIds.add(m[1]);
    }
  }

  // Extract all TC-RF IDs
  const tcIds = new Set();
  const tcMatches = spec.matchAll(/\bTC-RF(\d+)\b/g);
  for (const m of tcMatches) {
    tcIds.add(m[1]);
  }

  // Every RF must have a matching TC-RF
  for (const id of rfIds) {
    if (!tcIds.has(id)) {
      details.push(`RF${id} has no matching TC-RF${id}`);
    }
  }

  return { pass: details.length === 0, details };
}

// ── C6: pending markers ──────────────────────────────────────

function checkPendingMarkers(spec) {
  const details = [];
  const lines = spec.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(PENDING_MARKERS);
    if (match) {
      details.push(`pending marker [${match[1].toUpperCase()}] at line ${i + 1}: ${lines[i].trim()}`);
    }
  }

  return { pass: details.length === 0, details };
}
