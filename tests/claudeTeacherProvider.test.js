/**
 * tests/claudeTeacherProvider.test.js
 * node tests/claudeTeacherProvider.test.js
 *
 * core/claudeTeacherProvider.js — gerçek ağ çağrısı YAPMADAN, enjekte
 * edilmiş bir fetchImpl ile provider sözleşmesinin (core/mockTeacherProvider.js
 * ile AYNI şekil: {ok, raw, error, latencyMs, provider}) her koşulda
 * doğru üretildiğini doğrular.
 */

import { createClaudeTeacherProvider } from '../core/claudeTeacherProvider.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const DUMMY_CONTEXT = { lesson: { id: 'l3' }, student: { attempt: 1 } };

await test('proxy başarılı yanıt verirse → ok:true, raw = message metni', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ message: '{"action":"say","message":"Merhaba"}' }) });
  const provider = createClaudeTeacherProvider({ fetchImpl });
  const r = await provider.generateTeacherResponse(DUMMY_CONTEXT);
  equal(r.ok, true);
  equal(r.raw, '{"action":"say","message":"Merhaba"}');
  equal(r.provider, 'claude');
  equal(typeof r.latencyMs, 'number');
});

await test('proxy HTTP hatası dönerse → ok:false, error HTTP_<status>', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'sunucu hatası' });
  const provider = createClaudeTeacherProvider({ fetchImpl });
  const r = await provider.generateTeacherResponse(DUMMY_CONTEXT);
  equal(r.ok, false);
  equal(r.error, 'HTTP_500');
});

await test('proxy "message" alanı olmayan bir gövde dönerse → MALFORMED_PROXY_RESPONSE', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ notMessage: 'x' }) });
  const provider = createClaudeTeacherProvider({ fetchImpl });
  const r = await provider.generateTeacherResponse(DUMMY_CONTEXT);
  equal(r.ok, false);
  equal(r.error, 'MALFORMED_PROXY_RESPONSE');
});

await test('ağ hatası (fetch reddedilirse) → ok:false, error mesajı taşınır', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const provider = createClaudeTeacherProvider({ fetchImpl });
  const r = await provider.generateTeacherResponse(DUMMY_CONTEXT);
  equal(r.ok, false);
  equal(r.error, 'ECONNREFUSED');
});

await test('fetch hiç mevcut değilse (fetchImpl null) → FETCH_UNAVAILABLE', async () => {
  const provider = createClaudeTeacherProvider({ fetchImpl: null });
  const r = await provider.generateTeacherResponse(DUMMY_CONTEXT);
  equal(r.ok, false);
  equal(r.error, 'FETCH_UNAVAILABLE');
});

await test('provider adı "claude", contract mock ile aynı şekli paylaşır', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ message: '{}' }) });
  const provider = createClaudeTeacherProvider({ fetchImpl });
  equal(provider.name, 'claude');
  const r = await provider.generateTeacherResponse(DUMMY_CONTEXT);
  ok('ok' in r && 'raw' in r && 'error' in r && 'latencyMs' in r && 'provider' in r);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
