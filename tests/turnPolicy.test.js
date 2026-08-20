/**
 * tests/turnPolicy.test.js
 * node tests/turnPolicy.test.js
 *
 * scenes/turnPolicy.js — DOM'suz, saf deterministik beyaz-hamle policy'si.
 * Enjekte edilen sahte `isLegalMove` yükümleriyle Node'da izole test edilir.
 */

import { pickDeterministicWhiteMove, validateCandidateOrder, WHITE_CANDIDATE_ORDER } from '../scenes/turnPolicy.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(a, b, message = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(message);
}

test('boş tahtada ilk adayı (öncelik listesinin başı) seçer', () => {
  const move = pickDeterministicWhiteMove({ isLegalMove: () => true, size: 9 });
  equal(move, WHITE_CANDIDATE_ORDER[0]);
});

test('ilk aday yasal değilse bir sonraki adaya geçer', () => {
  const first = WHITE_CANDIDATE_ORDER[0];
  const move = pickDeterministicWhiteMove({
    isLegalMove: (row, col) => !(row === first.row && col === first.col),
    size: 9,
  });
  ok(move && !(move.row === first.row && move.col === first.col));
  equal(move, WHITE_CANDIDATE_ORDER[1]);
});

test('aynı yasallık durumu için HER ZAMAN aynı sonucu döner (deterministik/tekrarlanabilir)', () => {
  const isLegalMove = (row, col) => (row + col) % 2 === 0;
  const a = pickDeterministicWhiteMove({ isLegalMove, size: 9 });
  const b = pickDeterministicWhiteMove({ isLegalMove, size: 9 });
  equal(a, b);
});

test('tüm öncelik adayları doluyken tam tarama fallback\'ine düşer ve yasal bir nokta bulur', () => {
  const occupied = new Set(WHITE_CANDIDATE_ORDER.map(c => `${c.row},${c.col}`));
  const isLegalMove = (row, col) => !occupied.has(`${row},${col}`);
  const move = pickDeterministicWhiteMove({ isLegalMove, size: 9 });
  ok(move, 'fallback bir sonuç döndürmeli');
  ok(!occupied.has(`${move.row},${move.col}`), 'fallback sonucu dolu bir adayı seçmemeli');
});

test('hiçbir nokta yasal değilse null döner (çökme yok)', () => {
  const move = pickDeterministicWhiteMove({ isLegalMove: () => false, size: 9 });
  equal(move, null);
});

test('9×9 sınırının dışındaki adaylar (size küçültülürse) atlanır', () => {
  const move = pickDeterministicWhiteMove({ isLegalMove: () => true, size: 4 });
  ok(move.row < 4 && move.col < 4, 'seçilen nokta size sınırının içinde olmalı');
});

test('döndürülen obje yalnızca {row,col} alanları içerir — fazladan alan yok', () => {
  const move = pickDeterministicWhiteMove({ isLegalMove: () => true, size: 9 });
  equal(Object.keys(move).sort(), ['col', 'row']);
});

test('validateCandidateOrder: tüm adaylar geçerli 9×9 tamsayı koordinatları', () => {
  const result = validateCandidateOrder(9);
  ok(result.valid, `beklenmeyen nedenler: ${result.reasons.join(', ')}`);
  equal(result.reasons, []);
});

test('validateCandidateOrder: daha küçük bir size için adayların bir kısmı sınır dışı raporlanır', () => {
  const result = validateCandidateOrder(3);
  ok(!result.valid);
  ok(result.reasons.length > 0);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
