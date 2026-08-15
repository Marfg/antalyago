/**
 * tests/teacherResponseSchema.test.js
 * node tests/teacherResponseSchema.test.js
 *
 * core/teacherResponseSchema.js — LLM cevabını doğrudan UI'a basmadan
 * önceki doğrulama/temizleme katmanı.
 */

import { validateTeacherResponse, parseTeacherResponse } from '../core/teacherResponseSchema.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Geçerli response ────────────────────────────────────────────────

test('geçerli "say" response kabul edilir', () => {
  const r = validateTeacherResponse({ action: 'say', message: 'Harika, doğru buldun!' });
  ok(r.valid);
  equal(r.value.action, 'say');
  equal(r.value.message, 'Harika, doğru buldun!');
  equal(r.value.hintLevel, null);
});

test('geçerli "give_hint" response + hintLevel kabul edilir', () => {
  const r = validateTeacherResponse({ action: 'give_hint', message: 'Kalan nefes noktasını bul.', hintLevel: 2 });
  ok(r.valid);
  equal(r.value.hintLevel, 2);
});

test('mesajdaki baş/son boşluklar temizlenir', () => {
  const r = validateTeacherResponse({ action: 'say', message: '  Merhaba  ' });
  ok(r.valid);
  equal(r.value.message, 'Merhaba');
});

// ── Geçersiz response ───────────────────────────────────────────────

test('bilinmeyen action reddedilir', () => {
  const r = validateTeacherResponse({ action: 'move_stone', message: 'x' });
  equal(r.valid, false);
  equal(r.reason, 'INVALID_ACTION');
});

test('action eksikse reddedilir', () => {
  const r = validateTeacherResponse({ message: 'x' });
  equal(r.valid, false);
  equal(r.reason, 'INVALID_ACTION');
});

test('boş message reddedilir', () => {
  const r = validateTeacherResponse({ action: 'say', message: '' });
  equal(r.valid, false);
  equal(r.reason, 'EMPTY_MESSAGE');
});

test('yalnız boşluklardan oluşan message reddedilir', () => {
  const r = validateTeacherResponse({ action: 'say', message: '   ' });
  equal(r.valid, false);
  equal(r.reason, 'EMPTY_MESSAGE');
});

test('message string değilse reddedilir', () => {
  const r = validateTeacherResponse({ action: 'say', message: 42 });
  equal(r.valid, false);
  equal(r.reason, 'MESSAGE_NOT_STRING');
});

test('aşırı uzun message reddedilir', () => {
  const r = validateTeacherResponse({ action: 'say', message: 'x'.repeat(500) });
  equal(r.valid, false);
  equal(r.reason, 'MESSAGE_TOO_LONG');
});

test('geçersiz hintLevel (aralık dışı) reddedilir', () => {
  const r = validateTeacherResponse({ action: 'give_hint', message: 'x', hintLevel: 9 });
  equal(r.valid, false);
  equal(r.reason, 'INVALID_HINT_LEVEL');
});

test('geçersiz hintLevel (tam sayı değil) reddedilir', () => {
  const r = validateTeacherResponse({ action: 'give_hint', message: 'x', hintLevel: 1.5 });
  equal(r.valid, false);
  equal(r.reason, 'INVALID_HINT_LEVEL');
});

test('null/obje-olmayan response reddedilir', () => {
  equal(validateTeacherResponse(null).valid, false);
  equal(validateTeacherResponse('metin').valid, false);
  equal(validateTeacherResponse([1, 2]).valid, false);
});

// ── parseTeacherResponse (JSON string) ─────────────────────────────

test('geçerli JSON string doğru parse edilir', () => {
  const r = parseTeacherResponse('{"action":"say","message":"Merhaba"}');
  ok(r.valid);
  equal(r.value.message, 'Merhaba');
});

test('bozuk JSON → INVALID_JSON (fallback tetikleyici)', () => {
  const r = parseTeacherResponse('bu geçerli bir json değil {{{');
  equal(r.valid, false);
  equal(r.reason, 'INVALID_JSON');
});

test('parseTeacherResponse zaten obje verilirse doğrudan doğrular', () => {
  const r = parseTeacherResponse({ action: 'say', message: 'x' });
  ok(r.valid);
});

// Gerçek Claude API testinde gözlemlendi: sistem promptu "yalnız JSON" dese
// de model bazen ```json ... ``` kod bloğuna sarıyor.
test('```json ... ``` kod bloğuna sarılmış JSON kabul edilir', () => {
  const r = parseTeacherResponse('```json\n{"action":"say","message":"Merhaba"}\n```');
  ok(r.valid, 'kod bloğu soyulmalı: ' + JSON.stringify(r));
  equal(r.value.message, 'Merhaba');
});

test('dil etiketsiz ``` kod bloğu da kabul edilir', () => {
  const r = parseTeacherResponse('```\n{"action":"say","message":"Merhaba"}\n```');
  ok(r.valid);
});

test('kod bloğu İÇİNDE de olsa geçersiz JSON hâlâ INVALID_JSON döner', () => {
  const r = parseTeacherResponse('```json\nbu json değil\n```');
  equal(r.valid, false);
  equal(r.reason, 'INVALID_JSON');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
