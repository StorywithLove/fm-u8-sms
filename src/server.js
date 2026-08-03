#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FmU8Client } from './client.js';
import { loadConfig } from './config.js';
import { InboxStore } from './inbox-store.js';

const config = loadConfig();
if (config.webHost !== '127.0.0.1' && config.webHost !== 'localhost') {
  throw new Error(
    'FM_U8_WEB_HOST must remain 127.0.0.1 or localhost to protect SMS privacy.',
  );
}

const webRoot = fileURLToPath(new URL('../web/', import.meta.url));
const client = new FmU8Client(config);
const inbox = new InboxStore(config.inboxFile);
await inbox.load();

const runtime = {
  connected: false,
  lastSyncAt: null,
  lastError: null,
  device: null,
};
let lastDeviceUnread = null;
let nextReconcileAt = 0;
let activeSync = null;

function securityHeaders() {
  return {
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; " +
      "img-src 'self' data:; connect-src 'self'; object-src 'none'; " +
      "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': 'no-store',
  };
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(value)}\n`);
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, securityHeaders());
  response.end();
}

function isTrustedRequest(request) {
  const host = String(request.headers.host || '').toLowerCase();
  const allowedHosts = new Set([
    `127.0.0.1:${config.webPort}`,
    `localhost:${config.webPort}`,
  ]);
  if (!allowedHosts.has(host)) return false;

  const origin = request.headers.origin;
  if (
    origin &&
    origin !== `http://127.0.0.1:${config.webPort}` &&
    origin !== `http://localhost:${config.webPort}`
  ) {
    return false;
  }
  return request.headers['sec-fetch-site'] !== 'cross-site';
}

async function synchronize({ forceInbox = false } = {}) {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    try {
      const status = await client.getStatus();
      const unreadChanged = status.smsUnreadLong !== lastDeviceUnread;
      const shouldReadInbox =
        forceInbox || unreadChanged || Date.now() >= nextReconcileAt;
      let added = [];
      if (shouldReadInbox) {
        const result = await client.listInbox();
        added = await inbox.merge(result.messages);
        nextReconcileAt = Date.now() + config.reconcileIntervalMs;
      }

      lastDeviceUnread = status.smsUnreadLong;
      runtime.connected = true;
      runtime.lastSyncAt = new Date().toISOString();
      runtime.lastError = null;
      runtime.device = status;
      return added;
    } catch (error) {
      runtime.connected = false;
      runtime.lastError = error.message;
      throw error;
    } finally {
      activeSync = null;
    }
  })();
  return activeSync;
}

async function handleApi(request, response, url) {
  if (!isTrustedRequest(request)) {
    return sendJson(response, 403, { error: 'Local same-origin access only.' });
  }

  if (request.method === 'GET' && url.pathname === '/api/overview') {
    return sendJson(response, 200, {
      runtime,
      inbox: inbox.summary(),
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/messages') {
    return sendJson(response, 200, {
      ...inbox.summary(),
      messages: inbox.list(),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/sync') {
    try {
      const added = await synchronize({ forceInbox: true });
      return sendJson(response, 200, {
        added: added.length,
        overview: { runtime, inbox: inbox.summary() },
      });
    } catch (error) {
      return sendJson(response, 503, { error: error.message });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/messages/read-all') {
    const changed = await inbox.markAllRead();
    return sendJson(response, 200, { changed, inbox: inbox.summary() });
  }

  const readMatch = url.pathname.match(/^\/api\/messages\/([a-f0-9]{64})\/read$/);
  if (request.method === 'POST' && readMatch) {
    const found = await inbox.markRead(readMatch[1]);
    return found
      ? sendJson(response, 200, { ok: true, inbox: inbox.summary() })
      : sendJson(response, 404, { error: 'Message not found.' });
  }

  return sendJson(response, 404, { error: 'Not found.' });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
};

async function serveStatic(response, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safeRelative = normalize(relative).replace(/^([.][.][/\\])+/, '');
  if (safeRelative !== relative || !['index.html', 'styles.css', 'app.js'].includes(relative)) {
    return sendJson(response, 404, { error: 'Not found.' });
  }

  const path = join(webRoot, safeRelative);
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': mimeTypes[extname(path)] || 'application/octet-stream',
    });
    response.end(body);
  } catch (error) {
    if (error.code === 'ENOENT') return sendJson(response, 404, { error: 'Not found.' });
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      await serveStatic(response, url.pathname);
    } else {
      sendEmpty(response, 405);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${error.stack || error.message}`);
    if (!response.headersSent) sendJson(response, 500, { error: 'Internal error.' });
    else response.end();
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(config.webPort, config.webHost, resolve);
});

console.log(`FM U8 SMS inbox: http://127.0.0.1:${config.webPort}`);
console.log(`Local history: ${config.inboxFile}`);

synchronize({ forceInbox: true }).catch((error) => {
  console.error(`[${new Date().toISOString()}] Initial sync failed: ${error.message}`);
});
const pollTimer = setInterval(() => {
  synchronize().catch((error) => {
    console.error(`[${new Date().toISOString()}] Sync failed: ${error.message}`);
  });
}, config.pollIntervalMs);

function shutdown() {
  clearInterval(pollTimer);
  server.close(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
