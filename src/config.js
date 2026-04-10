export const IDE_REGISTRY = {
  'claude-code': {
    name: 'Claude Code',
    skillDir: '.claude/skills/atomic-flow',
    settingsFile: '.claude/settings.json',
    mcpFile: '.mcp.json',
  },
};

export const TEMPLATE_VARS = {
  'claude-code': {
    BASH_TOOL: 'Bash',
    READ_TOOL: 'Read',
    WRITE_TOOL: 'Write',
    EDIT_TOOL: 'Edit',
    GLOB_TOOL: 'Glob',
    GREP_TOOL: 'Grep',
    AGENT_TOOL: 'Agent',
  },
};

export function getConfig(ide) {
  const config = IDE_REGISTRY[ide];
  if (!config) throw new Error(`Unsupported IDE: ${ide}`);
  return config;
}

export function getTemplateVars(ide) {
  const vars = TEMPLATE_VARS[ide];
  if (!vars) throw new Error(`Unsupported IDE: ${ide}`);
  return vars;
}
