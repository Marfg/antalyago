import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStudioServer } from '../studio/server/server.mjs';
import { createDocument } from '../studio/model/studioDocument.js';
import { resolveDocumentPath } from '../studio/server/pathPolicy.mjs';

let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(val, msg = 'assertion failed') { if (!val) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ── Test sunucusu ─────────────────────────────────────────────────────
async function startServer() {
  const workspace = await fsp.mkdtemp(path.join(os.tmpdir(), 'studio-test-'));
  const { server, csrfToken } = createStudioServer({ workspaceDir: workspace });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  async function req(method, urlPath, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, base);
      const isWrite = method === 'POST' || method === 'PUT';
      const headers = { Host: `127.0.0.1:${port}` };
      if (isWrite) {
        headers['X-Studio-Token'] = csrfToken;
        headers['Content-Type'] = 'application/json';
      }
      Object.assign(headers, extraHeaders); // extraHeaders token'ı geçersiz kılabilir
      const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
      if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

      const r = http.request({ hostname: '127.0.0.1', port, path: url.pathname + url.search, method, headers }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.status ?? res.statusCode, headers: res.headers, data: json });
        });
      });
      r.on('error', reject);
      if (bodyStr) r.write(bodyStr);
      r.end();
    });
  }

  async function cleanup() {
    server.close();
    await fsp.rm(workspace, { recursive: true, force: true });
  }

  return { req, port, base, csrfToken, workspace, cleanup };
}

// ══════════════════════════════════════════════════════════════════════
// Bölüm 1: pathPolicy.mjs birim testleri
// HTTP sunucusu başlamadan önce çalışır — saf fonksiyon testleri.
// ══════════════════════════════════════════════════════════════════════
console.log('\n─── pathPolicy birim testleri ───\n');

const TMP_WS = path.join(os.tmpdir(), 'pp-unit-test');

await test('geçerli ID → workspace içinde dosya yolu döner', () => {
  const r = resolveDocumentPath('abc-def', TMP_WS);
  ok(r !== null, 'null dönmemeli');
  ok(r.startsWith(TMP_WS + path.sep), `workspace dışında: ${r}`);
  ok(r.endsWith('abc-def.studio.json'), `yanlış dosya adı: ${r}`);
});

await test('../ traversal → null', () => {
  ok(resolveDocumentPath('../outside', TMP_WS) === null);
});

await test('..%2F URL kodlu traversal → null', () => {
  ok(resolveDocumentPath('..%2Foutside', TMP_WS) === null);
});

await test('mutlak yol ID → null', () => {
  // path.resolve ile absolute path oluşsa bile SAFE_ID_RE engeller
  ok(resolveDocumentPath('/etc/passwd', TMP_WS) === null);
});

await test('eğik çizgi içeren ID → null', () => {
  ok(resolveDocumentPath('a/b', TMP_WS) === null);
});

await test('ters eğik çizgi içeren ID → null', () => {
  ok(resolveDocumentPath('a\\b', TMP_WS) === null);
});

await test('null byte içeren ID → null', () => {
  ok(resolveDocumentPath('a\x00b', TMP_WS) === null);
  ok(resolveDocumentPath('a%00b', TMP_WS) === null);
});

await test('büyük harf içeren ID → null', () => {
  ok(resolveDocumentPath('ABC', TMP_WS) === null);
  ok(resolveDocumentPath('Abc-def', TMP_WS) === null);
});

await test('nokta içeren ID → null', () => {
  ok(resolveDocumentPath('a.b', TMP_WS) === null);
  ok(resolveDocumentPath('../etc/passwd', TMP_WS) === null);
});

await test('ardışık tire içeren ID → null', () => {
  ok(resolveDocumentPath('a--b', TMP_WS) === null);
});

await test('boş ID → null', () => {
  ok(resolveDocumentPath('', TMP_WS) === null);
  ok(resolveDocumentPath(null, TMP_WS) === null);
  ok(resolveDocumentPath(undefined, TMP_WS) === null);
});

