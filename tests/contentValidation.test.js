/**
 * tests/contentValidation.test.js
 * node tests/contentValidation.test.js
 *
 * core/contentValidation.js — RAG v0.6 içerik entry doğrulaması. Geçersiz
 * bir entry retrieval'i ASLA bozmamalı — bu testler doğrulama kurallarının
 * her birini ve toplu (validateContentSet) davranışı kapsar.
 */

import { validateContentEntry, validateContentSet, CONTENT_PURPOSES, CONTENT_STUDENT_STATUSES } from '../core/contentValidation.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function validEntry(overrides = {}) {
  return {
    id: 'liberty-hint-01',
    concept: 'liberty',
    stage: 'guided_practice',
    purpose: 'hint',
    text: 'Taşın yatay ve dikey komşularına odaklan.',
    ...overrides,
  };
}

// ── validateContentEntry ────────────────────────────────────────────

test('geçerli entry kabul edilir', () => {
  const r = validateContentEntry(validEntry());
  ok(r.valid, JSON.stringify(r));
});

test('geçerli entry + opsiyonel studentStatus/priority/tags kabul edilir', () => {
  const r = validateContentEntry(validEntry({ studentStatus: ['learning'], priority: 5, tags: ['x'] }));
  ok(r.valid);
});

test('geçersiz concept reddedilir', () => {
  const r = validateContentEntry(validEntry({ concept: 'ko' }));
  equal(r.valid, false);
  equal(r.reason, 'INVALID_CONCEPT');
});

test('geçersiz purpose reddedilir', () => {
  const r = validateContentEntry(validEntry({ purpose: 'lecture' }));
  equal(r.valid, false);
  equal(r.reason, 'INVALID_PURPOSE');
});

test('boş text reddedilir', () => {
  const r = validateContentEntry(validEntry({ text: '' }));
  equal(r.valid, false);
  equal(r.reason, 'EMPTY_TEXT');
});

test('yalnız boşluktan oluşan text reddedilir', () => {
  const r = validateContentEntry(validEntry({ text: '   ' }));
  equal(r.valid, false);
  equal(r.reason, 'EMPTY_TEXT');
});

test('aşırı uzun text reddedilir', () => {
  const r = validateContentEntry(validEntry({ text: 'x'.repeat(500) }));
  equal(r.valid, false);
  equal(r.reason, 'TEXT_TOO_LONG');
});

test('geçersiz studentStatus reddedilir', () => {
  const r = validateContentEntry(validEntry({ studentStatus: ['confused'] }));
  equal(r.valid, false);
  equal(r.reason, 'INVALID_STUDENT_STATUS');
});

test('studentStatus dizi değilse reddedilir', () => {
  const r = validateContentEntry(validEntry({ studentStatus: 'learning' }));
  equal(r.valid, false);
  equal(r.reason, 'INVALID_STUDENT_STATUS');
});

test('id eksikse reddedilir', () => {
  const r = validateContentEntry(validEntry({ id: undefined }));
  equal(r.valid, false);
  equal(r.reason, 'MISSING_ID');
});

test('geçersiz stage reddedilir', () => {
  const r = validateContentEntry(validEntry({ stage: 'freeplay' }));
  equal(r.valid, false);
  equal(r.reason, 'INVALID_STAGE');
});

test('null/obje-olmayan entry reddedilir', () => {
  equal(validateContentEntry(null).valid, false);
  equal(validateContentEntry('metin').valid, false);
  equal(validateContentEntry([1, 2]).valid, false);
});

// ── validateContentSet ──────────────────────────────────────────────

test('duplicate id tespit edilir, ikinci kopya invalid listesine düşer', () => {
  const set = [validEntry({ id: 'a' }), validEntry({ id: 'a', text: 'farklı metin' })];
  const result = validateContentSet(set);
  equal(result.valid.length, 1);
  equal(result.duplicateIds.length, 1);
  equal(result.duplicateIds[0], 'a');
  ok(result.invalid.some(i => i.id === 'a' && i.reason === 'DUPLICATE_ID'));
});

test('geçersiz entry\'ler valid listesine hiç girmez, invalid\'e neden bilgisiyle düşer', () => {
  const set = [validEntry({ id: 'ok' }), { id: 'bad', concept: 'ko', stage: 'guided_practice', purpose: 'hint', text: 'x' }];
  const result = validateContentSet(set);
  equal(result.valid.length, 1);
  equal(result.invalid.length, 1);
  equal(result.invalid[0].id, 'bad');
  equal(result.invalid[0].reason, 'INVALID_CONCEPT');
});

test('boş/geçersiz dizi güvenle boş sonuç döner', () => {
  equal(validateContentSet([]).valid.length, 0);
  equal(validateContentSet(null).valid.length, 0);
});

test('CONTENT_PURPOSES ve CONTENT_STUDENT_STATUSES beklenen enum\'ları taşır', () => {
  equal(CONTENT_PURPOSES.length, 4);
  for (const p of ['explain', 'hint', 'reinforce', 'confirm']) ok(CONTENT_PURPOSES.includes(p));
  equal(CONTENT_STUDENT_STATUSES.length, 4);
  for (const s of ['not_started', 'learning', 'provisional', 'mastered']) ok(CONTENT_STUDENT_STATUSES.includes(s));
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
