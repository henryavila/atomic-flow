// src/render.js — Template rendering with var substitution

import { getTemplateVars } from './config.js';

/**
 * Render a template source by processing conditional blocks and substituting variables.
 * @param {string} source - Template source text
 * @param {Record<string, string>} vars - Variable key-value map
 * @param {object} context - Context object (e.g. { ide: 'claude-code' })
 * @returns {string} Rendered string
 */
export function renderTemplate(source, vars, context = {}) {
  // 1. Remove conditional blocks: {{#if ide.X}}...{{/if}}
  //    Keep block content only if context.ide matches X
  let result = source.replace(
    /\{\{#if ide\.(\w[\w-]*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, ideValue, content) => {
      if (context.ide === ideValue) {
        return content.replace(/^\n/, '').replace(/\n$/, '');
      }
      return '';
    }
  );

  // 2. Substitute vars: {{KEY}} replaced by vars[KEY], left as-is if no match
  result = result.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => (key in vars ? vars[key] : match)
  );

  return result;
}

/**
 * Render a skill source using IDE-specific template vars from config.
 * @param {string} source - Template source text
 * @param {string} ide - IDE identifier (default: 'claude-code')
 * @returns {string} Rendered string
 */
export function renderSkill(source, ide = 'claude-code') {
  const vars = getTemplateVars(ide);
  return renderTemplate(source, vars, { ide });
}

/**
 * Validate that all template variables have been resolved.
 * @param {string} content - Rendered content to validate
 * @returns {string[]} Array of unresolved variable names (empty = valid)
 */
export function validateRendered(content) {
  const unresolved = [];
  const re = /\{\{(\w+)\}\}/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    unresolved.push(match[1]);
  }
  return unresolved;
}
