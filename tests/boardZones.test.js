/**
 * tests/boardZones.test.js
 * node tests/boardZones.test.js
 *
 * scenes/boardZones.js — DOM'suz, saf konum sınıflandırması.
 */

import { classifyBoardZone, EXPECTED_LIBERTY_COUNT_BY_ZONE } from '../scenes/boardZones.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function equal(a, b, message = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) {
  if (a !== b) throw new Error(message);
}

const SIZE = 9;

test('dört köşe de "corner" olarak sınıflandırılır', () => {
  equal(classifyBoardZone({ row: 0, col: 0, size: SIZE }), 'corner');
  equal(classifyBoardZone({ row: 0, col: 8, size: SIZE }), 'corner');
  equal(classifyBoardZone({ row: 8, col: 0, size: SIZE }), 'corner');
  equal(classifyBoardZone({ row: 8, col: 8, size: SIZE }), 'corner');
});

test('köşe olmayan kenar noktaları "edge" olarak sınıflandırılır', () => {
  equal(classifyBoardZone({ row: 0, col: 4, size: SIZE }), 'edge');
  equal(classifyBoardZone({ row: 8, col: 4, size: SIZE }), 'edge');
  equal(classifyBoardZone({ row: 4, col: 0, size: SIZE }), 'edge');
  equal(classifyBoardZone({ row: 4, col: 8, size: SIZE }), 'edge');
});

test('tam merkez "interior" olarak sınıflandırılır', () => {
  equal(classifyBoardZone({ row: 4, col: 4, size: SIZE }), 'interior');
});

test('kenara bitişik (1. sıra/sütun) noktalar "interior" sayılır', () => {
  equal(classifyBoardZone({ row: 1, col: 4, size: SIZE }), 'interior');
  equal(classifyBoardZone({ row: 4, col: 1, size: SIZE }), 'interior');
  equal(classifyBoardZone({ row: 7, col: 7, size: SIZE }), 'interior');
});

test('farklı tahta boyutunda (13×13) da doğru sınıflandırır', () => {
  equal(classifyBoardZone({ row: 0, col: 0, size: 13 }), 'corner');
  equal(classifyBoardZone({ row: 0, col: 6, size: 13 }), 'edge');
  equal(classifyBoardZone({ row: 6, col: 6, size: 13 }), 'interior');
});

test('EXPECTED_LIBERTY_COUNT_BY_ZONE pedagojik beklentiyi taşır (yalnız çapraz-doğrulama için)', () => {
  equal(EXPECTED_LIBERTY_COUNT_BY_ZONE.corner, 2);
  equal(EXPECTED_LIBERTY_COUNT_BY_ZONE.edge, 3);
  equal(EXPECTED_LIBERTY_COUNT_BY_ZONE.interior, 4);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
