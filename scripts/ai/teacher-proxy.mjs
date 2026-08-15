/**
 * scripts/ai/teacher-proxy.mjs
 *
 * Teacher Assistant v0.3 — yerel geliştirme proxy'si.
 *
 * Bu repo tarayıcı-tabanlı (statik dosyalar, `npm run serve`). Anthropic
 * API anahtarını doğrudan tarayıcı bundle'ına gömmek güvenlik açığıdır.
 * Bu küçük Node sunucusu SADECE localhost'ta çalışır, gerçek Anthropic
 * çağrısını ve API anahtarını server tarafında tutar; tarayıcıdaki
 * core/claudeTeacherProvider.js yalnızca yapılandırılmış context'i buraya
 * POST eder ve bir öğretmen mesajı metni geri alır — anahtarı asla görmez.
 *
 * Kullanım:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/ai/teacher-proxy.mjs
 *
 * Büyük bir backend değil — tek endpoint, framework yok (yalnız Node'un
 * yerleşik http/fetch'i), yalnız 127.0.0.1'e bağlanır.
 */

import http from 'node:http';
import { TEACHER_SYSTEM_PROMPT } from '../../core/teacherSystemPrompt.js';

const PORT = Number(process.env.TEACHER_PROXY_PORT || 8787);
const HOST = '127.0.0.1'; // yalnızca localhost — dışarıya açılmaz
const MODEL = process.env.TEACHER_PROXY_MODEL || 'claude-haiku-4-5-20251001';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Yalnızca yerel statik sunucunun (`npm run serve`, port 3000) origin'lerine
// izin ver — açık bir "*" CORS politikası bilinçli olarak kullanılmıyor.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function withCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function callClaude(context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, error: 'ANTHROPIC_API_KEY tanımlı değil (proxy ortam değişkeni).' };
  }

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: TEACHER_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: JSON.stringify(context) },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: 502, error: `Anthropic API hatası (${res.status}): ${text.slice(0, 300)}` };
  }

  const data = await res.json();
  const text = data?.content?.find(block => block.type === 'text')?.text;
  if (typeof text !== 'string') {
    return { ok: false, status: 502, error: 'Anthropic yanıtında metin bloğu bulunamadı.' };
  }
  return { ok: true, message: text };
}

const server = http.createServer(async (req, res) => {
  withCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, hasApiKey: !!process.env.ANTHROPIC_API_KEY });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/ai-teacher') {
    let parsedBody;
    try {
      parsedBody = JSON.parse(await readBody(req) || '{}');
    } catch {
      sendJson(res, 400, { error: 'Geçersiz JSON gövdesi.' });
      return;
    }

    if (!parsedBody || typeof parsedBody !== 'object' || !parsedBody.context) {
      sendJson(res, 400, { error: '"context" alanı zorunlu.' });
      return;
    }

    try {
      const result = await callClaude(parsedBody.context);
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, 200, { message: result.message });
    } catch (err) {
      sendJson(res, 502, { error: err?.message || 'Bilinmeyen proxy hatası.' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Bulunamadı.' });
});

server.listen(PORT, HOST, () => {
  console.log(`Teacher Assistant proxy: http://${HOST}:${PORT} (model: ${MODEL})`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('UYARI: ANTHROPIC_API_KEY tanımlı değil — /api/ai-teacher çağrıları 500 dönecek.');
  }
});
