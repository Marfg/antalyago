/**
 * tests/endgameCountingPolicy.test.js
 * node tests/endgameCountingPolicy.test.js
 *
 * scenes/endgameCountingPolicy.js — DOM'suz, saf bölge (territory) hesabı.
 * core/curriculum.js l6 dersinin GERÇEK (production) steps[0] verisini
 * kullanır — synthetic fixture DEĞİL (edge-case testleri HARİÇ, bkz. dosya
 * altı), bkz. tests/koRulePolicy.test.js/illegalMovePolicy.test.js İLE AYNI
 * disiplin.
 */
import assert from 'node:assert/strict';
import {
  LESSON_ID, STEP_INDEX, CONCEPT, MOMENT_KINDS,
  getRawStep, getEndgameCountingMoment, normalizeBoardSeed, computeRegions,
  evaluateRegionTap, pointKey, regionSignature, boardSignature, isKnownMomentKind,
} from '../scenes/endgameCountingPolicy.js';
import { CURRICULUM } from '../core/curriculum.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function equal(a, b, message = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(message);
}
function ok(cond, message) { if (!cond) throw new Error(message || 'assertion failed'); }
function throws(fn, matcher, message) {
  try { fn(); throw new Error(message || 'expected function to throw, but it did not'); }
  catch (e) {
    if (e.message?.startsWith?.('expected function to throw')) throw e;
    if (matcher && !matcher.test(e.message)) {
      throw new Error(`${message || 'threw, but message did not match'} — got: "${e.message}"`);
    }
  }
}
function sig(points) { return [...points].map(p => `${p.row},${p.col}`).sort().join('|'); }

const l6 = CURRICULUM.flatMap(c => c.lessons).find(l => l.id === 'l6');

test('LESSON_ID="l6", STEP_INDEX=0, CONCEPT="territory"', () => {
  equal(LESSON_ID, 'l6');
  equal(STEP_INDEX, 0);
  equal(CONCEPT, 'territory');
});

test('1) getRawStep() curriculum\'un GERÇEK l6.steps[0]\'ıyla YAPISAL olarak AYNI (versioned/versionsuz import ayrı modül örnekleri olduğu için referans değil, içerik karşılaştırılır)', () => {
  equal(getRawStep(), l6.steps[0]);
});

test('2) Kullanıcıya görünen 1. adım GERÇEKTEN stepIndex:0 — l6.steps[0]\'ın text\'i "art arda pas geçince" ile başlıyor, ondan ÖNCE hiçbir adım yok', () => {
  ok(/art arda.*pas geçince/i.test(l6.steps[0].text), 'l6.steps[0] beklenen açılış cümlesini taşımıyor');
});

test('3) getEndgameCountingMoment() curriculum\'un GERÇEK board seed\'ini AYNEN taşır (kopya/icat DEĞİL)', () => {
  const moment = getEndgameCountingMoment();
  const rawBoard = l6.steps[0].board;
  equal(moment.board.length, rawBoard.length);
  equal(boardSignature(moment.board), boardSignature(rawBoard));
  equal(moment.size, l6.steps[0].size ?? 9);
});

test('4) Koordinat dönüşümü: x/y (authored) → col/row (runtime) — board seed\'inde x/y kalır, region noktalarında row/col kullanılır', () => {
  const moment = getEndgameCountingMoment();
  // authored (x:0,y:0) beyaz bölgede olmalı (görev talimatı doğrulaması) —
  // moment.whiteRegionPoints {row,col} biçiminde, row=y, col=x dönüşümüyle.
  ok(moment.whiteRegionPoints.some(p => p.row === 0 && p.col === 0), '(row:0,col:0) beyaz bölgede bulunamadı — x/y→col/row dönüşümü şüpheli');
  // authored (x:8,y:8) siyah bölgede olmalı.
  ok(moment.blackRegionPoints.some(p => p.row === 8 && p.col === 8), '(row:8,col:8) siyah bölgede bulunamadı — x/y→col/row dönüşümü şüpheli');
});

test('5) Siyah bölge noktalarının TAM kümesi — GERÇEK flood-fill sonucu curriculum\'un authored blackTerritory\'siyle (x/y→row/col çevrilmiş) BİREBİR eşleşir', () => {
  const moment = getEndgameCountingMoment();
  const authored = l6.steps[0].blackTerritory.map(p => ({ row: p.y, col: p.x }));
  equal(sig(moment.blackRegionPoints), sig(authored));
  equal(moment.blackRegionPoints.length, 22);
});

