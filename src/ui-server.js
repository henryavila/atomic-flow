import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getAllFeatures, getFeature } from './db.js';
import { exportStatus } from './export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = join(__dirname, 'ui');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

const PLACEHOLDER_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Atomic Flow</title></head>
<body><h1>Atomic Flow</h1><p>UI files not yet installed. Run tasks T21–T23 to generate them.</p></body>
</html>`;

let server = null;

export async function startServer(opts = {}) {
  const { port: preferredPort = 3741, host = '0.0.0.0' } = opts;
  let retried = false;

  return new Promise((resolve, reject) => {
    const httpServer = createServer(async (req, res) => {
      try {
        await handleRequest(req, res);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && !retried) {
        retried = true;
        httpServer.listen(preferredPort + 1, host);
      } else {
        reject(err);
      }
    });

    httpServer.on('listening', () => {
      const addr = httpServer.address();
      server = httpServer;
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      const url = `http://${displayHost}:${addr.port}`;
      resolve({ url, port: addr.port, server: httpServer });
    });

    httpServer.listen(preferredPort, host);
  });
}

export function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // API routes
  if (path === '/api/features') {
    return apiFeatures(req, res);
  }

  const featureMatch = path.match(/^\/api\/feature\/(\d+)$/);
  if (featureMatch) {
    return apiFeature(req, res, parseInt(featureMatch[1]));
  }

  // Page routes — serve HTML files or placeholder
  if (path === '/' || path === '/dashboard') {
    return serveHtml(res, 'dashboard.html');
  }

  if (path.match(/^\/feature\/\d+$/)) {
    return serveHtml(res, 'feature.html');
  }

  // Static files from ui/ directory
  const staticPath = path.replace(/^\//, '');
  if (staticPath && existsSync(join(UI_DIR, staticPath))) {
    return serveFile(res, staticPath);
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

async function apiFeatures(req, res) {
  let db;
  try {
    db = await openDb();
    const features = getAllFeatures(db);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(features));
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('[]');
  } finally {
    if (db) db.close();
  }
}

async function apiFeature(req, res, id) {
  let db;
  try {
    db = await openDb();
    const feature = getFeature(db, id);
    if (!feature) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Feature ${id} not found` }));
      return;
    }
    const status = exportStatus(db, id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  } finally {
    if (db) db.close();
  }
}

/**
 * Serve an HTML page — falls back to placeholder if file doesn't exist yet.
 */
function serveHtml(res, relativePath) {
  const filePath = join(UI_DIR, relativePath);
  if (existsSync(filePath)) {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(PLACEHOLDER_HTML);
  }
}

/**
 * Serve a static file from the ui/ directory.
 */
function serveFile(res, relativePath) {
  const filePath = join(UI_DIR, relativePath);
  if (!existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
}
