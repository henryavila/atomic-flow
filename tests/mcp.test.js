import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTools, handleToolCall } from '../src/mcp-server.js';

// ═══════════════════════════════════════════════════════════
// Tool registry — getTools()
// ═══════════════════════════════════════════════════════════

describe('getTools', () => {
  it('returns array of exactly 12 tools', () => {
    const tools = getTools();
    assert.ok(Array.isArray(tools));
    assert.equal(tools.length, 12);
  });

  it('each tool has name, description, and inputSchema', () => {
    const tools = getTools();
    for (const tool of tools) {
      assert.ok(typeof tool.name === 'string', `tool missing name`);
      assert.ok(tool.name.length > 0, `tool has empty name`);
      assert.ok(typeof tool.description === 'string', `${tool.name}: missing description`);
      assert.ok(tool.description.length > 0, `${tool.name}: empty description`);
      assert.ok(typeof tool.inputSchema === 'object', `${tool.name}: missing inputSchema`);
      assert.equal(tool.inputSchema.type, 'object', `${tool.name}: inputSchema.type must be 'object'`);
    }
  });

  it('tool names match expected set', () => {
    const tools = getTools();
    const names = new Set(tools.map(t => t.name));

    const expected = [
      'new_feature', 'cancel_feature', 'status',
      'gate_approve', 'gate_reject', 'preflight',
      'validate_spec', 'task_done', 'learn',
      'reconcile', 'open_ui', 'transition',
    ];

    assert.equal(names.size, expected.length, 'no duplicate tool names');

    for (const name of expected) {
      assert.ok(names.has(name), `missing tool: ${name}`);
    }
  });

  it('tools with required fields declare them in inputSchema.required', () => {
    const tools = getTools();
    const expectations = {
      new_feature:    ['name'],
      cancel_feature: ['id', 'reason'],
      gate_approve:   ['id', 'gate'],
      gate_reject:    ['id', 'gate', 'reason'],
      preflight:      ['id', 'gate'],
      validate_spec:  ['spec_path'],
      task_done:      ['id', 'task_id'],
      learn:          ['id', 'category', 'content'],
      reconcile:      ['id'],
      transition:     ['id', 'to_phase'],
    };

    for (const tool of tools) {
      const exp = expectations[tool.name];
      if (exp) {
        assert.ok(Array.isArray(tool.inputSchema.required),
          `${tool.name}: should have required array`);
        assert.deepEqual(
          [...tool.inputSchema.required].sort(),
          [...exp].sort(),
          `${tool.name}: required fields mismatch`
        );
      }
    }
  });

  it('optional-only tools (status, open_ui) omit or have empty required', () => {
    const tools = getTools();
    const optionalTools = ['status', 'open_ui'];

    for (const name of optionalTools) {
      const tool = tools.find(t => t.name === name);
      assert.ok(tool, `tool ${name} should exist`);
      const req = tool.inputSchema.required;
      assert.ok(!req || req.length === 0,
        `${name}: should have no required fields`);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Handler dispatch — handleToolCall()
// ═══════════════════════════════════════════════════════════

describe('handleToolCall', () => {
  it('unknown tool throws Error', async () => {
    await assert.rejects(
      () => handleToolCall('unknown_tool', {}),
      { message: 'Unknown tool: unknown_tool' }
    );
  });

  it('open_ui returns stub without DB', async () => {
    const result = await handleToolCall('open_ui', {});
    assert.equal(result.message, 'UI server not yet implemented');
    assert.equal(result.url, null);
  });

  it('open_ui with id returns stub without DB', async () => {
    const result = await handleToolCall('open_ui', { id: 42 });
    assert.equal(result.message, 'UI server not yet implemented');
  });
});
