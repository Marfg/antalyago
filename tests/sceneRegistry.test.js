/**
 * tests/sceneRegistry.test.js
 * node tests/sceneRegistry.test.js
 *
 * scenes/sceneRegistry.js — sahne kaydı, tekilleştirme, şekil doğrulaması.
 * DOM/localStorage yok, tamamen saf.
 */

import { createSceneRegistry, validateSceneDefinition } from '../scenes/sceneRegistry.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function fakeScene(overrides = {}) {
  return {
    id: 'scene-x', version: 1, title: 'X',
    curriculumRef: { lessonId: 'l1', concept: 'board' },
    mount() {}, unmount() {}, canComplete() { return false; }, complete() {},
    ...overrides,
  };
}

// ── validateSceneDefinition ────────────────────────────────────────────

test('validateSceneDefinition: tam bir sahne tanımı valid döner', () => {
  const r = validateSceneDefinition(fakeScene());
  equal(r.valid, true);
  equal(r.reasons.length, 0);
});

test('validateSceneDefinition: eksik id MISSING_ID üretir', () => {
  const r = validateSceneDefinition(fakeScene({ id: '' }));
  ok(r.reasons.includes('MISSING_ID'));
});

test('validateSceneDefinition: geçersiz version INVALID_VERSION üretir', () => {
  const r = validateSceneDefinition(fakeScene({ version: 0 }));
  ok(r.reasons.includes('INVALID_VERSION'));
});

test('validateSceneDefinition: eksik curriculumRef.concept MISSING_CURRICULUM_CONCEPT üretir', () => {
  const r = validateSceneDefinition(fakeScene({ curriculumRef: { lessonId: 'l1' } }));
  ok(r.reasons.includes('MISSING_CURRICULUM_CONCEPT'));
});

test('validateSceneDefinition: eksik mount/unmount/canComplete/complete ayrı ayrı raporlanır', () => {
  const r = validateSceneDefinition(fakeScene({ mount: undefined, complete: undefined }));
  ok(r.reasons.includes('MISSING_METHOD_MOUNT'));
  ok(r.reasons.includes('MISSING_METHOD_COMPLETE'));
  ok(!r.reasons.includes('MISSING_METHOD_UNMOUNT'));
});

// ── createSceneRegistry ────────────────────────────────────────────────

test('registry: geçerli tek bir sahneyi kabul eder', () => {
  const reg = createSceneRegistry([fakeScene()]);
  equal(reg.size, 1);
  equal(reg.get('scene-x')?.id, 'scene-x');
  equal(reg.issues.length, 0);
});

test('registry: duplicate ID reddedilir (ilk kayıt kazanır, ikincisi issues\'a düşer)', () => {
  const reg = createSceneRegistry([fakeScene({ title: 'İlk' }), fakeScene({ title: 'İkinci' })]);
  equal(reg.size, 1);
  equal(reg.get('scene-x').title, 'İlk');
  const dup = reg.issues.find(i => i.id === 'scene-x' && i.reasons.includes('DUPLICATE_ID'));
  ok(!!dup, 'duplicate issue raporlanmadı');
});

test('registry: geçersiz (şekli bozuk) bir sahne kayda ASLA girmez, issues\'a düşer', () => {
  const reg = createSceneRegistry([fakeScene({ id: undefined })]);
  equal(reg.size, 0);
  ok(reg.issues.some(i => i.reasons.includes('MISSING_ID')));
});

test('registry: bilinmeyen bir id için get() null döner (güvenli, throw etmez)', () => {
  const reg = createSceneRegistry([fakeScene()]);
  equal(reg.get('bilinmeyen-id'), null);
  equal(reg.has('bilinmeyen-id'), false);
});

test('registry: next() sıradaki sahneyi kayıt sırasına göre çözer', () => {
  const reg = createSceneRegistry([fakeScene({ id: 'a' }), fakeScene({ id: 'b' }), fakeScene({ id: 'c' })]);
  equal(reg.next('a').id, 'b');
  equal(reg.next('b').id, 'c');
});

test('registry: son sahnede next() null döner (güvenli final durum)', () => {
  const reg = createSceneRegistry([fakeScene({ id: 'a' }), fakeScene({ id: 'b' })]);
  equal(reg.next('b'), null);
});

test('registry: yalnız TEK sahne kayıtlıyken next() null döner', () => {
  const reg = createSceneRegistry([fakeScene()]);
  equal(reg.next('scene-x'), null);
});

test('registry: bilinmeyen bir id için next() null döner (throw etmez)', () => {
  const reg = createSceneRegistry([fakeScene()]);
  equal(reg.next('yok-boyle-bir-id'), null);
});

test('registry: açıkça verilmiş nextSceneId, kayıt sırasının ÖNÜNE geçer', () => {
  const reg = createSceneRegistry([fakeScene({ id: 'a', nextSceneId: 'c' }), fakeScene({ id: 'b' }), fakeScene({ id: 'c' })]);
  equal(reg.next('a').id, 'c');
});

test('registry: registry\'de OLMAYAN bir nextSceneId issues\'a düşer', () => {
  const reg = createSceneRegistry([fakeScene({ id: 'a', nextSceneId: 'olmayan-sahne' })]);
  const issue = reg.issues.find(i => i.id === 'a' && i.reasons.some(r => r.startsWith('UNKNOWN_NEXT_SCENE')));
  ok(!!issue, 'eksik next scene raporlanmadı');
});

test('registry: list() kayıt sırasını korur', () => {
  const reg = createSceneRegistry([fakeScene({ id: 'z' }), fakeScene({ id: 'a' })]);
  const ids = reg.list().map(s => s.id);
  equal(ids.join(','), 'z,a');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
