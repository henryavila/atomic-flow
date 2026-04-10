import { writeFileSync, unlinkSync } from 'node:fs';

export function acquireLock(lockPath, opts) {
  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(lockPath) {
  unlinkSync(lockPath);
}

export async function withLock(lockPath, fn) {
  acquireLock(lockPath);
  try {
    return await fn();
  } finally {
    releaseLock(lockPath);
  }
}
