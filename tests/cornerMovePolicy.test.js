/**
 * tests/cornerMovePolicy.test.js
 * node tests/cornerMovePolicy.test.js
 *
 * scenes/cornerMovePolicy.js — DOM'suz, saf deterministik köşe-hamlesi
 * politikası. Enjekte edilen sahte `isLegalMove` yükümleriyle Node'da
 * izole test edilir.
 */

import { pickDeterministicCornerMove, validateCornerCandidateOrder, CORNER_CANDIDATE_ORDER } from '../scenes/cornerMovePolicy.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(a, b, message = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(message);
}

test('boş tahtada tercih edilen ilk köşeyi (sol-üst) seçer', () => {
  const move = pickDeterministicCornerMove({ isLegalMove: () => true, size: 9 });
  equal(move, CORNER_CANDIDATE_ORDER[0]);
  equal(move, { row: 0, col: 0 });
});

test('tercih edilen köşe doluysa bir sonraki köşeye geçer', () => {
  const first = CORNER_CANDIDATE_ORDER[0];
  const move = pickDeterministicCornerMove({
    isLegalMove: (row, col) => !(row === first.row && col === first.col),
    size: 9,
  });
  equal(move, CORNER_CANDIDATE_ORDER[1]);
});

test('aynı yasallık durumu için HER ZAMAN aynı sonucu döner (deterministik)', () => {
  const isLegalMove = (row, col) => row > 0 || col > 0; // sol-üst köşe kapalı
  const a = pickDeterministicCornerMove({ isLegalMove, size: 9 });
  const b = pickDeterministicCornerMove({ isLegalMove, size: 9 });
  equal(a, b);
  equal(a, { row: 0, col: 8 });
});

test('dört köşe de doluyken tam tarama fallback\'ine düşer', () => {
  const closedCorners = new Set(CORNER_CANDIDATE_ORDER.map(c => `${c.row},${c.col}`));
  const isLegalMove = (row, col) => !closedCorners.has(`${row},${col}`);
  const move = pickDeterministicCornerMove({ isLegalMove, size: 9 });
  ok(move, 'fallback bir sonuç döndürmeli');
  ok(!closedCorners.has(`${move.row},${move.col}`), 'fallback bir köşeyi tekrar seçmemeli');
});

test('hiçbir nokta yasal değilse null döner (çökme yok)', () => {
  const move = pickDeterministicCornerMove({ isLegalMove: () => false, size: 9 });
  equal(move, null);
});

test('validateCornerCandidateOrder: dört köşe de geçerli 9×9 koordinatları', () => {
  const result = validateCornerCandidateOrder(9);
  ok(result.valid, `beklenmeyen nedenler: ${result.reasons.join(', ')}`);
  equal(result.reasons, []);
});

test('validateCornerCandidateOrder: daha küçük bir size için köşelerin bir kısmı sınır dışı raporlanır', () => {
  const result = validateCornerCandidateOrder(3);
  ok(!result.valid);
  ok(result.reasons.length > 0);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
