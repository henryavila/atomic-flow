import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const SPEC_HEADERS = [
  '## Requisitos Funcionais',
  '## Regras de Negócio',
  '## Edge Cases',
];

export function computeHash(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function extractSpecSections(specMd) {
  const lines = specMd.split('\n');
  const collected = [];
  let capturing = false;

  for (const line of lines) {
    if (SPEC_HEADERS.some(h => line.startsWith(h))) {
      capturing = true;
      collected.push(line);
    } else if (capturing && line.startsWith('## ')) {
      capturing = false;
    } else if (capturing) {
      collected.push(line);
    }
  }

  return collected.join('\n').trim();
}

export function computeSpecHash(specMd) {
  return computeHash(extractSpecSections(specMd));
}

export function computeFileHash(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return computeHash(content);
}

export function truncateHash(hash, len = 8) {
  return hash.slice(0, len);
}
