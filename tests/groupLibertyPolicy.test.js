/**
 * tests/groupLibertyPolicy.test.js
 * node tests/groupLibertyPolicy.test.js
 *
 * scenes/groupLibertyPolicy.js — DOM'suz, saf hedef/başarı politikası.
 * Sahne #4 ("Grubun Nefesi") ve teacher-studio.html Diagnostics'in AYNI
 * kaynağı kullandığını, curriculum'un l2.steps[2] üç-taşlı örneğinden
 * doğru hedefleri türettiğini ve RuleEngine'in bu hedefler üzerinde
 * gerçekten 1/4 → 2/6 → 3/8 nefes sonucunu ürettiğini doğrular.
 */

import {
  getCurriculumGroupSeed, getAnchor, getConnectionTargets, totalConnectionsRequired,
  getNextTarget, isSequenceComplete, isExpectedNextTarget, matchesCurriculumSeed,
} from '../scenes/groupLibertyPolicy.js';
import { BoardState } from '../core/boardState.js';
import { getGroup, getLiberties } from '../core/ruleEngine.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function equal(a, b, message = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(message);
}
function ok(cond, message) { if (!cond) throw new Error(message || 'assertion failed'); }

test('getCurriculumGroupSeed() curriculum l2.steps[2] board seed\'ini {row,col} olarak döner (x=col,y=row)', () => {
  const seed = getCurriculumGroupSeed();
  equal(seed, [{ row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 }]);
});

test('getAnchor() curriculum seed\'inin ilk noktasıdır', () => {
  equal(getAnchor(), { row: 4, col: 3 });
});

test('getConnectionTargets() sıralı iki hedefi döner', () => {
  equal(getConnectionTargets(), [{ row: 4, col: 4 }, { row: 4, col: 5 }]);
});

test('totalConnectionsRequired() 2 döner', () => {
  equal(totalConnectionsRequired(), 2);
});

test('getNextTarget(0)=(4,4), getNextTarget(1)=(4,5), getNextTarget(2)=null', () => {
  equal(getNextTarget(0), { row: 4, col: 4 });
  equal(getNextTarget(1), { row: 4, col: 5 });
  equal(getNextTarget(2), null);
});

test('isSequenceComplete() yalnız connectionsMade>=2 iken true döner', () => {
  ok(!isSequenceComplete(0), 'connectionsMade=0 iken tamamlanmış SAYILMAMALI');
  ok(!isSequenceComplete(1), 'connectionsMade=1 iken tamamlanmış SAYILMAMALI');
  ok(isSequenceComplete(2), 'connectionsMade=2 iken tamamlanmış olmalı');
});

test('isExpectedNextTarget() yalnız DOĞRU sıradaki hedefi kabul eder — L-biçimi/hedef dışı nokta REDDEDİLİR', () => {
  ok(isExpectedNextTarget(0, { row: 4, col: 4 }), 'connectionsMade=0 iken (4,4) kabul edilmeli');
  ok(!isExpectedNextTarget(0, { row: 4, col: 5 }), 'connectionsMade=0 iken (4,5) henüz kabul EDİLMEMELİ (sıra dışı)');
  ok(!isExpectedNextTarget(0, { row: 3, col: 3 }), 'çapanın başka bir komşusu (L-biçimi adayı) kabul EDİLMEMELİ');
  ok(isExpectedNextTarget(1, { row: 4, col: 5 }), 'connectionsMade=1 iken (4,5) kabul edilmeli');
  ok(!isExpectedNextTarget(1, { row: 3, col: 4 }), 'connectionsMade=1 iken L-biçimi oluşturacak (3,4) REDDEDİLMELİ');
  ok(!isExpectedNextTarget(2, { row: 4, col: 4 }), 'sekans tamamlandıktan sonra hiçbir nokta hedef DEĞİLDİR');
});

