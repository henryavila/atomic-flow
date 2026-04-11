import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uninstall, checkNeedsConfirmation } from '../src/uninstall.js';

/**
 * Helper: scaffold a full atomic-flow install inside a temp directory.
 * Returns the targetDir path.
 */
function scaffoldInstall(targetDir) {
  // Skills directory
  const skillDir = join(targetDir, '.claude', 'skills', 'atomic-flow');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), '# Skill');

  // SQLite database + lock
  const aiDir = join(targetDir, '.ai');
  mkdirSync(aiDir, { recursive: true });
  writeFileSync(join(aiDir, 'atomic-flow.db'), 'fake-db');
  writeFileSync(join(aiDir, 'atomic-flow.db.lock'), 'lock');

  // .ai/features/
  const featuresDir = join(aiDir, 'features');
  mkdirSync(featuresDir, { recursive: true });
  writeFileSync(join(featuresDir, 'F001.yaml'), 'name: test');

  // Manifest
  const manifestDir = join(targetDir, '.atomic-flow');
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, 'manifest.json'), '{}');

  // Settings with hooks
  const claudeDir = join(targetDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [
        { command: 'node /path/to/atomic-flow/hooks/pre-tool.js', event: 'PreToolUse' },
        { command: 'node /path/to/other-tool/hook.js', event: 'PreToolUse' },
      ],
      PostToolUse: [
        { command: 'node /path/to/atomic-flow/hooks/post-tool.js', event: 'PostToolUse' },
      ],
    },
    other_setting: true,
  }, null, 2));

  // MCP config
  writeFileSync(join(targetDir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      'atomic-flow': { command: 'node', args: ['mcp-server.js'] },
      'other-server': { command: 'python', args: ['server.py'] },
    },
  }, null, 2));

  // docs directories (should be preserved)
  mkdirSync(join(targetDir, 'docs', 'features'), { recursive: true });
  writeFileSync(join(targetDir, 'docs', 'features', 'F001.md'), '# Feature 1');
  mkdirSync(join(targetDir, 'docs', 'research'), { recursive: true });
  writeFileSync(join(targetDir, 'docs', 'research', 'notes.md'), '# Research');
}

describe('uninstall', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'uninstall-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes skills directory', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    assert.ok(!existsSync(join(tmpDir, '.claude', 'skills', 'atomic-flow')));
    assert.ok(result.removed.includes('.claude/skills/atomic-flow'));
  });

  it('removes SQLite database and lock file', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    assert.ok(!existsSync(join(tmpDir, '.ai', 'atomic-flow.db')));
    assert.ok(!existsSync(join(tmpDir, '.ai', 'atomic-flow.db.lock')));
    assert.ok(result.removed.includes('.ai/atomic-flow.db'));
    assert.ok(result.removed.includes('.ai/atomic-flow.db.lock'));
  });

  it('removes .ai/features/ directory', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    assert.ok(!existsSync(join(tmpDir, '.ai', 'features')));
    assert.ok(result.removed.includes('.ai/features'));
  });

  it('removes manifest directory', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    assert.ok(!existsSync(join(tmpDir, '.atomic-flow')));
    assert.ok(result.removed.includes('.atomic-flow'));
  });

  it('removes atomic-flow hook entries from settings.json, preserves others', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf-8'));

    // Other hooks preserved
    assert.equal(settings.hooks.PreToolUse.length, 1);
    assert.ok(settings.hooks.PreToolUse[0].command.includes('other-tool'));

    // atomic-flow PostToolUse hooks removed entirely (array empty or key gone)
    assert.ok(
      !settings.hooks.PostToolUse || settings.hooks.PostToolUse.length === 0
    );

    // Other settings preserved
    assert.equal(settings.other_setting, true);
  });

  it('removes MCP entry from .mcp.json, preserves others', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    const mcp = JSON.parse(readFileSync(join(tmpDir, '.mcp.json'), 'utf-8'));
    assert.ok(!mcp.mcpServers['atomic-flow']);
    assert.ok(mcp.mcpServers['other-server']);
    assert.equal(mcp.mcpServers['other-server'].command, 'python');
  });

  it('preserves docs/features/ and docs/research/ directories', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    assert.ok(existsSync(join(tmpDir, 'docs', 'features', 'F001.md')));
    assert.ok(existsSync(join(tmpDir, 'docs', 'research', 'notes.md')));
    assert.ok(result.preserved.includes('docs/features'));
    assert.ok(result.preserved.includes('docs/research'));
  });

  it('returns warning when database file exists', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings.some(w => w.includes('Database exists')));
  });

  it('no warning when database does not exist', () => {
    scaffoldInstall(tmpDir);
    // Remove the db before calling uninstall
    rmSync(join(tmpDir, '.ai', 'atomic-flow.db'));
    const result = uninstall(tmpDir);

    assert.ok(!result.warnings.some(w => w.includes('Database exists')));
  });

  it('cleans up .ai/ directory when empty after removal', () => {
    scaffoldInstall(tmpDir);
    const result = uninstall(tmpDir);

    // After removing db, lock, and features — .ai/ should be gone
    assert.ok(!existsSync(join(tmpDir, '.ai')));
  });

  it('handles missing files gracefully (idempotent)', () => {
    // Empty directory — nothing to remove
    const result = uninstall(tmpDir);

    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.preserved, []);
    assert.deepEqual(result.warnings, []);
  });

  it('handles settings.json with no hooks key', () => {
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    writeFileSync(join(tmpDir, '.claude', 'settings.json'), JSON.stringify({
      other_setting: true,
    }, null, 2));

    const result = uninstall(tmpDir);

    const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf-8'));
    assert.equal(settings.other_setting, true);
  });

  it('handles .mcp.json with no mcpServers key', () => {
    writeFileSync(join(tmpDir, '.mcp.json'), JSON.stringify({
      other: true,
    }, null, 2));

    const result = uninstall(tmpDir);

    const mcp = JSON.parse(readFileSync(join(tmpDir, '.mcp.json'), 'utf-8'));
    assert.equal(mcp.other, true);
  });
});

describe('checkNeedsConfirmation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'uninstall-confirm-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns true when database file exists', () => {
    mkdirSync(join(tmpDir, '.ai'), { recursive: true });
    writeFileSync(join(tmpDir, '.ai', 'atomic-flow.db'), 'fake-db');

    assert.equal(checkNeedsConfirmation(tmpDir), true);
  });

  it('returns false when database does not exist', () => {
    assert.equal(checkNeedsConfirmation(tmpDir), false);
  });
});
