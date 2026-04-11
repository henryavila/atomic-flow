import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCheck, validateSpec } from '../src/validate.js';

// ── Helpers ──────────────────────────────────────────────────

/** Minimal valid spec with all 7 required sections and proper RF/TC structure */
function validSpec() {
  return [
    '# Feature X',
    '',
    '## Objetivo',
    'Do something useful.',
    '',
    '## Requisitos Funcionais',
    '- **RF01:** User can log in',
    '  ✓ Returns session token on valid credentials',
    '  ✗ Returns 401 on invalid credentials',
    '',
    '## Regras de Negócio',
    '- **RN01:** Max 5 attempts per hour',
    '',
    '## Edge Cases',
    '- EC01: Empty password',
    '',
    '## Arquivos',
    '- src/auth.js',
    '',
    '## Test Contracts',
    '- **TC-RF01:** Verify login flow',
    '',
    '## Fora de Escopo',
    '- Password reset',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════
// C1 — checkmark/X criteria
// ═══════════════════════════════════════════════════════════

describe('C1 — checkmark/X criteria', () => {
  it('fails when RF has only ✓ (missing ✗)', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** User logs in',
      '  ✓ Returns 200 on success',
      '',
      '## Regras de Negócio',
    ].join('\n');

    const result = runCheck('C1', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.length > 0);
    assert.ok(result.details.some(d => d.includes('RF01')));
  });

  it('fails when RF has only ✗ (missing ✓)', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** User logs in',
      '  ✗ Returns 401 on bad password',
      '',
      '## Regras de Negócio',
    ].join('\n');

    const result = runCheck('C1', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => d.includes('RF01')));
  });

  it('passes when RF has both ✓ and ✗', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** User logs in',
      '  ✓ Returns 200 on success',
      '  ✗ Returns 401 on bad password',
      '',
      '## Regras de Negócio',
    ].join('\n');

    const result = runCheck('C1', spec);
    assert.equal(result.pass, true);
    assert.deepEqual(result.details, []);
  });

  it('checks multiple RFs independently', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** User logs in',
      '  ✓ Returns 200 on success',
      '  ✗ Returns 401 on bad password',
      '- **RF02:** User logs out',
      '  ✓ Session destroyed',
      '',
      '## Regras de Negócio',
    ].join('\n');

    const result = runCheck('C1', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => d.includes('RF02')));
    // RF01 should NOT appear since it has both
    assert.ok(!result.details.some(d => d.includes('RF01')));
  });
});

// ═══════════════════════════════════════════════════════════
// C2 — weak words
// ═══════════════════════════════════════════════════════════

describe('C2 — weak words', () => {
  it('fails when criterion line contains "should"', () => {
    const spec = '  ✓ should work properly\n';

    const result = runCheck('C2', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => d.includes('should')));
  });

  it('fails when criterion line contains "might"', () => {
    const spec = '  ✓ might return a value\n';

    const result = runCheck('C2', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => d.includes('might')));
  });

  it('fails when criterion line contains "probably"', () => {
    const spec = '  ✗ probably fails on timeout\n';

    const result = runCheck('C2', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => d.includes('probably')));
  });

  it('passes when criterion line has no weak words', () => {
    const spec = '  ✓ returns 200 status code\n';

    const result = runCheck('C2', spec);
    assert.equal(result.pass, true);
    assert.deepEqual(result.details, []);
  });
});

// ═══════════════════════════════════════════════════════════
// C3 — implementation language
// ═══════════════════════════════════════════════════════════

describe('C3 — implementation language', () => {
  it('flags "implement JWT" in RF section', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** implement JWT authentication',
      '',
      '## Regras de Negócio',
    ].join('\n');

    const result = runCheck('C3', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.length > 0);
  });

  it('flags "class AuthService" in RN section', () => {
    const spec = [
      '## Regras de Negócio',
      '- **RN01:** class AuthService handles sessions',
      '',
      '## Edge Cases',
    ].join('\n');

    const result = runCheck('C3', spec);
    assert.equal(result.pass, false);
  });

  it('flags "use Redis library" in Edge Cases', () => {
    const spec = [
      '## Edge Cases',
      '- EC01: use Redis library for caching',
      '',
      '## Arquivos',
    ].join('\n');

    const result = runCheck('C3', spec);
    assert.equal(result.pass, false);
  });

  it('passes when RF describes behavior without implementation details', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** User authenticates via token',
      '',
      '## Regras de Negócio',
      '- **RN01:** Sessions expire after 30 minutes',
      '',
      '## Edge Cases',
      '- EC01: Expired token returns 401',
    ].join('\n');

    const result = runCheck('C3', spec);
    assert.equal(result.pass, true);
    assert.deepEqual(result.details, []);
  });
});

// ═══════════════════════════════════════════════════════════
// C4 — required sections
// ═══════════════════════════════════════════════════════════

describe('C4 — required sections', () => {
  it('fails when "## Edge Cases" is missing', () => {
    const spec = [
      '## Objetivo',
      'Something.',
      '## Requisitos Funcionais',
      '- RF01',
      '## Regras de Negócio',
      '- RN01',
      '## Arquivos',
      '- src/a.js',
      '## Test Contracts',
      '- TC-RF01',
      '## Fora de Escopo',
      '- Nothing',
    ].join('\n');

    const result = runCheck('C4', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => d.includes('Edge Cases')));
  });

  it('passes when all 7 required sections are present', () => {
    const result = runCheck('C4', validSpec());
    assert.equal(result.pass, true);
    assert.deepEqual(result.details, []);
  });

  it('reports all missing sections at once', () => {
    const spec = '## Objetivo\nSomething.\n';

    const result = runCheck('C4', spec);
    assert.equal(result.pass, false);
    // Should report 6 missing sections
    assert.equal(result.details.length, 6);
  });
});

