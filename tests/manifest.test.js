import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createManifest,
  addEntry,
  saveManifest,
  readManifest,
  checkConflicts,
} from '../src/manifest.js';

describe('createManifest', () => {
  it('returns object with empty entries and version', () => {
    const manifest = createManifest();
    assert.deepEqual(manifest.entries, {});
    assert.equal(manifest.version, 1);
  });
});

describe('addEntry', () => {
  it('adds entry with installed/current/package hashes', () => {
    const manifest = createManifest();
    const hashes = {
      installed: 'aaa111',
      current: 'bbb222',
      package: 'ccc333',
    };
    addEntry(manifest, 'skills/foo/SKILL.md', hashes);
    assert.deepEqual(manifest.entries['skills/foo/SKILL.md'], hashes);
  });
});

describe('saveManifest + readManifest', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'manifest-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trip preserves data', () => {
    const manifest = createManifest();
    addEntry(manifest, 'skills/bar/SKILL.md', {
      installed: 'hash1',
      current: 'hash2',
      package: 'hash3',
    });
    addEntry(manifest, 'templates/init.md', {
      installed: 'hash4',
      current: 'hash4',
      package: 'hash5',
    });

    saveManifest(manifest, tmpDir);
    const loaded = readManifest(tmpDir);

    assert.deepEqual(loaded, manifest);
  });
});

describe('checkConflicts', () => {
  it('detects modified file (installed hash != current hash)', () => {
    const manifest = createManifest();
    addEntry(manifest, 'skills/modified/SKILL.md', {
      installed: 'original',
      current: 'user-edited',
      package: 'pkg1',
    });
    addEntry(manifest, 'skills/clean/SKILL.md', {
      installed: 'same',
      current: 'same',
      package: 'pkg2',
    });

    const conflicts = checkConflicts(manifest);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].path, 'skills/modified/SKILL.md');
    assert.equal(conflicts[0].installed, 'original');
    assert.equal(conflicts[0].current, 'user-edited');
  });

  it('returns empty when file unchanged (installed == current)', () => {
    const manifest = createManifest();
    addEntry(manifest, 'skills/clean/SKILL.md', {
      installed: 'same-hash',
      current: 'same-hash',
      package: 'pkg1',
    });

    const conflicts = checkConflicts(manifest);
    assert.deepEqual(conflicts, []);
  });
});

describe('readManifest', () => {
  it('returns null for non-existent directory', () => {
    const result = readManifest('/tmp/does-not-exist-manifest-test');
    assert.equal(result, null);
  });
});
