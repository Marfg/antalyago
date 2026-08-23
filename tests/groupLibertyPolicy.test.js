/**
 * tests/groupLibertyPolicy.test.js
 * node tests/groupLibertyPolicy.test.js
 *
 * scenes/groupLibertyPolicy.js — DOM'suz, saf serbest bağlı-grup
 * politikası (v0.17). Eski SIRALI sabit-hedef modelinin (isExpectedNextTarget,
 * matchesCurriculumSeed completion şartı) yerini alan yeni API'yi kapsar:
 * kullanıcı 3-7 taşlık İSTEDİĞİ bağlı şekli kurabilir.
 */

import {
  ANCHOR, getAnchor, getCurriculumGroupSeed, normalizeGroup, shapeSignature,
  getGroupSize, isConnectedSingleGroup, computeGroupLiberties, isSelectableLibertyPoint,
  canAddStone, isAtMax, isCompletable, MIN_GROUP_SIZE, MAX_GROUP_SIZE,
} from '../scenes/groupLibertyPolicy.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function equal(a, b, message = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(message);
}
function ok(cond, message) { if (!cond) throw new Error(message || 'assertion failed'); }

test('MIN_GROUP_SIZE=3, MAX_GROUP_SIZE=7', () => {
  equal(MIN_GROUP_SIZE, 3);
  equal(MAX_GROUP_SIZE, 7);
});

test('getAnchor()/ANCHOR (row:4,col:3) — çapa, kullanıcı akışını KISITLAMAZ', () => {
  equal(ANCHOR, { row: 4, col: 3 });
  equal(getAnchor(), { row: 4, col: 3 });
});

test('getCurriculumGroupSeed() curriculum l2.steps[2]\'nin TARİHSEL doğrusal örneğini döner (yalnız Diagnostics referansı)', () => {
  equal(getCurriculumGroupSeed(), [{ row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 }]);
});

test('normalizeGroup() duplicate koordinatları tekilleştirir, deterministik sıralar', () => {
  const pts = [{ row: 4, col: 4 }, { row: 4, col: 3 }, { row: 4, col: 4 }];
  equal(normalizeGroup(pts), [{ row: 4, col: 3 }, { row: 4, col: 4 }]);
});

test('getGroupSize() duplicate koordinatları saymaz', () => {
  equal(getGroupSize([{ row: 4, col: 3 }, { row: 4, col: 3 }, { row: 4, col: 4 }]), 2);
});

test('shapeSignature() sıra-bağımsız deterministik kimlik üretir', () => {
  const a = [{ row: 4, col: 3 }, { row: 4, col: 4 }];
  const b = [{ row: 4, col: 4 }, { row: 4, col: 3 }];
  equal(shapeSignature(a), shapeSignature(b));
});

/* ── Bağlantı doğrulaması ─────────────────────────────────────────── */

test('tek taş bağlı grup sayılır', () => {
  ok(isConnectedSingleGroup([{ row: 4, col: 3 }]));
});

test('iki bitişik taş tek bağlı grup', () => {
  ok(isConnectedSingleGroup([{ row: 4, col: 3 }, { row: 4, col: 4 }]));
});

test('kopuk taş kümesi tek bağlı grup SAYILMAZ', () => {
  ok(!isConnectedSingleGroup([{ row: 4, col: 3 }, { row: 0, col: 0 }]));
});

test('tahta dışı koordinat geçersiz sayılır', () => {
  ok(!isConnectedSingleGroup([{ row: 4, col: 3 }, { row: -1, col: 3 }]));
  ok(!isConnectedSingleGroup([{ row: 4, col: 3 }, { row: 9, col: 3 }]));
});

test('duplicate koordinat içeren liste yine tek bağlı grup olarak değerlendirilir (tekilleştirilir)', () => {
  ok(isConnectedSingleGroup([{ row: 4, col: 3 }, { row: 4, col: 3 }, { row: 4, col: 4 }]));
});

/* ── Gerçek RuleEngine nefes sonuçları — farklı şekiller ─────────────── */

test('üç düz (doğrusal) taş GERÇEK 8 nefes noktası üretir (curriculum l2.steps[2] ile birebir)', () => {
  const line3 = getCurriculumGroupSeed();
  equal(computeGroupLiberties(line3).length, 8);
});

test('üç L-biçimli taş RuleEngine\'in GERÇEK FARKLI sonucunu üretir (8 DEĞİL)', () => {
  const l3 = [{ row: 4, col: 3 }, { row: 4, col: 4 }, { row: 3, col: 4 }];
  const libs = computeGroupLiberties(l3);
  ok(libs.length !== 8, `L-biçimi doğrusalla AYNI sonucu ÜRETMEMELİ, bulunan: ${libs.length}`);
  equal(libs.length, 7);
});

