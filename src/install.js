import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, saveDb } from './db.js';
import { renderSkill, validateRendered } from './render.js';
import { computeFileHash } from './hash.js';
import { createManifest, addEntry, readManifest, saveManifest } from './manifest.js';
import { parseYaml } from './yaml.js';
import { getConfig } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');

export async function install(targetDir, opts = {}) {
  const { ide = 'claude-code', force = false } = opts;
  const result = { success: true, installed: [], skipped: [], errors: [], warnings: [] };

  // 1. Validate: git repo exists
  if (!isGitRepo(targetDir)) throw new Error('Git repository required');

  // 2. Check Node version >= 18
  const major = parseInt(process.versions.node);
  if (major < 18) throw new Error('Node.js >= 18 required');

  // EC07: warn if .ai/ already exists
  const aiDir = join(targetDir, '.ai');
  if (existsSync(aiDir)) {
    result.warnings.push('.ai/ directory already exists — contents will be preserved');
  }

  const config = getConfig(ide);

  // EC03: track created paths for SIGINT cleanup
  const created = [];
  const onAbort = () => {
    for (const p of created.reverse()) {
      try { rmSync(p, { recursive: true, force: true }); } catch {}
    }
    process.exit(1);
  };
  process.on('SIGINT', onAbort);

  try {

  // 3. Create directories
  const dirs = [
    join(targetDir, '.ai', 'features'),
    join(targetDir, config.skillDir),
  ];
  for (const d of dirs) {
    if (!existsSync(d)) { mkdirSync(d, { recursive: true }); created.push(d); }
  }

  // 4. Read skill catalog and install skills
  const catalogPath = join(PACKAGE_ROOT, 'meta', 'skills.yaml');
  const catalog = parseYaml(readFileSync(catalogPath, 'utf-8'));
  const existingManifest = readManifest(targetDir);
  const manifest = existingManifest || createManifest();

  for (const skill of catalog.skills) {
    const sourcePath = join(PACKAGE_ROOT, skill.source);
    const source = readFileSync(sourcePath, 'utf-8');
    const rendered = renderSkill(source, ide);

    // Validate no unresolved vars
    const validation = validateRendered(rendered);
    if (!validation.valid) {
      result.errors.push(`Skill ${skill.slug}: unresolved vars ${validation.unresolvedVars.join(', ')}`);
      result.success = false;
      continue;
    }

    // Skill target: skillDir/name/SKILL.md (e.g. .claude/skills/atomic-flow/1-research/SKILL.md)
    const skillName = skill.slug.replace('atomic-flow:', '');
    const targetPath = join(targetDir, config.skillDir, skillName, 'SKILL.md');
    const relPath = relative(targetDir, targetPath);

    // Check conflict: skip user-modified files on re-install
    if (!force && existingManifest && manifest.entries[relPath]) {
      const entry = manifest.entries[relPath];
      if (existsSync(targetPath)) {
        const currentHash = computeFileHash(targetPath);
        if (entry.installed !== currentHash) {
          // User modified this file — skip it
          result.skipped.push(relPath);
          continue;
        }
      }
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, rendered);
    const installedHash = computeFileHash(targetPath);
    addEntry(manifest, relPath, {
      installed: installedHash,
      current: installedHash,
      package: computeFileHash(sourcePath),
    });
    result.installed.push(relPath);
  }

  // 5. Initialize SQLite
  const dbPath = join(targetDir, '.ai', 'atomic-flow.db');
  if (!existsSync(dbPath)) {
    const db = await openDb(dbPath);
    saveDb(db, dbPath);
    db.close();
  }

  // 6. Merge hooks into settings.json
  const settingsPath = join(targetDir, config.settingsFile);
  const hooksTemplate = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'templates', 'hooks.json'), 'utf-8'));
  mergeHooks(settingsPath, hooksTemplate);

  // 7. Configure MCP in .mcp.json
  const mcpPath = join(targetDir, config.mcpFile);
  configureMcp(mcpPath);

  // 8. Update .gitignore
  updateGitignore(join(targetDir, '.gitignore'));

  // 9. Save manifest
  saveManifest(manifest, targetDir);

  return result;

  } finally {
    process.removeListener('SIGINT', onAbort);
  }
}

function isGitRepo(dir) {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function mergeHooks(settingsPath, hooksTemplate) {
  let settings = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }
  if (!settings.hooks) settings.hooks = {};
  for (const [event, hooks] of Object.entries(hooksTemplate.hooks)) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    // Add only if not already present (check by command)
    for (const hook of hooks) {
      const exists = settings.hooks[event].some(h => h.command === hook.command);
      if (!exists) settings.hooks[event].push(hook);
    }
  }
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function configureMcp(mcpPath) {
  let mcp = {};
  if (existsSync(mcpPath)) {
    mcp = JSON.parse(readFileSync(mcpPath, 'utf-8'));
  }
  if (!mcp.mcpServers) mcp.mcpServers = {};
  mcp.mcpServers['atomic-flow'] = {
    command: 'node',
    args: ['node_modules/@henryavila/atomic-flow/src/mcp-server.js'],
    type: 'stdio',
  };
  writeFileSync(mcpPath, JSON.stringify(mcp, null, 2));
}

function updateGitignore(gitignorePath) {
  let content = '';
  if (existsSync(gitignorePath)) {
    content = readFileSync(gitignorePath, 'utf-8');
  }
  const entries = ['.ai/atomic-flow.db', '.ai/atomic-flow.db.lock'];
  for (const entry of entries) {
    if (!content.includes(entry)) {
      content += (content.endsWith('\n') || !content ? '' : '\n') + entry + '\n';
    }
  }
  writeFileSync(gitignorePath, content);
}