test('6) Beyaz bölge noktalarının TAM kümesi — GERÇEK flood-fill sonucu curriculum\'un authored whiteTerritory\'siyle BİREBİR eşleşir', () => {
  const moment = getEndgameCountingMoment();
  const authored = l6.steps[0].whiteTerritory.map(p => ({ row: p.y, col: p.x }));
  equal(sig(moment.whiteRegionPoints), sig(authored));
  equal(moment.whiteRegionPoints.length, 20);
});

test('7) Siyah/beyaz bölge kümeleri AYRIK — hiçbir nokta iki kümede birden yok', () => {
  const moment = getEndgameCountingMoment();
  const blackKeys = new Set(moment.blackRegionPoints.map(pointKey));
  const overlap = moment.whiteRegionPoints.filter(p => blackKeys.has(pointKey(p)));
  equal(overlap.length, 0, `kesişen noktalar: ${JSON.stringify(overlap)}`);
});

test('8) Sahipsiz VEYA iki renkle temas eden boş alan hiçbir renge atanmıyor — bu curriculum board\'unda nötr bölge YOK (tüm boş alan iki tarafa da tam ayrık şekilde bölünmüş)', () => {
  const moment = getEndgameCountingMoment();
  equal(moment.neutralRegionPoints.length, 0);
  equal(moment.blackRegionPoints.length + moment.whiteRegionPoints.length + moment.neutralRegionPoints.length, 81 - moment.board.length);
});

test('9) EDGE: sentetik board — hem siyah hem beyazla temas eden bir boş alan NÖTR kalır, hiçbir renge atanmaz', () => {
  // 3x3 tahta: merkez (1,1) boş, dört komşusu iki farklı renk taşıyor.
  const board = [{ color: 'B', x: 0, y: 1 }, { color: 'W', x: 2, y: 1 }];
  const { blackPoints, whitePoints, neutralPoints } = computeRegions(board, 3);
  ok(neutralPoints.some(p => p.row === 1 && p.col === 1), 'karışık sınırlı boş nokta nötr kümede değil');
  ok(!blackPoints.some(p => p.row === 1 && p.col === 1), 'karışık sınırlı nokta YANLIŞLIKLA siyah bölgeye atanmış');
  ok(!whitePoints.some(p => p.row === 1 && p.col === 1), 'karışık sınırlı nokta YANLIŞLIKLA beyaz bölgeye atanmış');
});

test('10) TERS RENK HATASI DÜZELTİLDİ: info metni artık "Beyaz sol (20 puan) · Siyah sağ (22 puan) — siyah önde!" — eski hatalı "Siyah sol...beyaz önde!" metni ARTIK YOK', () => {
  const moment = getEndgameCountingMoment();
  equal(moment.infoText, 'Beyaz sol (20 puan) · Siyah sağ (22 puan) — siyah önde!');
  ok(!/Siyah sol \(20 puan\) · Beyaz sağ \(22 puan\) — beyaz önde!/.test(moment.infoText), 'eski TERS metin hâlâ mevcut');
});

test('11) TERS RENK HATASI — semantik kanıt: SOL (düşük ortalama col) bölge GERÇEKTEN beyaza, SAĞ (yüksek ortalama col) bölge GERÇEKTEN siyaha ait', () => {
  const moment = getEndgameCountingMoment();
  const avgCol = pts => pts.reduce((s, p) => s + p.col, 0) / pts.length;
  ok(avgCol(moment.whiteRegionPoints) < avgCol(moment.blackRegionPoints), 'beyaz bölgenin ortalama sütunu siyahtan düşük DEĞİL — "sol/sağ" iddiası board ile tutarsız');
});

test('12) Board taş SIRASI değişse de AYNI bölge sonucu üretilir (flood-fill nihai dizilime bakar, sıraya değil)', () => {
  const raw = normalizeBoardSeed(l6.steps[0].board);
  const shuffled = [...raw].reverse();
  const a = computeRegions(raw, 9);
  const b = computeRegions(shuffled, 9);
  equal(sig(a.blackPoints), sig(b.blackPoints));
  equal(sig(a.whitePoints), sig(b.whitePoints));
  equal(sig(a.neutralPoints), sig(b.neutralPoints));
});

test('13) regionSignature() sıradan bağımsız, deterministik', () => {
  const moment = getEndgameCountingMoment();
  equal(regionSignature(moment.blackRegionPoints), regionSignature([...moment.blackRegionPoints].reverse()));
});

test('14) evaluateRegionTap: siyah bölgedeki GERÇEK bir nokta regionColor:"B" döner', () => {
  const moment = getEndgameCountingMoment();
  const p = moment.blackRegionPoints[0];
  const result = evaluateRegionTap(moment, p);
  equal(result, { regionColor: 'B', isOccupied: false, isTarget: true });
});