test('matchesCurriculumSeed() yalnız TAM curriculum seed\'iyle (sıra bağımsız) eşleşir', () => {
  ok(matchesCurriculumSeed([{ row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 }]), 'doğrusal tam eşleşme kabul edilmeli');
  ok(matchesCurriculumSeed([{ row: 4, col: 5 }, { row: 4, col: 3 }, { row: 4, col: 4 }]), 'sıra bağımsız eşleşme kabul edilmeli');
  ok(!matchesCurriculumSeed([{ row: 4, col: 3 }, { row: 4, col: 4 }]), 'eksik nokta sayısı REDDEDİLMELİ');
  // L-biçimi: (4,3),(4,4) yatay + (3,4) (4,4)'ün kuzeyi — 3 taş, tek grup, ama curriculum'un DOĞRUSAL örneği DEĞİL.
  ok(!matchesCurriculumSeed([{ row: 4, col: 3 }, { row: 4, col: 4 }, { row: 3, col: 4 }]), 'L-biçimi (3 taş, tek grup) curriculum seed\'iyle EŞLEŞMEMELİ');
});

test('RuleEngine çapraz-doğrulaması: çapa TEK BAŞINA groupSize=1/liberty=4', () => {
  const anchor = getAnchor();
  const board = new BoardState(9);
  board.placeStone(anchor.col, anchor.row, 'black');
  const group = getGroup(board, anchor.col, anchor.row);
  const libs = getLiberties(board, group);
  equal(group.size, 1);
  equal(libs.size, 4);
});

test('RuleEngine çapraz-doğrulaması: İLK bağlantı sonrası groupSize=2/GERÇEK liberty=6 (naif 4+4=8 TOPLAMI DEĞİL)', () => {
  const anchor = getAnchor();
  const [first] = getConnectionTargets();
  const board = new BoardState(9);
  board.placeStone(anchor.col, anchor.row, 'black');
  board.placeStone(first.col, first.row, 'black');
  const group = getGroup(board, anchor.col, anchor.row);
  const libs = getLiberties(board, group);
  equal(group.size, 2);
  equal(libs.size, 6);
});

test('RuleEngine çapraz-doğrulaması: nihai (2.) bağlantı sonrası groupSize=3/GERÇEK liberty=8 — curriculum\'un KENDİ iddiasıyla (l2.steps[2]) birebir', () => {
  const [anchor, first, second] = getCurriculumGroupSeed();
  const board = new BoardState(9);
  board.placeStone(anchor.col, anchor.row, 'black');
  board.placeStone(first.col, first.row, 'black');
  board.placeStone(second.col, second.row, 'black');
  const group = getGroup(board, anchor.col, anchor.row);
  const libs = getLiberties(board, group);
  equal(group.size, 3);
  equal(libs.size, 8);
});

test('RuleEngine çapraz-doğrulaması: L-biçimi (aynı 3 taş sayısı, aynı tek grup) FARKLI bir liberty sonucu (7) üretir — bu yüzden groupSize===3 TEK BAŞINA yeterli DEĞİLDİR', () => {
  const anchor = getAnchor(); // (4,3)
  const first = getConnectionTargets()[0]; // (4,4)
  const lShapePoint = { row: 3, col: 4 }; // (4,4)'ün kuzeyi — L-biçimi
  const board = new BoardState(9);
  board.placeStone(anchor.col, anchor.row, 'black');
  board.placeStone(first.col, first.row, 'black');
  board.placeStone(lShapePoint.col, lShapePoint.row, 'black');
  const group = getGroup(board, anchor.col, anchor.row);
  const libs = getLiberties(board, group);
  equal(group.size, 3, 'L-biçimi de 3 taşlık TEK bir grup oluşturur');
  ok(libs.size !== 8, `L-biçiminin liberty sonucu curriculum'un doğrusal örneğiyle (8) AYNI OLMAMALI, bulunan: ${libs.size}`);
  ok(!matchesCurriculumSeed([anchor, first, lShapePoint]), 've policy bu board\'u curriculum seed\'iyle eşleşmiyor olarak işaretlemeli');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
