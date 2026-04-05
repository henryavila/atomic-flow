/**
 * Process template variables and conditional blocks.
 * @param {string} content - Template content
 * @param {Record<string, string>} vars - Variable substitutions
 * @param {Record<string, boolean>} modules - Installed modules (for conditionals)
 * @param {string} ideId - The current IDE ID
 * @returns {string}
 */
export function renderTemplate(content, vars = {}, modules = {}, ideId = '') {
  // Build full context for conditionals
  const context = {
    modules,
    ide: ideId ? { [ideId]: true } : {},
  };

  // Process conditional blocks (single-level, no nesting)
  // Support {{#if modules.name}} and {{#if ide.name}}
  let result = content.replace(
    /{{#if (modules|ide)\.([\w-]+)}}\n([\s\S]*?){{\/if}}\n?/g,
    (_, type, name, block) => {
      // Normalize ideId for conditional checks (e.g. gemini-commands -> gemini)
      const normalizedName = type === 'ide' && name === 'gemini' && ideId === 'gemini-commands' ? 'gemini' : name;
      const isTrue = context[type] && context[type][normalizedName];
      return isTrue ? block : '';
    }
  );

  // Substitute variables
  const allVars = { ...vars };
  
  // Add IDE-specific tool names
  const isGemini = ideId === 'gemini' || ideId === 'gemini-commands';
  if (isGemini) {
    allVars.BASH_TOOL = 'run_shell_command';
    allVars.READ_TOOL = 'read_file';
    allVars.WRITE_TOOL = 'write_file';
    allVars.REPLACE_TOOL = 'replace';
    allVars.GREP_TOOL = 'grep_search';
    allVars.GLOB_TOOL = 'glob';
    allVars.INVESTIGATOR_TOOL = 'codebase_investigator';
    allVars.ARG_VAR = '$ARGUMENTS';
  } else {
    // Default to Claude Code style tool names
    allVars.BASH_TOOL = 'Bash';
    allVars.READ_TOOL = 'Read tool';
    allVars.WRITE_TOOL = 'Write tool';
    allVars.REPLACE_TOOL = 'Edit tool';
    allVars.GREP_TOOL = 'Grep';
    allVars.GLOB_TOOL = 'Glob';
    allVars.INVESTIGATOR_TOOL = 'Agent';
    allVars.ARG_VAR = '$ARGUMENTS';
  }

  for (const [key, value] of Object.entries(allVars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  // Strip consecutive blank lines (more than 2 newlines → 2)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim() + '\n';
}

/**
 * Wrap rendered content in IDE-specific format.
 * @param {'markdown'|'toml'} format
 * @param {string} name - Skill name (e.g. 'as-fix')
 * @param {string} description - English description
 * @param {string} body - Rendered prompt body
 * @returns {string}
 */
export function renderForIDE(format, name, description, body) {
  if (format === 'toml') {
    const escaped = description.replace(/"/g, '\\"');
    return `description = "${escaped}"\nprompt = """\n${body}\n"""\n`;
  }

  // markdown (default) — YAML single-quote escaping: ' → ''
  const escaped = description.replace(/'/g, "''");
  return `---\nname: ${name}\ndescription: '${escaped}'\n---\n\n${body}\n`;
}
