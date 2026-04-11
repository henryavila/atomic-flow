// src/manifest.js — 3-hash file tracking for installed files

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const MANIFEST_DIR = '.atomic-flow';
const MANIFEST_FILE = 'manifest.json';

export function createManifest() {
  return { version: 1, entries: {} };
}

export function addEntry(manifest, relPath, hashes) {
  // hashes = { installed, current, package }
  manifest.entries[relPath] = hashes;
}

export function readManifest(dir) {
  const filePath = join(dir, MANIFEST_DIR, MANIFEST_FILE);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function checkConflicts(manifest) {
  // Returns array of { path, installed, current } for entries where installed != current
  // (meaning user modified the file after install)
  const conflicts = [];
  for (const [relPath, hashes] of Object.entries(manifest.entries)) {
    if (hashes.installed !== hashes.current) {
      conflicts.push({
        path: relPath,
        installed: hashes.installed,
        current: hashes.current,
      });
    }
  }
  return conflicts;
}

export function saveManifest(manifest, dir) {
  const manifestDir = join(dir, MANIFEST_DIR);
  if (!existsSync(manifestDir)) mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2)
  );
}
