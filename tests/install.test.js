import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { install } from '../src/install.js';
import { computeFileHash } from '../src/hash.js';
import { readManifest } from '../src/manifest.js';

describe('install — clean git repo', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'install-test-'));
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates skills dir, SQLite DB, MCP entry, and .gitignore entries', async () => {
    const result = await install(tmpDir);

    // Skills dir exists
    assert.ok(existsSync(join(tmpDir, '.claude', 'skills', 'atomic-flow')));

    // SQLite DB exists
    assert.ok(existsSync(join(tmpDir, '.ai', 'atomic-flow.db')));

    // MCP entry in .mcp.json
    const mcp = JSON.parse(readFileSync(join(tmpDir, '.mcp.json'), 'utf-8'));
    assert.ok(mcp.mcpServers['atomic-flow']);
    assert.equal(mcp.mcpServers['atomic-flow'].command, 'node');

    // .gitignore entries
    const gitignore = readFileSync(join(tmpDir, '.gitignore'), 'utf-8');
    assert.ok(gitignore.includes('.ai/atomic-flow.db'));
    assert.ok(gitignore.includes('.ai/atomic-flow.db.lock'));

    assert.equal(result.success, true);
  });

  it('installs 10 skills with rendered template vars', async () => {
    const result = await install(tmpDir);

    assert.equal(result.installed.length, 10);

    // Check one skill file exists and contains 'Bash' not '{{BASH_TOOL}}'
    const implementPath = join(tmpDir, '.claude', 'skills', 'atomic-flow', '5-implement', 'SKILL.md');
    assert.ok(existsSync(implementPath));
    const content = readFileSync(implementPath, 'utf-8');
    assert.ok(content.includes('Bash'), 'should contain rendered "Bash"');
    assert.ok(!content.includes('{{BASH_TOOL}}'), 'should not contain unresolved {{BASH_TOOL}}');
  });

  it('creates manifest with hashes at .atomic-flow/manifest.json', async () => {
    await install(tmpDir);

    const manifest = readManifest(tmpDir);
    assert.ok(manifest);
    assert.equal(manifest.version, 1);
    assert.equal(Object.keys(manifest.entries).length, 10);

    // Each entry should have installed, current, package hashes
    for (const [relPath, entry] of Object.entries(manifest.entries)) {
      assert.ok(entry.installed, `${relPath} should have installed hash`);
      assert.ok(entry.current, `${relPath} should have current hash`);
      assert.ok(entry.package, `${relPath} should have package hash`);
      // Freshly installed: installed === current
      assert.equal(entry.installed, entry.current, `${relPath}: installed should equal current`);
    }
  });

  it('merges hooks into .claude/settings.json (creates file if not exists)', async () => {
    await install(tmpDir);

    const settingsPath = join(tmpDir, '.claude', 'settings.json');
    assert.ok(existsSync(settingsPath));
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    assert.ok(settings.hooks);
    assert.ok(Array.isArray(settings.hooks.SessionStart));
    assert.ok(Array.isArray(settings.hooks.PreToolUse));
    assert.ok(settings.hooks.SessionStart.length > 0);
    assert.ok(settings.hooks.PreToolUse.length > 0);
  });

  it('merges hooks into existing .claude/settings.json without overwriting', async () => {
    // Create pre-existing settings with custom data
    const settingsPath = join(tmpDir, '.claude', 'settings.json');
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({
      customKey: 'preserved',
      hooks: {
        SessionStart: [{ type: 'command', command: 'echo hello' }],
      },
    }, null, 2));

    await install(tmpDir);

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    assert.equal(settings.customKey, 'preserved');
    // Should have both the original and the new hook
    assert.ok(settings.hooks.SessionStart.length >= 2);
    assert.ok(settings.hooks.SessionStart.some(h => h.command === 'echo hello'));
  });
});

describe('install — re-install behavior', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'install-reinstall-'));
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips user-modified files but installs unmodified ones', async () => {
    // First install
    const result1 = await install(tmpDir);
    assert.equal(result1.installed.length, 10);

    // Modify one skill file (simulate user edit)
    const modifiedSkillPath = join(tmpDir, '.claude', 'skills', 'atomic-flow', '1-research', 'SKILL.md');
    writeFileSync(modifiedSkillPath, 'user customized content');

    // Re-install
    const result2 = await install(tmpDir);

    // The modified file should be skipped
    const modifiedRelPath = '.claude/skills/atomic-flow/1-research/SKILL.md';
    assert.ok(result2.skipped.includes(modifiedRelPath), 'modified file should be skipped');

    // Unmodified files should be reinstalled
    assert.ok(result2.installed.length > 0, 'unmodified files should be reinstalled');

    // The user-modified content should be preserved
    const preserved = readFileSync(modifiedSkillPath, 'utf-8');
    assert.equal(preserved, 'user customized content');
  });
});

describe('install — not a git repo', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'install-nogit-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws "Git repository required" if not a git repo', async () => {
    await assert.rejects(
      () => install(tmpDir),
      { message: 'Git repository required' }
    );
  });
});

describe('install — EC07 .ai/ warning', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'install-ec07-'));
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('warns when .ai/ directory already exists', async () => {
    mkdirSync(join(tmpDir, '.ai'), { recursive: true });
    writeFileSync(join(tmpDir, '.ai', 'existing-file.txt'), 'keep me');

    const result = await install(tmpDir);

    assert.ok(result.warnings.some(w => w.includes('.ai/')));
    // Existing file should be preserved
    assert.ok(existsSync(join(tmpDir, '.ai', 'existing-file.txt')));
  });

  it('no warning when .ai/ does not exist', async () => {
    const result = await install(tmpDir);
    assert.ok(!result.warnings.some(w => w.includes('.ai/')));
  });
});