// Ortak önek kardeş dizin: path.relative() kontrolünün amacını gösterir.
// SAFE_ID_RE zaten '/' içeren ID'leri reddeder; bu test path.relative mantığını
// doğrudan kanıtlar: workspace ve workspace-evil için relative '../...' döner.
await test('path.relative() ortak önek kardeş dizini reddeder', () => {
  const workspace    = path.join(os.tmpdir(), 'ab-workspace');
  const sibling      = path.join(os.tmpdir(), 'ab-workspace-evil', 'x.studio.json');
  const rel          = path.relative(workspace, sibling);
  ok(rel.startsWith('..'), `Kardeş dizin '..' ile başlamalı, alınan: "${rel}"`);
  // resolveDocumentPath bu durumu SAFE_ID_RE ile çok önce yakalar;
  // path.relative katmanı gelecekteki gevşemeler için son savunmadır.
});

await test('geçerli ID workspace dışına çıkmaz (isSafeRelative)', () => {
  const r = resolveDocumentPath('valid-id', TMP_WS);
  ok(r !== null);
  const rel = path.relative(TMP_WS, r);
  ok(!rel.startsWith('..'), `relative '..' ile başladı: "${rel}"`);
  ok(!path.isAbsolute(rel), `relative mutlak yol döndü: "${rel}"`);
  ok(rel.length > 0, 'relative boş döndü (hedef = base)');
});

console.log('\n─── studio-server.test.js ───\n');

let ctx;
try { ctx = await startServer(); } catch (e) { console.error('Sunucu başlatılamadı:', e.message); process.exit(1); }
const { req, port, csrfToken, cleanup } = ctx;

const FIXED = { now: new Date('2026-01-01T00:00:00.000Z') };

// ── Temel bağlantı ────────────────────────────────────────────────────
await test('yalnız 127.0.0.1 üzerinde dinliyor', () => {
  ok(ctx.base.startsWith('http://127.0.0.1:'), 'loopback değil');
});

await test('GET /api/health → 200', async () => {
  const r = await req('GET', '/api/health');
  eq(r.status, 200);
  ok(r.data.ok);
});

await test('GET /api/token → token döner', async () => {
  const r = await req('GET', '/api/token');
  eq(r.status, 200);
  eq(r.data.token, csrfToken);
});

await test('GET /api/schema → JSON Schema döner', async () => {
  const r = await req('GET', '/api/schema');
  eq(r.status, 200);
  ok(r.data.$schema || r.data.title);
});

// ── Belge CRUD ─────────────────────────────────────────────────────────
const testDoc = createDocument({ id: 'test-crud-1', title: 'CRUD Testi' }, FIXED);

await test('GET /api/documents → boş liste', async () => {
  const r = await req('GET', '/api/documents');
  eq(r.status, 200);
  ok(Array.isArray(r.data.documents));
  eq(r.data.documents.length, 0);
});

await test('POST /api/documents → belge oluşturur', async () => {
  const r = await req('POST', '/api/documents', testDoc);
  eq(r.status, 201);
  ok(r.data.ok);
  eq(r.data.id, 'test-crud-1');
});

await test('GET /api/documents → listeye eklendi', async () => {
  const r = await req('GET', '/api/documents');
  ok(r.data.documents.some(d => d.id === 'test-crud-1'));
});

await test('GET /api/documents/:id → belge döner', async () => {
  const r = await req('GET', '/api/documents/test-crud-1');
  eq(r.status, 200);
  eq(r.data.id, 'test-crud-1');
  eq(r.data.title, 'CRUD Testi');
});

await test('PUT /api/documents/:id → günceller', async () => {
  const updated = { ...testDoc, title: 'Güncel Başlık' };
  const r = await req('PUT', '/api/documents/test-crud-1', updated);
  eq(r.status, 200);
  ok(r.data.ok);
  const get = await req('GET', '/api/documents/test-crud-1');
  eq(get.data.title, 'Güncel Başlık');
});

await test('POST /api/documents → var olan ID → 409', async () => {
  const r = await req('POST', '/api/documents', testDoc);
  eq(r.status, 409);
  ok(r.data.error.includes('zaten var') || r.data.error.includes('409') || r.data.error.includes('conflict') || r.data.error.length > 0);
});

await test('GET /api/documents/:id → olmayan → 404', async () => {
  const r = await req('GET', '/api/documents/no-such-doc');
  eq(r.status, 404);
});

// ── Doğrulama endpoint ────────────────────────────────────────────────
await test('POST /api/validate → geçerli belge', async () => {
  const r = await req('POST', '/api/validate', testDoc);
  eq(r.status, 200);
  ok(r.data.valid);
  ok(r.data.canSaveDraft);
  ok(Array.isArray(r.data.errors));
});

