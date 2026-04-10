import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireLock, releaseLock, withLock } from '../src/lock.js';

const lockPath = join(tmpdir(), `atomic-flow-lock-test-${process.pid}.lock`);

// Cleanup after each test to avoid leaking lock files
afterEach(() => {
  try { unlinkSync(lockPath); } catch { /* ignore */ }
});

describe('acquireLock + releaseLock lifecycle', () => {
  it('acquires and releases successfully', () => {
    const acquired = acquireLock(lockPath);
    assert.equal(acquired, true);
    assert.equal(existsSync(lockPath), true);

    releaseLock(lockPath);
    assert.equal(existsSync(lockPath), false);
  });
});

describe('second acquireLock on same path', () => {
  it('returns false when lock already held', () => {
    const first = acquireLock(lockPath);
    assert.equal(first, true);

    const second = acquireLock(lockPath);
    assert.equal(second, false);
  });
});

describe('withLock', () => {
  it('executes fn and releases lock', async () => {
    const result = await withLock(lockPath, () => 42);
    assert.equal(result, 42);
    assert.equal(existsSync(lockPath), false);
  });

  it('releases lock even on error', async () => {
    await assert.rejects(
      () => withLock(lockPath, () => { throw new Error('boom'); }),
      { message: 'boom' }
    );
    assert.equal(existsSync(lockPath), false);
  });

  it('returns result of async fn', async () => {
    const result = await withLock(lockPath, async () => {
      return 'async-result';
    });
    assert.equal(result, 'async-result');
  });
});
