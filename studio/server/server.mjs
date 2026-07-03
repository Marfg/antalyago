import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveStaticPath, WRITE_ROOTS } from './pathPolicy.mjs';
import {
  listDocuments, readDocument, writeDocument, documentExists,
} from './projectStore.mjs';
import { validateDocument, canSaveDraft } from '../model/validation.js';
import { migrateDocument } from '../model/studioDocument.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(DIR, '..', 'schema', 'studio-document.schema.json');
const MAX_BODY = 512 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
};
function mime(fp) { return MIME[path.extname(fp).toLowerCase()] ?? 'application/octet-stream'; }

function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: blob:",
  );
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        const err = new Error('İstek gövdesi çok büyük.');
        err.code = 'BODY_TOO_LARGE';
        reject(err);
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function tryParseJson(text) {
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false }; }
}

function docIdFromPath(pathname) {
  const m = pathname.match(/^\/api\/documents\/([^/]+)$/);
  return m ? m[1] : null;
}

export function createStudioServer(options = {}) {
  const csrfToken = options.csrfToken ?? crypto.randomBytes(24).toString('hex');
  const workspaceDir = options.workspaceDir ?? WRITE_ROOTS.workspace;

  const server = http.createServer(async (req, res) => {
    setSecurityHeaders(res);

    const port = server.address()?.port ?? options._testPort;
    const { method } = req;
    let urlObj;
    try {
      urlObj = new URL(req.url, `http://127.0.0.1:${port}`);
    } catch {
      sendJson(res, 400, { error: 'Geçersiz URL.' });
      return;
    }
    const pathname = urlObj.pathname;

    // Host doğrulama
    const host = req.headers['host'] ?? '';
    const ok127 = host === `127.0.0.1:${port}` || host === '127.0.0.1';
    const okLocalhost = host === `localhost:${port}` || host === 'localhost';
    if (!ok127 && !okLocalhost) {
      sendJson(res, 403, { error: 'Geçersiz Host.' });
      return;
    }

    // Origin doğrulama
    const origin = req.headers['origin'];
    if (origin) {
      const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
      if (!allowed.includes(origin)) {
        sendJson(res, 403, { error: 'Geçersiz Origin.' });
        return;
      }
    }

    // OPTIONS — desteklenmiyor
    if (method === 'OPTIONS') {
      res.writeHead(405, { Allow: 'GET, POST, PUT' });
      res.end();
      return;
    }

    // ── API ────────────────────────────────────────────────────────────
    if (pathname.startsWith('/api/')) {
      if (method === 'POST' || method === 'PUT') {
        if (req.headers['x-studio-token'] !== csrfToken) {
          sendJson(res, 403, { error: 'Geçersiz güvenlik belgesi.' });
          return;
        }
        const ct = req.headers['content-type'] ?? '';
        if (!ct.startsWith('application/json')) {
          sendJson(res, 415, { error: 'Content-Type application/json olmalı.' });
          return;
        }
      }

      if (method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { ok: true, version: '1.0.0' });
        return;
      }

      if (method === 'GET' && pathname === '/api/token') {
        sendJson(res, 200, { token: csrfToken });
        return;
      }

      if (method === 'GET' && pathname === '/api/schema') {
        try {
          const raw = await fsp.readFile(SCHEMA_PATH, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(raw);
        } catch { sendJson(res, 500, { error: 'Şema okunamadı.' }); }
        return;
      }

      if (method === 'GET' && pathname === '/api/documents') {
        const docs = await listDocuments(workspaceDir);
        sendJson(res, 200, { documents: docs });
        return;
      }

      // POST /api/validate
      if (method === 'POST' && pathname === '/api/validate') {
        let body;
        try { body = await readBody(req); }
        catch (e) { sendJson(res, e.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: e.message }); return; }
        const parsed = tryParseJson(body);
        if (!parsed.ok) { sendJson(res, 400, { error: 'JSON ayrıştırılamadı.' }); return; }
        const result = validateDocument(parsed.value);
        sendJson(res, 200, {
          valid: result.valid,
          canSaveDraft: canSaveDraft(result),
          errors: result.errors,
          warnings: result.warnings,
        });
        return;
      }

      // POST /api/documents — yeni belge
      if (method === 'POST' && pathname === '/api/documents') {
        let body;
        try { body = await readBody(req); }
        catch (e) { sendJson(res, e.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: e.message }); return; }
        const parsed = tryParseJson(body);
        if (!parsed.ok) { sendJson(res, 400, { error: 'JSON ayrıştırılamadı.' }); return; }
        const doc = parsed.value;

        if (await documentExists(doc.id, workspaceDir)) {
          sendJson(res, 409, { error: `"${doc.id}" kimliğiyle belge zaten var.` });
          return;
        }

        const migrated = migrateDocument(doc);
        const result = validateDocument(migrated);
        if (!canSaveDraft(result)) {
          sendJson(res, 422, { error: 'Doğrulama hatası.', errors: result.errors, warnings: result.warnings });
          return;
        }
        try {
          await writeDocument(doc.id, migrated, workspaceDir);
          sendJson(res, 201, { ok: true, id: doc.id, warnings: result.warnings });
        } catch { sendJson(res, 500, { error: 'Belge oluşturulamadı.' }); }
        return;
      }

      // /api/documents/:id
      const docId = docIdFromPath(pathname);
      if (docId !== null) {
        if (method === 'GET') {
          const doc = await readDocument(docId, workspaceDir);
          if (!doc) { sendJson(res, 404, { error: 'Belge bulunamadı.' }); return; }
          sendJson(res, 200, doc);
          return;
        }

        if (method === 'PUT') {
          let body;
          try { body = await readBody(req); }
          catch (e) { sendJson(res, e.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: e.message }); return; }
          const parsed = tryParseJson(body);
          if (!parsed.ok) { sendJson(res, 400, { error: 'JSON ayrıştırılamadı.' }); return; }
          const doc = parsed.value;
          if (doc.id !== docId) {
            sendJson(res, 422, { error: 'Belge ID\'si URL ID\'siyle eşleşmiyor.' });
            return;
          }
          const migrated = migrateDocument(doc);
          const result = validateDocument(migrated);
          if (!canSaveDraft(result)) {
            sendJson(res, 422, { error: 'Doğrulama hatası.', errors: result.errors, warnings: result.warnings });
            return;
          }
          try {
            await writeDocument(docId, migrated, workspaceDir);
            sendJson(res, 200, { ok: true, warnings: result.warnings });
          } catch { sendJson(res, 500, { error: 'Belge kaydedilemedi.' }); }
          return;
        }

        res.writeHead(405, { Allow: 'GET, PUT' });
        res.end();
        return;
      }

      sendJson(res, 404, { error: 'API yolu bulunamadı.' });
      return;
    }

    // ── Statik dosyalar ────────────────────────────────────────────────
    if (method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' });
      res.end();
      return;
    }

    const urlPath = pathname === '/' ? '/studio/index.html' : pathname;
    const filePath = resolveStaticPath(urlPath);
    if (!filePath) { sendJson(res, 404, { error: 'Dosya bulunamadı.' }); return; }

    try {
      const data = await fsp.readFile(filePath);
      if (filePath.endsWith('.html')) {
        const injected = data.toString('utf8').replace(
          '</head>',
          `<meta name="studio-token" content="${csrfToken}">\n</head>`,
        );
        res.writeHead(200, { 'Content-Type': mime(filePath) });
        res.end(injected);
      } else {
        res.writeHead(200, { 'Content-Type': mime(filePath) });
        res.end(data);
      }
    } catch { sendJson(res, 404, { error: 'Dosya bulunamadı.' }); }
  });

  return { server, csrfToken };
}

// Doğrudan çalıştırma
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parseInt(process.env.STUDIO_PORT ?? '4319', 10);
  const { server } = createStudioServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`AntalyaGo Problem Stüdyosu: http://127.0.0.1:${server.address().port}`);
  });
  server.on('error', err => {
    console.error('Sunucu hatası:', err.message);
    process.exit(1);
  });
}