test('T-biçimi (4 taş, merkez+3 kol) tek bağlı grup ve gerçek nefes sonucu üretir', () => {
  const t4 = [{ row: 4, col: 4 }, { row: 4, col: 3 }, { row: 4, col: 5 }, { row: 3, col: 4 }];
  ok(isConnectedSingleGroup(t4));
  const libs = computeGroupLiberties(t4);
  equal(libs.length, 8);
});

test('referans görsele benzer 5 taşlı dallanan şekil tek bağlı grup ve gerçek (naif toplamdan FARKLI) sonuç üretir', () => {
  const branch5 = [{ row: 4, col: 3 }, { row: 4, col: 4 }, { row: 3, col: 4 }, { row: 5, col: 4 }, { row: 4, col: 2 }];
  ok(isConnectedSingleGroup(branch5));
  const libs = computeGroupLiberties(branch5);
  const naiveSum = branch5.length * 4; // yanlış/naif "taş başına 4" varsayımı
  ok(libs.length < naiveSum, `gerçek sonuç naif toplamdan (${naiveSum}) KÜÇÜK olmalı (paylaşılan komşuluklar), bulunan: ${libs.length}`);
  equal(libs.length, 10);
});

test('zikzak şekil tek bağlı grup sayılır', () => {
  const zigzag = [{ row: 4, col: 3 }, { row: 4, col: 4 }, { row: 5, col: 4 }, { row: 5, col: 5 }];
  ok(isConnectedSingleGroup(zigzag));
});

/* ── Seçilebilirlik / ekleme kuralları ───────────────────────────────── */

test('isSelectableLibertyPoint() yalnız GERÇEK nefes noktalarını kabul eder', () => {
  const anchorOnly = [ANCHOR];
  ok(isSelectableLibertyPoint(anchorOnly, { row: 4, col: 4 })); // doğu
  ok(isSelectableLibertyPoint(anchorOnly, { row: 3, col: 3 })); // kuzey
  ok(isSelectableLibertyPoint(anchorOnly, { row: 5, col: 3 })); // güney
  ok(isSelectableLibertyPoint(anchorOnly, { row: 4, col: 2 })); // batı
  ok(!isSelectableLibertyPoint(anchorOnly, { row: 0, col: 0 }), 'gruba bitişik olmayan uzak nokta REDDEDİLMELİ');
  ok(!isSelectableLibertyPoint(anchorOnly, ANCHOR), 'dolu (çapa) nokta seçilebilir DEĞİLDİR');
});

test('canAddStone() dört yönden HERHANGİ birini kabul eder — sabit tek sıra YOK', () => {
  const anchorOnly = [ANCHOR];
  ok(canAddStone(anchorOnly, { row: 4, col: 4 }));
  ok(canAddStone(anchorOnly, { row: 3, col: 3 }));
  ok(canAddStone(anchorOnly, { row: 5, col: 3 }));
  ok(canAddStone(anchorOnly, { row: 4, col: 2 }));
});

test('canAddStone() gruptan kopuk bir kesişimi REDDEDER', () => {
  ok(!canAddStone([ANCHOR], { row: 8, col: 8 }));
});

test('canAddStone() dolu bir noktayı REDDEDER', () => {
  const twoStones = [ANCHOR, { row: 4, col: 4 }];
  ok(!canAddStone(twoStones, ANCHOR));
  ok(!canAddStone(twoStones, { row: 4, col: 4 }));
});

/* ── 3-7 sınırları ────────────────────────────────────────────────────── */

test('isCompletable() 1-2 taşta false, 3-7 taşta true', () => {
  ok(!isCompletable([ANCHOR]));
  ok(!isCompletable([ANCHOR, { row: 4, col: 4 }]));
  ok(isCompletable(getCurriculumGroupSeed())); // 3 taş
  const seven = Array.from({ length: 7 }, (_, i) => ({ row: 1 + i, col: 3 }));
  ok(isCompletable(seven));
});

test('isAtMax() yalnız 7+ taşta true', () => {
  ok(!isAtMax([ANCHOR]));
  const six = Array.from({ length: 6 }, (_, i) => ({ row: 1 + i, col: 3 }));
  ok(!isAtMax(six));
  const seven = Array.from({ length: 7 }, (_, i) => ({ row: 1 + i, col: 3 }));
  ok(isAtMax(seven));
});

test('sekizinci taş HİÇBİR KOŞULDA eklenemez (canAddStone 7 taşta her zaman false)', () => {
  const seven = Array.from({ length: 7 }, (_, i) => ({ row: 1 + i, col: 3 }));
  const libs = computeGroupLiberties(seven);
  ok(libs.length > 0, 'ön koşul: yedi taşlık grubun hâlâ nefes noktaları olmalı');
  for (const point of libs) {
    ok(!canAddStone(seven, point), `7 taşta HİÇBİR nefes noktası eklenebilir OLMAMALI, bulunan kabul: ${JSON.stringify(point)}`);
  }
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