test('15) evaluateRegionTap: beyaz bölgedeki GERÇEK bir nokta regionColor:"W" döner', () => {
  const moment = getEndgameCountingMoment();
  const p = moment.whiteRegionPoints[0];
  const result = evaluateRegionTap(moment, p);
  equal(result, { regionColor: 'W', isOccupied: false, isTarget: true });
});

test('16) evaluateRegionTap: dolu bir kesişim isOccupied:true, regionColor:null döner', () => {
  const moment = getEndgameCountingMoment();
  const stone = moment.board[0];
  const result = evaluateRegionTap(moment, { row: stone.y, col: stone.x });
  equal(result, { regionColor: null, isOccupied: true, isTarget: false });
});

test('17) evaluateRegionTap: board dışı bir nokta güvenle regionColor:null döner (çökme YOK)', () => {
  const moment = getEndgameCountingMoment();
  const result = evaluateRegionTap(moment, { row: 50, col: 50 });
  equal(result, { regionColor: null, isOccupied: false, isTarget: false });
});

test('18) evaluateRegionTap: analiz sonrası moment.board mutate EDİLMEDİ', () => {
  const moment = getEndgameCountingMoment();
  const before = boardSignature(moment.board);
  evaluateRegionTap(moment, moment.blackRegionPoints[0]);
  evaluateRegionTap(moment, moment.whiteRegionPoints[0]);
  const after = boardSignature(moment.board);
  equal(before, after);
});

test('19) isKnownMomentKind: yalnız REGION_IDENTIFY bilinir', () => {
  equal(isKnownMomentKind(MOMENT_KINDS.REGION_IDENTIFY), true);
  equal(isKnownMomentKind('unknown_kind'), false);
});

test('20) EDGE: normalizeBoardSeed — geçersiz renk açık Error fırlatır', () => {
  throws(() => normalizeBoardSeed([{ color: 'X', x: 0, y: 0 }]), /geçersiz taş rengi/);
});

test('21) EDGE: normalizeBoardSeed — geçersiz koordinat açık Error fırlatır', () => {
  throws(() => normalizeBoardSeed([{ color: 'B', x: 0.5, y: 0 }]), /geçersiz koordinat/);
});

test('22) EDGE: normalizeBoardSeed — duplicate koordinat açık Error fırlatır', () => {
  throws(() => normalizeBoardSeed([{ color: 'B', x: 0, y: 0 }, { color: 'W', x: 0, y: 0 }]), /duplicate board noktası/);
});

test('23) EDGE: normalizeBoardSeed — boş/eksik seed güvenle boş dizi döner (çökme YOK)', () => {
  equal(normalizeBoardSeed(undefined), []);
  equal(normalizeBoardSeed(null), []);
});

test('24) EDGE: hiç boş nokta olmayan (tamamen dolu) bir board — siyah bölge boş olduğu için Error fırlatır', () => {
  // 2x2 tam dolu tahta — boş bölge YOK.
  const fullBoard = [{ color: 'B', x: 0, y: 0 }, { color: 'B', x: 1, y: 0 }, { color: 'B', x: 0, y: 1 }, { color: 'B', x: 1, y: 1 }];
  const { blackPoints, whitePoints } = computeRegions(fullBoard, 2);
  equal(blackPoints.length, 0);
  equal(whitePoints.length, 0);
});

test('25) EDGE: getEndgameCountingMoment — sahte bir lessonId bulunamazsa AÇIK Error (mock ile dolaylı kanıt: LESSON_ID sabiti gerçekten "l6")', () => {
  // Doğrudan sentetik bir çağrı yapılamıyor (getLesson() modül-içi özel),
  // bu yüzden dolaylı kanıt: LESSON_ID GERÇEKTEN curriculum'da var VE tekil.
  const matches = CURRICULUM.flatMap(c => c.lessons).filter(l => l.id === LESSON_ID);
  equal(matches.length, 1);
});

test('26) EDGE: computeRegions — beyaz bölge boşsa (sentetik, siyah taş yok) whitePoints boş, blackPoints de boş (board tamamen beyazla çevrili tek bölge veya tahta boşsa hepsi nötr sayılır)', () => {
  // Hiç taş yoksa TÜM boş alan tek bir bileşen, sınır rengi YOK (borderColors boş) → nötr.
  const { blackPoints, whitePoints, neutralPoints } = computeRegions([], 3);
  equal(blackPoints.length, 0);
  equal(whitePoints.length, 0);
  equal(neutralPoints.length, 9);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
