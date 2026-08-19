/**
 * tests/contentOverrides.test.js
 * node tests/contentOverrides.test.js
 *
 * core/contentOverrides.js — Base + Local Override → Effective Content.
 * Bu testlerin asıl amacı: geçersiz bir override'ın ASLA effective listeye
 * sızmadığını ve override'ların yalnızca HEDEFLENEN content ID'sini
 * etkilediğini kanıtlamak.
 */

import { applyOverride, mergeContentOverrides, OVERRIDABLE_FIELDS } from '../core/contentOverrides.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function baseEntry(overrides = {}) {
  return {
    id: 'liberty-hint-01',
    concept: 'liberty',
    stage: 'guided_practice',
    purpose: 'hint',
    studentStatus: ['learning'],
    priority: 5,
    text: 'Taşın yatay ve dikey komşularına odaklan.',
    ...overrides,
  };
}

// ── applyOverride ─────────────────────────────────────────────────────

test('base entry doğru okunur (override yoksa aynen döner)', () => {
  const base = baseEntry();
  const { entry, applied } = applyOverride(base, null);
  equal(applied, false);
  equal(entry, base);
});

test('geçerli override merge edilir (yalnız belirtilen alanlar değişir)', () => {
  const base = baseEntry();
  const { entry, applied, invalidReason } = applyOverride(base, { text: 'Yeni metin.', priority: 15 });
  ok(applied);
  equal(invalidReason, null);
  equal(entry.text, 'Yeni metin.');
  equal(entry.priority, 15);
  equal(entry.concept, 'liberty', 'concept değişmemeli (read-only alan)');
  equal(entry.id, 'liberty-hint-01', 'id değişmemeli (read-only alan)');
});

test('id/concept override\'a verilse bile YOK SAYILIR (OVERRIDABLE_FIELDS dışı)', () => {
  const base = baseEntry();
  const { entry } = applyOverride(base, { id: 'sahte-id', concept: 'capture', text: 'x' });
  equal(entry.id, 'liberty-hint-01');
  equal(entry.concept, 'liberty');
});

test('invalid override (boş text) KAYDEDİLMEZ — base entry\'ye düşer', () => {
  const base = baseEntry();
  const { entry, applied, invalidReason } = applyOverride(base, { text: '' });
  equal(applied, false);
  equal(invalidReason, 'EMPTY_TEXT');
  equal(entry, base, 'base entry DEĞİŞMEDEN dönmeli');
});

test('invalid override (geçersiz studentStatus) KAYDEDİLMEZ', () => {
  const base = baseEntry();
  const { entry, applied, invalidReason } = applyOverride(base, { studentStatus: ['confused'] });
  equal(applied, false);
  equal(invalidReason, 'INVALID_STUDENT_STATUS');
  equal(entry, base);
});

test('OVERRIDABLE_FIELDS beklenen 4 alanı taşır', () => {
  equal(OVERRIDABLE_FIELDS.length, 4);
  for (const f of ['text', 'priority', 'studentStatus', 'tags']) ok(OVERRIDABLE_FIELDS.includes(f));
});

// ── mergeContentOverrides ────────────────────────────────────────────

test('override map boşsa tüm entry\'ler source:"base" ile aynen döner', () => {
  const entries = [baseEntry({ id: 'a' }), baseEntry({ id: 'b' })];
  const merged = mergeContentOverrides(entries, {});
  equal(merged.length, 2);
  ok(merged.every(e => e.source === 'base'));
});

test('override yalnız HEDEFLENEN content ID\'yi etkiler, diğerleri değişmez', () => {
  const entries = [baseEntry({ id: 'liberty-hint-01', text: 'orijinal-1' }), baseEntry({ id: 'liberty-hint-02', text: 'orijinal-2' })];
  const merged = mergeContentOverrides(entries, { 'liberty-hint-01': { text: 'değişti' } });
  const a = merged.find(e => e.id === 'liberty-hint-01');
  const b = merged.find(e => e.id === 'liberty-hint-02');
  equal(a.text, 'değişti');
  equal(a.source, 'override');
  equal(b.text, 'orijinal-2', 'diğer content ID ETKİLENMEMELİ');
  equal(b.source, 'base');
});

test('reset (override kaldırılması) base\'e döndürür', () => {
  const entries = [baseEntry({ id: 'x', text: 'orijinal' })];
  const overridden = mergeContentOverrides(entries, { x: { text: 'değişti' } });
  equal(overridden[0].text, 'değişti');
  const reset = mergeContentOverrides(entries, {}); // override map'ten kaldırıldı
  equal(reset[0].text, 'orijinal');
  equal(reset[0].source, 'base');
});

test('geçersiz bir override effective listeye HİÇ sızmaz (base\'e düşer)', () => {
  const entries = [baseEntry({ id: 'x' })];
  const merged = mergeContentOverrides(entries, { x: { text: '' } }); // geçersiz
  equal(merged[0].source, 'base');
  equal(merged[0].text, 'Taşın yatay ve dikey komşularına odaklan.');
});

test('base\'te olmayan bir id için override sessizce yok sayılır (silinmiş entry kalıntısı)', () => {
  const entries = [baseEntry({ id: 'x' })];
  const merged = mergeContentOverrides(entries, { 'olmayan-id': { text: 'x' } });
  equal(merged.length, 1);
  equal(merged[0].id, 'x');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
