import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, renderSkill, validateRendered } from '../src/render.js';

describe('renderTemplate', () => {
  it('substitutes {{BASH_TOOL}} with Bash when vars include BASH_TOOL', () => {
    const source = 'Use the {{BASH_TOOL}} tool to run commands.';
    const vars = { BASH_TOOL: 'Bash' };
    const result = renderTemplate(source, vars);
    assert.equal(result, 'Use the Bash tool to run commands.');
  });

  it('removes {{#if ide.gemini}}...{{/if}} block for claude-code context', () => {
    const source = [
      'Before',
      '{{#if ide.gemini}}',
      'This is gemini-only content.',
      '{{/if}}',
      'After',
    ].join('\n');
    const result = renderTemplate(source, {}, { ide: 'claude-code' });
    assert.equal(result, 'Before\n\nAfter');
  });

  it('keeps {{#if ide.claude-code}}...{{/if}} block content for claude-code context', () => {
    const source = [
      'Before',
      '{{#if ide.claude-code}}',
      'This is claude-code content.',
      '{{/if}}',
      'After',
    ].join('\n');
    const result = renderTemplate(source, {}, { ide: 'claude-code' });
    assert.equal(result, 'Before\nThis is claude-code content.\nAfter');
  });
});

describe('validateRendered', () => {
  it('catches {{UNKNOWN_VAR}} — returns array with UNKNOWN_VAR', () => {
    const content = 'Hello {{UNKNOWN_VAR}}, welcome to {{APP}}.';
    const result = validateRendered(content);
    assert.deepEqual(result, ['UNKNOWN_VAR', 'APP']);
  });

  it('returns empty array for fully resolved content', () => {
    const content = 'Hello world, no vars here.';
    const result = validateRendered(content);
    assert.deepEqual(result, []);
  });
});

describe('renderSkill', () => {
  it('renders a skill source using claude-code template vars from config.js', () => {
    const source = 'Run {{BASH_TOOL}} and open {{READ_TOOL}} to inspect.';
    const result = renderSkill(source, 'claude-code');
    assert.equal(result, 'Run Bash and open Read to inspect.');
  });
});