await test('POST /api/validate → hatalı belge', async () => {
  const r = await req('POST', '/api/validate', { studioVersion: '1.0.0', title: '', board: { size: 7, turn: 'black', stones: [] } });
  eq(r.status, 200);
  ok(!r.data.valid);
  ok(r.data.errors.length > 0);
});

// ── PUT ID uyuşmazlığı ────────────────────────────────────────────────
await test('PUT ID uyuşmazlığı → 422', async () => {
  const r = await req('PUT', '/api/documents/test-crud-1', { ...testDoc, id: 'baska-id' });
  eq(r.status, 422);
});

// ── Güvenlik testleri ─────────────────────────────────────────────────
await test('geçersiz CSRF token → 403', async () => {
  const r = await req('POST', '/api/validate', testDoc, { 'X-Studio-Token': 'yanlis-token' });
  eq(r.status, 403);
});

await test('Content-Type eksik → 415', async () => {
  const body = JSON.stringify(testDoc);
  const r = await new Promise((resolve, reject) => {
    const headers = {
      Host: `127.0.0.1:${port}`,
      'X-Studio-Token': csrfToken,
      'Content-Length': Buffer.byteLength(body),
    };
    const request = http.request({ hostname: '127.0.0.1', port, path: '/api/validate', method: 'POST', headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
  eq(r.status, 415);
});

await test('path traversal → 404 veya 403', async () => {
  const r = await req('GET', '/api/documents/..%2F..%2Fetc%2Fpasswd');
  ok(r.status === 404 || r.status === 403, `beklenen 404 veya 403, alınan ${r.status}`);
});

await test('path separator içeren ID → 404 veya 403', async () => {
  const r = await req('GET', '/api/documents/a%2Fb');
  ok(r.status === 404 || r.status === 403);
});

await test('null byte içeren ID → 404 veya 403', async () => {
  const r = await req('GET', '/api/documents/a%00b');
  ok(r.status === 404 || r.status === 403);
});

await test('büyük harf içeren ID → 404 (izin verilmez)', async () => {
  const r = await req('GET', '/api/documents/ABC');
  ok(r.status === 404 || r.status === 403);
});

// ── Statik dosya güvenliği ────────────────────────────────────────────
await test('workspace belgesi statik URL\'den erişilemiyor', async () => {
  const r = await req('GET', '/studio/workspace/test-crud-1.studio.json');
  ok(r.status === 404 || r.status === 403);
});

await test('studio/index.html statik olarak erişilebilir', async () => {
  const r = await req('GET', '/studio/index.html');
  ok(r.status === 200 || r.status === 304, `${r.status}`);
});

// ── HTTP yöntemi kısıtlamaları ────────────────────────────────────────
await test('DELETE → 405', async () => {
  const r = await req('DELETE', '/api/documents/test-crud-1');
  eq(r.status, 405);
});

await test('OPTIONS → 405', async () => {
  const r = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: '/api/health', method: 'OPTIONS', headers: { Host: `127.0.0.1:${port}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    request.on('error', reject);
    request.end();
  });
  eq(r.status, 405);
});

// ── Geçersiz Host ─────────────────────────────────────────────────────
await test('geçersiz Host başlığı → 403', async () => {
  const r = await new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: '127.0.0.1', port, path: '/api/health', method: 'GET', headers: { Host: 'evil.com' } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode })); }
    );
    request.on('error', reject);
    request.end();
  });
  eq(r.status, 403);
});

// ── Güvenlik başlıkları ───────────────────────────────────────────────
await test('güvenlik başlıkları mevcut', async () => {
  const r = await req('GET', '/api/health');
  ok(r.headers['cache-control'] === 'no-store', 'Cache-Control eksik');
  ok(r.headers['x-content-type-options'] === 'nosniff', 'X-Content-Type-Options eksik');
  ok(r.headers['x-frame-options'] === 'DENY', 'X-Frame-Options eksik');
});

// ── Atomik yazma: yedek oluştu mu ─────────────────────────────────────
await test('güncelleme yedek dosyası oluşturur', async () => {
  const updated = { ...testDoc, title: 'Yedek Testi' };
  await req('PUT', '/api/documents/test-crud-1', updated);
  const files = await fsp.readdir(ctx.workspace);
  const bakFiles = files.filter(f => f.includes('.bak.'));
  ok(bakFiles.length > 0, 'Yedek dosyası oluşmadı');
});

// ── Temizlik ──────────────────────────────────────────────────────────
await cleanup();

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
