import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeHash,
  extractSpecSections,
  computeSpecHash,
  computeFileHash,
  truncateHash,
} from '../src/hash.js';

describe('computeHash', () => {
  it('returns known SHA-256 hex for "hello" (64 chars)', () => {
    const hash = computeHash('hello');
    assert.equal(hash.length, 64);
    // SHA-256 of "hello"
    assert.equal(
      hash,
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('returns different hashes for different content', () => {
    assert.notEqual(computeHash('a'), computeHash('b'));
  });
});

describe('extractSpecSections', () => {
  const specMd = [
    '# Feature: Login',
    '',
    '## Objetivo',
    'Enable user authentication.',
    '',
    '## Requisitos Funcionais',
    '- RF01: User can login with email',
    '- RF02: User receives JWT token',
    '',
    '## Regras de Negócio',
    '- RN01: Token expires in 24h',
    '',
    '## Edge Cases',
    '- EC01: Invalid credentials show error',
    '',
    '## Arquivos',
    '- src/auth.js',
    '',
    '## TestContracts',
    '- TC01: valid login returns 200',
  ].join('\n');

  it('includes RF, RN, and EC sections', () => {
    const sections = extractSpecSections(specMd);
    assert.ok(sections.includes('RF01'));
    assert.ok(sections.includes('RN01'));
    assert.ok(sections.includes('EC01'));
  });

  it('excludes Objetivo, Arquivos, and TestContracts', () => {
    const sections = extractSpecSections(specMd);
    assert.ok(!sections.includes('Objetivo'));
    assert.ok(!sections.includes('src/auth.js'));
    assert.ok(!sections.includes('TC01'));
  });
});

describe('computeSpecHash', () => {
  it('unchanged when non-requirement sections change (RN11)', () => {
    const specA = [
      '## Objetivo',
      'Version A objective.',
      '',
      '## Requisitos Funcionais',
      '- RF01: Login',
      '',
      '## Regras de Negócio',
      '- RN01: 24h expiry',
      '',
      '## Edge Cases',
      '- EC01: Bad creds',
    ].join('\n');

    const specB = [
      '## Objetivo',
      'Completely different objective text!',
      '',
      '## Requisitos Funcionais',
      '- RF01: Login',
      '',
      '## Regras de Negócio',
      '- RN01: 24h expiry',
      '',
      '## Edge Cases',
      '- EC01: Bad creds',
      '',
      '## Arquivos',
      '- new-file.js',
    ].join('\n');

    assert.equal(computeSpecHash(specA), computeSpecHash(specB));
  });

  it('changes when requirement sections change', () => {
    const specA = [
      '## Requisitos Funcionais',
      '- RF01: Login',
      '',
      '## Regras de Negócio',
      '- RN01: 24h expiry',
      '',
      '## Edge Cases',
      '- EC01: Bad creds',
    ].join('\n');

    const specB = [
      '## Requisitos Funcionais',
      '- RF01: Login',
      '- RF02: New requirement',
      '',
      '## Regras de Negócio',
      '- RN01: 24h expiry',
      '',
      '## Edge Cases',
      '- EC01: Bad creds',
    ].join('\n');

    assert.notEqual(computeSpecHash(specA), computeSpecHash(specB));
  });
});

describe('computeFileHash', () => {
  it('returns hash of file contents', () => {
    const tmpFile = join(tmpdir(), `hash-test-${process.pid}.txt`);
    writeFileSync(tmpFile, 'hello');
    try {
      const hash = computeFileHash(tmpFile);
      assert.equal(hash, computeHash('hello'));
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

describe('truncateHash', () => {
  it('returns first 8 chars by default', () => {
    const hash = computeHash('hello');
    const truncated = truncateHash(hash);
    assert.equal(truncated.length, 8);
    assert.equal(truncated, hash.slice(0, 8));
  });

  it('returns first N chars when specified', () => {
    const hash = computeHash('hello');
    assert.equal(truncateHash(hash, 12).length, 12);
    assert.equal(truncateHash(hash, 4).length, 4);
  });
});
