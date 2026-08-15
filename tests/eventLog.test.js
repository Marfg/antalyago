/**
 * tests/eventLog.test.js
 * node tests/eventLog.test.js
 *
 * core/eventLog.js — saf event normalizasyonu + bellek-içi günlük.
 * localStorage/DOM içermediği için bu test dosyası hiçbir tarayıcı
 * shim'i gerektirmez.
 */

import { createEvent, EventLog } from '../core/eventLog.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const fixedNow = () => new Date('2026-01-01T00:00:00.000Z');

// ── createEvent ───────────────────────────────────────────────────────

test('createEvent: zorunlu alanları doğru üretir', () => {
  const e = createEvent({ type: 'student_board_tap', payload: { x: 4, y: 4 }, sessionId: 's1', lessonId: 'l2', stepId: 'l2:0', now: fixedNow });
  equal(e.type, 'student_board_tap');
  equal(e.ts, '2026-01-01T00:00:00.000Z');
  equal(e.sessionId, 's1');
  equal(e.lessonId, 'l2');
  equal(e.stepId, 'l2:0');
  equal(e.payload.x, 4);
});

test('createEvent: type eksikse/geçersizse açık hata fırlatır', () => {
  let threw = false;
  try { createEvent({ payload: {} }); } catch (err) { threw = /EVENT_LOG_INVALID_TYPE/.test(err.message); }
  ok(threw, 'type olmadan hata bekleniyordu');
});

test('createEvent: payload/lessonId/stepId varsayılanları güvenli', () => {
  const e = createEvent({ type: 'lesson_started', now: fixedNow });
  ok(e.payload && typeof e.payload === 'object');
  equal(e.lessonId, null);
  equal(e.stepId, null);
  equal(e.sessionId, null);
});

// ── EventLog ──────────────────────────────────────────────────────────

test('EventLog: append normalize eder ve sessionId\'i otomatik atar', () => {
  const log = new EventLog({ sessionId: 'fixed-session', now: fixedNow });
  const e = log.append({ type: 'lesson_started', lessonId: 'l2' });
  equal(e.sessionId, 'fixed-session');
  equal(log.size, 1);
});

test('EventLog: sessionId verilmezse otomatik ve tutarlı üretilir', () => {
  const log = new EventLog({ now: fixedNow });
  ok(typeof log.sessionId === 'string' && log.sessionId.length > 0);
  const a = log.append({ type: 'a' });
  const b = log.append({ type: 'b' });
  equal(a.sessionId, log.sessionId);
  equal(b.sessionId, log.sessionId);
});

test('EventLog: getAll sıralı kopya döner, iç diziyi mutasyona açmaz', () => {
  const log = new EventLog({ now: fixedNow });
  log.append({ type: 'a' });
  log.append({ type: 'b' });
  const all = log.getAll();
  equal(all.length, 2);
  all.push({ type: 'sahte' });
  equal(log.size, 2, 'dış push iç günlüğü etkilememeli');
});

test('EventLog: clear günlüğü boşaltır', () => {
  const log = new EventLog({ now: fixedNow });
  log.append({ type: 'a' });
  log.clear();
  equal(log.size, 0);
});

test('EventLog: toJSON getAll ile aynı içeriği döner', () => {
  const log = new EventLog({ now: fixedNow });
  log.append({ type: 'a' });
  equal(JSON.stringify(log.toJSON()), JSON.stringify(log.getAll()));
});

test('EventLog: restore geçerli event dizisini geri yükler', () => {
  const log = new EventLog({ now: fixedNow });
  log.restore([{ type: 'lesson_started', ts: 'x', sessionId: 's', lessonId: 'l2', stepId: 'l2:0', payload: {} }]);
  equal(log.size, 1);
  equal(log.getAll()[0].type, 'lesson_started');
});

test('EventLog: restore geçersiz/type\'sız öğeleri sessizce filtreler', () => {
  const log = new EventLog({ now: fixedNow });
  log.restore([{ type: 'ok' }, { no_type: true }, null, 'string-degil', 42]);
  equal(log.size, 1);
});

test('EventLog: restore Array olmayan girdide dokunmaz', () => {
  const log = new EventLog({ now: fixedNow });
  log.append({ type: 'a' });
  log.restore(null);
  log.restore(undefined);
  log.restore({});
  equal(log.size, 1, 'geçersiz restore girdisi mevcut event\'leri silmemeli');
});

test('EventLog: localStorage/DOM\'a hiç dokunmaz (globalThis.localStorage tanımsız olsa da çalışır)', () => {
  ok(typeof globalThis.localStorage === 'undefined', 'ön koşul: bu test dosyasında localStorage shim yok');
  const log = new EventLog({ now: fixedNow });
  log.append({ type: 'a' });
  log.clear();
  // Hata fırlatmadan buraya ulaşması, modülün I/O'suz olduğunun kanıtı.
  ok(true);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
