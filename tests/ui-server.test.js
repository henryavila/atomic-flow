import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer } from '../src/ui-server.js';

let serverInfo;

describe('ui-server', () => {
  before(async () => {
    serverInfo = await startServer({ port: 0, host: '127.0.0.1' });
  });

  after(() => {
    stopServer();
  });

  it('startServer() returns { url, port } with valid http url', () => {
    assert.ok(serverInfo.url, 'should have url');
    assert.ok(serverInfo.port, 'should have port');
    assert.ok(serverInfo.url.startsWith('http://'), 'url should start with http://');
    assert.equal(typeof serverInfo.port, 'number', 'port should be a number');
  });

  it('GET /api/features returns 200 with JSON array', async () => {
    const res = await fetch(`${serverInfo.url}/api/features`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/json'));
    const body = await res.json();
    assert.ok(Array.isArray(body), 'body should be an array');
  });

  it('GET /api/feature/999 returns 404 JSON error for nonexistent feature', async () => {
    const res = await fetch(`${serverInfo.url}/api/feature/999`);
    assert.equal(res.status, 404);
    assert.ok(res.headers.get('content-type').includes('application/json'));
    const body = await res.json();
    assert.ok(body.error, 'should have error field');
  });

  it('GET / returns 200 with HTML content-type', async () => {
    const res = await fetch(`${serverInfo.url}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));
  });

  it('GET /nonexistent-route returns 404', async () => {
    const res = await fetch(`${serverInfo.url}/nonexistent-route`);
    assert.equal(res.status, 404);
  });
});
