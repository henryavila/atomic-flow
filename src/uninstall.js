// src/uninstall.js — Remove atomic-flow artifacts from a project

import { existsSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getConfig } from './config.js';

export function uninstall(targetDir, opts = {}) {
  const { ide = 'claude-code' } = opts;
  const config = getConfig(ide);
  const result = { removed: [], preserved: [], warnings: [] };

  // 1. Check for active features warning (before removing anything)
  checkActiveFeatures(targetDir, result);

  // 2. Remove skills directory
  removeDir(join(targetDir, config.skillDir), targetDir, result);

  // 3. Remove SQLite + lock
  removeFile(join(targetDir, '.ai', 'atomic-flow.db'), targetDir, result);
  removeFile(join(targetDir, '.ai', 'atomic-flow.db.lock'), targetDir, result);

  // 4. Remove .ai/features/
  removeDir(join(targetDir, '.ai', 'features'), targetDir, result);

  // 5. Clean up .ai/ if empty
  cleanEmptyDir(join(targetDir, '.ai'));

  // 6. Remove manifest directory
  removeDir(join(targetDir, '.atomic-flow'), targetDir, result);

  // 7. Remove hooks from settings.json
  cleanHooks(join(targetDir, config.settingsFile), result);

  // 8. Remove MCP entry from .mcp.json
  cleanMcp(join(targetDir, config.mcpFile), result);

  // 9. Note preserved directories
  for (const d of ['docs/features', 'docs/research']) {
    if (existsSync(join(targetDir, d))) {
      result.preserved.push(d);
    }
  }

  return result;
}

function removeFile(absPath, targetDir, result) {
  if (!existsSync(absPath)) return;
  rmSync(absPath);
  result.removed.push(relative(targetDir, absPath));
}

function removeDir(absPath, targetDir, result) {
  if (!existsSync(absPath)) return;
  rmSync(absPath, { recursive: true });
  result.removed.push(relative(targetDir, absPath));
}

function cleanEmptyDir(absPath) {
  if (!existsSync(absPath)) return;
  try {
    const entries = readdirSync(absPath);
    if (entries.length === 0) {
      rmSync(absPath, { recursive: true });
    }
  } catch {
    // ignore — directory may have been removed already
  }
}

function checkActiveFeatures(targetDir, result) {
  const dbPath = join(targetDir, '.ai', 'atomic-flow.db');
  if (existsSync(dbPath)) {
    result.warnings.push('Database exists — verify no active features before proceeding');
  }
}

function cleanHooks(settingsPath, result) {
  if (!existsSync(settingsPath)) return;

  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return;
  }

  if (!settings.hooks) return;

  let modified = false;
  for (const [event, hooks] of Object.entries(settings.hooks)) {
    if (!Array.isArray(hooks)) continue;
    const filtered = hooks.filter(h => !h.command || !h.command.includes('atomic-flow'));
    if (filtered.length !== hooks.length) {
      settings.hooks[event] = filtered;
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
}

function cleanMcp(mcpPath, result) {
  if (!existsSync(mcpPath)) return;

  let mcp;
  try {
    mcp = JSON.parse(readFileSync(mcpPath, 'utf-8'));
  } catch {
    return;
  }

  if (!mcp.mcpServers || !mcp.mcpServers['atomic-flow']) return;

  delete mcp.mcpServers['atomic-flow'];
  writeFileSync(mcpPath, JSON.stringify(mcp, null, 2));
}