// ═══════════════════════════════════════════════════════════
// C5 — RF/TC cross-reference
// ═══════════════════════════════════════════════════════════

describe('C5 — RF/TC cross-reference', () => {
  it('fails when RF01 exists but TC-RF01 does not', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** User logs in',
      '  ✓ ok',
      '  ✗ fail',
      '',
      '## Test Contracts',
      '- Nothing here matches',
    ].join('\n');

    const result = runCheck('C5', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => d.includes('RF01')));
  });

  it('passes when every RF has a matching TC-RF', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** User logs in',
      '- **RF02:** User logs out',
      '',
      '## Test Contracts',
      '- **TC-RF01:** Verify login',
      '- **TC-RF02:** Verify logout',
    ].join('\n');

    const result = runCheck('C5', spec);
    assert.equal(result.pass, true);
    assert.deepEqual(result.details, []);
  });

  it('reports all uncovered RFs', () => {
    const spec = [
      '## Requisitos Funcionais',
      '- **RF01:** Login',
      '- **RF02:** Logout',
      '- **RF03:** Reset password',
      '',
      '## Test Contracts',
      '- **TC-RF01:** Test login',
    ].join('\n');

    const result = runCheck('C5', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => d.includes('RF02')));
    assert.ok(result.details.some(d => d.includes('RF03')));
    assert.ok(!result.details.some(d => d.includes('RF01') && !d.includes('RF')));
  });
});

// ═══════════════════════════════════════════════════════════
// C6 — pending markers
// ═══════════════════════════════════════════════════════════

describe('C6 — pending markers', () => {
  it('fails when spec contains [TODO]', () => {
    const spec = 'Some text [TODO] fill in later\n';

    const result = runCheck('C6', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => /TODO/i.test(d)));
  });

  it('fails when spec contains [TBD]', () => {
    const spec = 'Details [TBD]\n';

    const result = runCheck('C6', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => /TBD/i.test(d)));
  });

  it('fails when spec contains [?]', () => {
    const spec = 'Is this right [?]\n';

    const result = runCheck('C6', spec);
    assert.equal(result.pass, false);
  });

  it('fails when spec contains [DECIDIR]', () => {
    const spec = 'Need to [DECIDIR] approach\n';

    const result = runCheck('C6', spec);
    assert.equal(result.pass, false);
    assert.ok(result.details.some(d => /DECIDIR/i.test(d)));
  });

  it('is case-insensitive', () => {
    const spec = 'Something [todo] here\n';

    const result = runCheck('C6', spec);
    assert.equal(result.pass, false);
  });

  it('passes when no pending markers present', () => {
    const spec = 'Clean specification content.\n';

    const result = runCheck('C6', spec);
    assert.equal(result.pass, true);
    assert.deepEqual(result.details, []);
  });
});

// ═══════════════════════════════════════════════════════════
// validateSpec integration
// ═══════════════════════════════════════════════════════════

describe('validateSpec', () => {
  it('returns passed = true for a clean spec', () => {
    const result = validateSpec(validSpec());

    assert.equal(result.passed, true);
    assert.ok(Array.isArray(result.checks));
    assert.equal(result.checks.length, 6);
    for (const check of result.checks) {
      assert.equal(check.pass, true);
      assert.ok(check.id);
      assert.ok(check.name);
      assert.ok(Array.isArray(check.details));
    }
  });

  it('returns passed = false when spec has issues', () => {
    // Spec missing Edge Cases section, has [TODO], and weak word
    const spec = [
      '## Objetivo',
      'Do something [TODO].',
      '',
      '## Requisitos Funcionais',
      '- **RF01:** User logs in',
      '  ✓ should return token',
      '  ✗ Returns 401',
      '',
      '## Regras de Negócio',
      '- RN01: Max attempts',
      '',
      '## Arquivos',
      '- src/a.js',
      '',
      '## Test Contracts',
      '- **TC-RF01:** Test login',
      '',
      '## Fora de Escopo',
      '- Nothing',
    ].join('\n');

    const result = validateSpec(spec);

    assert.equal(result.passed, false);
    assert.equal(result.checks.length, 6);

    // C2 should fail (weak word "should")
    const c2 = result.checks.find(c => c.id === 'C2');
    assert.equal(c2.pass, false);

    // C4 should fail (missing Edge Cases)
    const c4 = result.checks.find(c => c.id === 'C4');
    assert.equal(c4.pass, false);

    // C6 should fail ([TODO])
    const c6 = result.checks.find(c => c.id === 'C6');
    assert.equal(c6.pass, false);
  });

  it('includes all 6 check IDs (C1-C6)', () => {
    const result = validateSpec(validSpec());

    const ids = result.checks.map(c => c.id);
    assert.deepEqual(ids.sort(), ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
  });

  it('each check has id, name, pass, and details fields', () => {
    const result = validateSpec(validSpec());

    for (const check of result.checks) {
      assert.ok(typeof check.id === 'string');
      assert.ok(typeof check.name === 'string');
      assert.ok(typeof check.pass === 'boolean');
      assert.ok(Array.isArray(check.details));
    }
  });
});
