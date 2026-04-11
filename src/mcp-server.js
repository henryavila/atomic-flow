import { withDb, createFeature, cancelFeature, setTaskStatus, addLearning, getLearnings } from './db.js';
import { transition, approveGate, rejectGate, runPreflight, reconcile } from './enforcement.js';
import { exportStatus } from './export.js';
import { validateSpec } from './validate.js';
import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════
// Tool definitions
// ═══════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: 'new_feature',
    description: 'Create a new feature to track through the 7-phase workflow',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Feature name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'cancel_feature',
    description: 'Cancel an active feature with a reason',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
      required: ['id', 'reason'],
    },
  },
  {
    name: 'status',
    description: 'Get feature status. Without ID returns all features.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID (optional)' },
      },
    },
  },
  {
    name: 'gate_approve',
    description: 'Approve a gate to advance feature phase',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
        gate: { type: 'string', description: 'Gate (G1-G7)' },
      },
      required: ['id', 'gate'],
    },
  },
  {
    name: 'gate_reject',
    description: 'Reject a gate with a reason',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
        gate: { type: 'string', description: 'Gate (G1-G7)' },
        reason: { type: 'string', description: 'Rejection reason' },
      },
      required: ['id', 'gate', 'reason'],
    },
  },
  {
    name: 'preflight',
    description: 'Run preflight checks before gate approval',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
        gate: { type: 'string', description: 'Gate (G1-G7)' },
      },
      required: ['id', 'gate'],
    },
  },
  {
    name: 'validate_spec',
    description: 'Run Layer 1 deterministic spec validation (6 checks)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
        spec_path: { type: 'string', description: 'Path to spec.md file' },
      },
      required: ['spec_path'],
    },
  },
  {
    name: 'task_done',
    description: 'Mark a task as done and prompt for learnings',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
        task_id: { type: 'string', description: 'Task ID' },
      },
      required: ['id', 'task_id'],
    },
  },
  {
    name: 'learn',
    description: 'Record a learning from the current feature work',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
        task_id: { type: 'string', description: 'Task ID (optional)' },
        category: { type: 'string', description: 'Learning category: decision, pattern, mistake, discovery' },
        content: { type: 'string', description: 'What was learned' },
      },
      required: ['id', 'category', 'content'],
    },
  },
  {
    name: 'reconcile',
    description: 'Check if feature is ready to ship (all gates, all tasks, spec_hash)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'open_ui',
    description: 'Open the tracking UI in browser',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID (optional)' },
      },
    },
  },
  {
    name: 'transition',
    description: 'Internal: transition feature to a new phase (called by skills)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Feature ID' },
        to_phase: { type: 'string', description: 'Target phase' },
      },
      required: ['id', 'to_phase'],
    },
  },
];

// ═══════════════════════════════════════════════════════════
// Public API (testable without stdio)
// ═══════════════════════════════════════════════════════════

export function getTools() {
  return TOOLS;
}

export async function handleToolCall(name, args) {
  switch (name) {
    case 'new_feature':
      return withDb(db => createFeature(db, args.name));

    case 'cancel_feature':
      return withDb(db => {
        cancelFeature(db, args.id, args.reason);
        return { success: true, message: `Feature ${args.id} cancelled` };
      });

    case 'status':
      return withDb(db => exportStatus(db, args.id));

    case 'gate_approve':
      return withDb(db => approveGate(db, args.id, args.gate, process.cwd()));

    case 'gate_reject':
      return withDb(db => rejectGate(db, args.id, args.gate, args.reason));

    case 'preflight':
      return withDb(db => runPreflight(db, args.id, args.gate));

    case 'validate_spec': {
      const content = readFileSync(args.spec_path, 'utf-8');
      return validateSpec(content);
    }

    case 'task_done':
      return withDb(db => {
        setTaskStatus(db, args.id, args.task_id, 'done');
        return { success: true, learnings_prompt: 'Use the learn tool to record what you learned from this task.' };
      });

    case 'learn':
      return withDb(db => {
        addLearning(db, args.id, args.task_id || null, args.category, args.content);
        const learnings = getLearnings(db, args.id);
        return { success: true, total_learnings: learnings.length };
      });

    case 'reconcile':
      return withDb(db => reconcile(db, args.id, {}));

    case 'open_ui':
      return { url: null, message: 'UI server not yet implemented' };

    case 'transition':
      return withDb(db => transition(db, args.id, args.to_phase));

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ═══════════════════════════════════════════════════════════
// Server startup (only when run directly)
// ═══════════════════════════════════════════════════════════

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('mcp-server.js') ||
  process.argv[1].includes('mcp-server')
);

if (isDirectRun) {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

  const server = new Server(
    { name: 'atomic-flow', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler('tools/list', async () => ({
    tools: getTools(),
  }));

  server.setRequestHandler('tools/call', async (request) => {
    try {
      const result = await handleToolCall(request.params.name, request.params.arguments || {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
