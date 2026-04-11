import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'bin', 'cli.js');

describe('cli — help and usage', () => {
  it('shows help text when no args provided', () => {
    try {
      execSync(`node ${CLI}`, { stdio: 'pipe', encoding: 'utf-8' });
      assert.fail('Should have exited with error');
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '');
      assert.ok(output.includes('Usage: atomic-flow'), 'Should contain usage text');
    }
  });

  it('shows help text with --help flag', () => {
    const output = execSync(`node ${CLI} --help`, { encoding: 'utf-8' });
    assert.ok(output.includes('Usage: atomic-flow'), 'Should contain usage text');
  });

  it('shows error for unknown command', () => {
    try {
      execSync(`node ${CLI} unknown-command`, { stdio: 'pipe', encoding: 'utf-8' });
      assert.fail('Should have exited with error');
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '');
      assert.ok(output.includes('Unknown command'), 'Should contain "Unknown command"');
    }
  });
});

describe('cli — install', () => {
  it('shows "Git repository required" in a non-git directory', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    try {
      execSync(`node ${CLI} install`, {
        stdio: 'pipe',
        encoding: 'utf-8',
        cwd: tmpDir,
      });
      assert.fail('Should have exited with error');
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '');
      assert.ok(output.includes('Git repository required'), 'Should mention git requirement');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('cli — new', () => {
  it('shows error when no feature name provided', () => {
    try {
      execSync(`node ${CLI} new`, { stdio: 'pipe', encoding: 'utf-8' });
      assert.fail('Should have exited with error');
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '');
      assert.ok(output.includes('Feature name required'), 'Should require feature name');
    }
  });
});

describe('cli — gate', () => {
  it('shows error when no subcommand provided', () => {
    try {
      execSync(`node ${CLI} gate`, { stdio: 'pipe', encoding: 'utf-8' });
      assert.fail('Should have exited with error');
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '');
      assert.ok(
        output.includes('Usage: atomic-flow gate'),
        'Should show gate usage'
      );
    }
  });

  it('shows error for gate approve without gate ID', () => {
    try {
      execSync(`node ${CLI} gate approve`, { stdio: 'pipe', encoding: 'utf-8' });
      assert.fail('Should have exited with error');
    } catch (e) {
      const output = (e.stdout || '') + (e.stderr || '');
      assert.ok(output.includes('Gate ID required'), 'Should require gate ID');
    }
  });
});

describe('cli — stubs', () => {
  it('ui prints not yet implemented', () => {
    const output = execSync(`node ${CLI} ui`, { encoding: 'utf-8' });
    assert.ok(output.includes('not yet implemented'), 'Should print stub message');
  });

  it('hook prints not yet implemented', () => {
    const output = execSync(`node ${CLI} hook session-start`, { encoding: 'utf-8' });
    assert.ok(output.includes('not yet implemented'), 'Should print stub message');
  });
});
