/**
 * tests/conceptMap.test.js
 * node tests/conceptMap.test.js
 *
 * core/conceptMap.js — Student Model v0.5'in merkezi, genişletilebilir
 * kavram listesi.
 */

import { KNOWN_CONCEPTS, defaultConceptForLesson } from '../core/conceptMap.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

test('KNOWN_CONCEPTS bu milestone kapsamındaki 4 kavramı içerir', () => {
  equal(KNOWN_CONCEPTS.length, 4);
  ok(KNOWN_CONCEPTS.includes('stone_placement'));
  ok(KNOWN_CONCEPTS.includes('liberty'));
  ok(KNOWN_CONCEPTS.includes('atari'));
  ok(KNOWN_CONCEPTS.includes('capture'));
});

test('defaultConceptForLesson: l1→stone_placement, l2→liberty, l3→capture', () => {
  equal(defaultConceptForLesson('l1'), 'stone_placement');
  equal(defaultConceptForLesson('l2'), 'liberty');
  equal(defaultConceptForLesson('l3'), 'capture');
});

test('defaultConceptForLesson: bilinmeyen ders → güvenli varsayılan (stone_placement)', () => {
  equal(defaultConceptForLesson('l99'), 'stone_placement');
  equal(defaultConceptForLesson(null), 'stone_placement');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
