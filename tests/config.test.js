import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDE_REGISTRY,
  TEMPLATE_VARS,
  getConfig,
  getTemplateVars,
} from '../src/config.js';

describe('TEMPLATE_VARS', () => {
  it('claude-code has all required tool vars', () => {
    const vars = TEMPLATE_VARS['claude-code'];
    assert.equal(vars.BASH_TOOL, 'Bash');
    assert.equal(vars.READ_TOOL, 'Read');
    assert.equal(vars.WRITE_TOOL, 'Write');
    assert.equal(vars.EDIT_TOOL, 'Edit');
    assert.equal(vars.GLOB_TOOL, 'Glob');
    assert.equal(vars.GREP_TOOL, 'Grep');
    assert.equal(vars.AGENT_TOOL, 'Agent');
  });
});

describe('IDE_REGISTRY', () => {
  it('claude-code has correct config shape', () => {
    const config = IDE_REGISTRY['claude-code'];
    assert.equal(config.name, 'Claude Code');
    assert.equal(config.skillDir, '.claude/skills/atomic-flow');
    assert.equal(config.settingsFile, '.claude/settings.json');
    assert.equal(config.mcpFile, '.mcp.json');
  });
});

describe('getConfig', () => {
  it('returns registry entry for claude-code', () => {
    const config = getConfig('claude-code');
    assert.equal(config.name, 'Claude Code');
    assert.equal(config.skillDir, '.claude/skills/atomic-flow');
  });

  it('throws for unknown IDE', () => {
    assert.throws(
      () => getConfig('unknown'),
      /Unsupported IDE/
    );
  });
});

describe('getTemplateVars', () => {
  it('returns vars for claude-code', () => {
    const vars = getTemplateVars('claude-code');
    assert.equal(vars.BASH_TOOL, 'Bash');
  });

  it('throws for unknown IDE', () => {
    assert.throws(
      () => getTemplateVars('unknown'),
      /Unsupported IDE/
    );
  });
});
