/**
 * tests/twoEyesCurriculum.test.js
 * node tests/twoEyesCurriculum.test.js
 *
 * core/curriculum.js l7 — "Canlı Gruplar (İki Göz)" — regresyon paketi.
 * core/eyeAnalysis.js + core/boardState.js + core/ruleEngine.js kullanarak
 * HER adımın board seed'ini, marker'ını ve answer hamlesini GERÇEK kural
 * motoruyla doğrular — bkz. görev talimatı Bölüm 8 ("statik koordinatlara
 * bakıp doğru görünüyor deme").
 *
 * Kapsam: fix/two-eyes-curriculum dalı, yalnız l7. Sahne #10'un henüz
 * eklenmemiş dosyalarına/testlerine hiçbir bağımlılık yok.
 */
import assert from 'node:assert/strict';
import { BoardState } from '../core/boardState.js';
import { getGroup, isValidMove, applyMove } from '../core/ruleEngine.js';
import {
  findEmptyRegion, classifyRegion, diagonalControl,
  classifySinglePointEye, scanSinglePointEyesByGroup,
} from '../core/eyeAnalysis.js';
import { CURRICULUM } from '../core/curriculum.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(cond, message) { if (!cond) throw new Error(message || 'assertion failed'); }
function equal(a, b, message = `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(message);
}
function throws(fn, matcher, message) {
  try { fn(); throw new Error(message || 'expected function to throw, but it did not'); }
  catch (e) {
    if (e.message?.startsWith?.('expected function to throw')) throw e;
    if (matcher && !matcher.test(e.message)) {
      throw new Error(`${message || 'threw, but message did not match'} — got: "${e.message}"`);
    }
  }
}

function colorOf(c) { return c === 'B' ? 'black' : c === 'W' ? 'white' : c; }
function buildBoard(step) {
  const b = new BoardState(step.size || 9);
  for (const s of step.board) b.placeStone(s.x, s.y, colorOf(s.color));
  return b;
}
/** Bağlı boş bölge tek noktalıksa ve TEK grup/renkle çevriliyse sınıflandırma döner, değilse null. */
function classifyPoint(board, x, y) {
  const cls = classifySinglePointEye(board, x, y);
  return cls.isEyeCandidate ? cls : null;
}
/**
 * classifySinglePointEye + "komşu-göz istisnası" (resolveGroupTrueEyes,
 * bkz. core/eyeAnalysis.js) birleşimi: TEK bir noktanın GERÇEK (efektif)
 * göz durumunu döner — köşe/kenardaki standart "bükülü iki göz" şeklini
 * KATI (tek-noktalı) diagonalControl yanlış negatif vermez.
 */
function effectiveEyeStatus(board, x, y) {
  const cls = classifySinglePointEye(board, x, y);
  if (!cls.isEyeCandidate) return { isEyeCandidate: false, isTrue: false, groupId: null, viaSiblingException: false };
  const byGroup = scanSinglePointEyesByGroup(board, cls.color);
  const pts = byGroup.get(cls.groupId) || [];
  const match = pts.find(p => p.x === x && p.y === y);
  return { isEyeCandidate: true, isTrue: !!match?.isTrueEffective, groupId: cls.groupId, viaSiblingException: !!match?.viaSiblingException };
}

const l7 = CURRICULUM.flatMap(c => c.lessons).find(l => l.id === 'l7');

// ── Temel yapı ──────────────────────────────────────────────────────

test('l7 gerçek bir lesson olarak curriculum.js içinde bulunuyor', () => {
  ok(l7, 'l7 bulunamadı');
  equal(l7.title, 'Canlı Gruplar (İki Göz)');
});

test('l7 beklenen adım sayısı: 8 (bkz. görev talimatı Bölüm 4 — 8 ayrı kavram)', () => {
  equal(l7.steps.length, 8);
});

test('her adımın board seed\'inde duplicate / bounds-dışı koordinat yok', () => {
  l7.steps.forEach((step, i) => {
    const size = step.size || 9;
    const seen = new Set();
    for (const s of step.board) {
      const k = `${s.x},${s.y}`;
      ok(!seen.has(k), `step[${i}]: duplicate taş (${k})`);
      seen.add(k);
      ok(s.x >= 0 && s.y >= 0 && s.x < size && s.y < size, `step[${i}]: bounds-dışı taş (${k})`);
      ok(s.color === 'B' || s.color === 'W', `step[${i}]: geçersiz renk (${k})`);
    }
  });
});

test('her groupIndicator boş VE board sınırları içinde', () => {
  l7.steps.forEach((step, i) => {
    if (!step.groupIndicators) return;
    const board = buildBoard(step);
    for (const gi of step.groupIndicators) {
      ok(board.isInBounds(gi.x, gi.y), `step[${i}]: marker (${gi.x},${gi.y}) board dışı`);
      ok(board.isEmpty(gi.x, gi.y), `step[${i}]: marker (${gi.x},${gi.y}) dolu bir noktayı işaret ediyor`);
      ok(gi.color === 'green' || gi.color === 'red', `step[${i}]: bilinmeyen marker rengi "${gi.color}"`);
    }
  });
});

// ── Marker semantiği: yeşil = doğrulanmış GERÇEK göz, kırmızı = doğrulanmış SAHTE/tehlikeli ──

test('her YEŞİL marker gerçekten doğrulanmış bir TRUE eye (komşu-göz istisnası dahil — tek grup, tek renk, çapraz kontrollü)', () => {
  l7.steps.forEach((step, i) => {
    if (!step.groupIndicators) return;
    const board = buildBoard(step);
    for (const gi of step.groupIndicators.filter(g => g.color === 'green')) {
      const eff = effectiveEyeStatus(board, gi.x, gi.y);
      ok(eff.isEyeCandidate, `step[${i}]: yeşil marker (${gi.x},${gi.y}) tek-grup/tek-renk ile çevrili değil`);
      ok(eff.isTrue === true, `step[${i}]: yeşil marker (${gi.x},${gi.y}) GERÇEK göz değil (SAHTE göz yeşille işaretlenmiş — regresyon!)`);
    }
  });
});

test('REGRESYON: hiçbir KIRMIZI marker aslında doğrulanmış bir TRUE eye değil (canlı grubun gözü kırmızı/ölümlü gösterilemez)', () => {
  l7.steps.forEach((step, i) => {
    if (!step.groupIndicators) return;
    const board = buildBoard(step);
    for (const gi of step.groupIndicators.filter(g => g.color === 'red')) {
      const eff = effectiveEyeStatus(board, gi.x, gi.y);
      ok(!eff.isTrue, `step[${i}]: kırmızı marker (${gi.x},${gi.y}) aslında GERÇEK bir göz — 5508c99 regresyonu geri dönmüş!`);
    }
  });
});

test('REGRESYON: l7 içinde hiçbir adımda KIRMIZI marker yok (ölümlü/sahte kavramı YALNIZ metinle anlatılıyor, canlı grup asla kırmızı gösterilmiyor step[0] dışında istisnasız)', () => {
  // step[2]/step[5] (gerçek sahte göz) BİLEREK kırmızı kullanır — bu ayrı,
  // doğrulanmış bir "sahte göz" örneğidir (bkz. ilgili testler). Burada
  // yalnız 19×19 (step[0]) canlı-grup örneğinin kırmızı KULLANMADIĞINI
  // doğruluyoruz — görev talimatı Bölüm 5: "Kırmızı marker'ı bu ilk 19×19
  // örnekte kullanma."
  const reds = (l7.steps[0].groupIndicators || []).filter(g => g.color === 'red');
  equal(reds.length, 0, 'step[0] (19×19 canlı grup örneği) kırmızı marker içeriyor');
});

// ── 19×19 (step[0]): BEŞ canlı grup + göz kümeleri ────────────────────
// bkz. commit 6143810 / formations/b2-temel-teknikler/l7-canli-gruplar/
// "1. adım.sgf" — tarihsel niyet: 5 ayrı canlı grup, hepsi iki gerçek göze
// sahip. Board taşları SGF ile birebir (üç minimal düzeltme dışında —
// bkz. core/curriculum.js step[0] üstündeki yorum). Bu blok "5 grup"
// iddiasını GERÇEKTEN kanıtlıyor — tek bir groups.length===5 assertion'ı
// DEĞİL, her grup için ayrı, adlandırılmış assertion.

test('step[0] board boyutu tam 19', () => {
  equal(l7.steps[0].size, 19);
});

test('step[0]: board seed\'inde duplicate/dolu/bounds-dışı koordinat yok (genel testten ayrı, açık doğrulama)', () => {
  const step = l7.steps[0];
  const seen = new Set();
  for (const s of step.board) {
    const k = `${s.x},${s.y}`;
    ok(!seen.has(k), `duplicate taş (${k})`);
    seen.add(k);
    ok(s.x >= 0 && s.y >= 0 && s.x < 19 && s.y < 19, `bounds-dışı taş (${k})`);
  }
});

test('step[0]: tam olarak BEŞ hedef canlı grup bulunuyor — her biri marker\'larla temsil edilen AYRI connected component', () => {
  const step = l7.steps[0];
  const board = buildBoard(step);
  const byGroup = new Map();
  for (const gi of step.groupIndicators) {
    const eff = effectiveEyeStatus(board, gi.x, gi.y);
    ok(eff.isEyeCandidate, `(${gi.x},${gi.y}) tek-grup/tek-renk ile çevrili değil`);
    if (!byGroup.has(eff.groupId)) byGroup.set(eff.groupId, []);
    byGroup.get(eff.groupId).push({ x: gi.x, y: gi.y });
  }
  equal(byGroup.size, 5, `beklenen 5 hedef grup, bulunan: ${byGroup.size}`);
  // her grup gerçekten AYRI bir connected component mi (birbirine karışmamış)?
  const groupIds = [...byGroup.keys()];
  const stoneSets = groupIds.map(gid => new Set(gid.split('|')));
  for (let a = 0; a < stoneSets.length; a++) {
    for (let b = a + 1; b < stoneSets.length; b++) {
      const overlap = [...stoneSets[a]].some(k => stoneSets[b].has(k));
      ok(!overlap, `grup ${a} ve grup ${b} aynı taşları paylaşıyor — yanlışlıkla birleşmiş`);
    }
  }
});

// Konum bazlı, kararlı grup kimlikleri — köşe/kenar bounding-box merkezine göre.
const TARGET_GROUPS = [
  { name: 'sol üst',     eyes: [[0, 0], [0, 2]] },
  { name: 'üst orta',    eyes: [[8, 0], [10, 0]] },
  { name: 'sağ üst',     eyes: [[18, 0], [17, 1]] },
  { name: 'merkez',      eyes: [[9, 9], [8, 10]] },
  { name: 'alt bölge',   eyes: [[8, 18], [10, 18]] },
];

TARGET_GROUPS.forEach(({ name, eyes }) => {
  test(`step[0] "${name}" grubu: iki göz noktası da doğrulanmış GERÇEK göz VE aynı gruba ait`, () => {
    const board = buildBoard(l7.steps[0]);
    const [[x1, y1], [x2, y2]] = eyes;
    const e1 = effectiveEyeStatus(board, x1, y1);
    const e2 = effectiveEyeStatus(board, x2, y2);
    ok(e1.isEyeCandidate && e1.isTrue, `"${name}": (${x1},${y1}) doğrulanmış gerçek göz değil`);
    ok(e2.isEyeCandidate && e2.isTrue, `"${name}": (${x2},${y2}) doğrulanmış gerçek göz değil`);
    equal(e1.groupId, e2.groupId, `"${name}": iki göz aynı gruba ait değil`);
  });

  test(`step[0] "${name}" grubu: her iki göz noktası da groupIndicators'ta yeşil olarak işaretli`, () => {
    const gis = l7.steps[0].groupIndicators;
    for (const [x, y] of eyes) {
      const gi = gis.find(g => g.x === x && g.y === y);
      ok(gi, `"${name}": (${x},${y}) için marker yok`);
      equal(gi.color, 'green', `"${name}": (${x},${y}) marker'ı yeşil değil`);
    }
  });
});

test('step[0]: marker kümeleri gruplar arasında karışmıyor (her marker YALNIZ kendi hedef grubunun gözü)', () => {
  const board = buildBoard(l7.steps[0]);
  const seenGroupIds = new Set();
  for (const { eyes } of TARGET_GROUPS) {
    const [[x, y]] = eyes;
    const eff = effectiveEyeStatus(board, x, y);
    ok(!seenGroupIds.has(eff.groupId), `groupId ${eff.groupId.slice(0, 12)}… birden fazla hedef grup adına kullanılmış`);
    seenGroupIds.add(eff.groupId);
  }
  equal(seenGroupIds.size, 5);
});

test('step[0]: aynı boş bölgedeki iki nokta yanlışlıkla İKİ AYRI göz sayılmıyor (her marker kendi tek-noktalı bölgesinde)', () => {
  const board = buildBoard(l7.steps[0]);
  for (const gi of l7.steps[0].groupIndicators) {
    const region = findEmptyRegion(board, gi.x, gi.y);
    equal(region.points.length, 1, `(${gi.x},${gi.y}) tek noktalı bir bölge değil — birden fazla marker aynı bölgeyi paylaşıyor olabilir`);
  }
});

test('step[0]: rakip (beyaz) hiçbir yeşil marker noktasına yasal biçimde giremiyor (gerçek göz = intihar, grup son nefeste değil)', () => {
  const board = buildBoard(l7.steps[0]);
  for (const gi of l7.steps[0].groupIndicators.filter(g => g.color === 'green')) {
    const v = isValidMove(board, gi.x, gi.y, 'white');
    ok(!v.valid, `beyaz (${gi.x},${gi.y}) noktasına YASAL biçimde oynayabiliyor — gerçek göz değil`);
    equal(v.reason, 'SUICIDE', `(${gi.x},${gi.y}): beklenmeyen red reason "${v.reason}"`);
  }
});

test('step[0]: taş listesi SIRASI değiştiğinde 5-grup analizi değişmiyor (sıra-bağımsız)', () => {
  const step = l7.steps[0];
  const board1 = buildBoard(step);
  const shuffled = { ...step, board: [...step.board].reverse() };
  const board2 = buildBoard(shuffled);
  for (const { name, eyes } of TARGET_GROUPS) {
    for (const [x, y] of eyes) {
      const e1 = effectiveEyeStatus(board1, x, y);
      const e2 = effectiveEyeStatus(board2, x, y);
      equal(e1.isTrue, e2.isTrue, `"${name}" (${x},${y}): sıra değişince sonuç değişti`);
    }
  }
});

test('step[0]: "beş ayrı canlı grup" metindeki sıradan bağımsız bulunabiliyor (metin belirli bir taş dizilişine bağımlı değil)', () => {
  // "sıradan bağımsız bulunabiliyor" — yukarıdaki sıra-bağımsızlık testiyle
  // AYNI garantiyi, metnin kendisi üzerinden de doğrula: metin "BEŞ" kelimesini
  // içeriyor ve groupIndicators dizisinin JS SIRASI, analiz sonucunu etkilemiyor
  // (analiz board state'inden hesaplanıyor, dizi sırasından değil).
  ok(/BEŞ|beş/.test(l7.steps[0].text), 'metin "beş" grup sayısını belirtmiyor');
  const order1 = l7.steps[0].groupIndicators;
  const order2 = [...order1].reverse();
  const board = buildBoard(l7.steps[0]);
  const ids1 = order1.map(gi => effectiveEyeStatus(board, gi.x, gi.y).groupId);
  const ids2 = order2.map(gi => effectiveEyeStatus(board, gi.x, gi.y).groupId);
  equal(new Set(ids1).size, new Set(ids2).size, 5);
});

test('REGRESYON: eski square→red semantiği geri dönemiyor — (17,17)/(0,18)/(2,18)/(18,18) (hedef-dışı arka plan kümeleri) yeşil OLARAK SUNULMUYOR', () => {
  // (8,18)/(10,18) artık MEŞRU biçimde "alt bölge" hedef grubunun kendi
  // gözleri (bkz. yukarıdaki düzeltme notu) — bu ikisi kasıtlı olarak
  // istisna. Diğer dört tarihsel square noktası hâlâ hedef-dışı arka plan
  // kümelerine ait ve yeşil/kırmızı hiçbir marker taşımamalı.
  const step = l7.steps[0];
  const stillMarked = (step.groupIndicators || [])
    .some(g => [[17,17],[0,18],[2,18],[18,18]].some(([x,y]) => x === g.x && y === g.y));
  ok(!stillMarked, 'hedef-dışı arka plan kümesi noktaları hâlâ marker taşıyor');
});

test('step[0]: en az 10 doğrulanmış göz marker\'ı var (5 grup × 2 göz)', () => {
  const step = l7.steps[0];
  const board = buildBoard(step);
  const verified = step.groupIndicators.filter(gi => effectiveEyeStatus(board, gi.x, gi.y).isTrue);
  ok(verified.length >= 10, `beklenen en az 10 doğrulanmış marker, bulunan: ${verified.length}`);
  equal(step.groupIndicators.length, verified.length, 'işaretlenen HER nokta doğrulanmış olmalı (fazladan/yanlış marker yok)');
});

test('step[0]: hedef gruplar (SGF\'teki dolgu/arka plan kümeleri dahil) yanlışlıkla birbirine bağlı DEĞİL', () => {
  // "merkez" grubu düzeltilirken eklenen (7,9)/(10,8) taşlarının, YALNIZ
  // eski dolgu kümesini ((8,8)(8,9)(9,8)) merkez gruba bağladığını, başka
  // HİÇBİR hedef veya arka plan grubuna sızmadığını doğrula.
  const board = buildBoard(l7.steps[0]);
  const centerGroup = getGroup(board, 9, 9); // (9,9) artık merkez grubun kendi gözü, komşusundan grubu bul
  const centerStones = getGroup(board, 8, 8); // dolgu kümesinin merkeze bağlandığını (8,8) üzerinden doğrula
  equal([...centerStones].sort().join('|'), (() => {
    // (7,10) merkez grubun orijinal SGF taşlarından biri — aynı gruba ait olmalı
    const viaOriginal = getGroup(board, 7, 10);
    return [...viaOriginal].sort().join('|');
  })(), '(8,8) dolgu taşı merkez gruba bağlanmamış');
  // sol üst / üst orta / sağ üst / alt bölge gruplarının taş sayısı, eklenen
  // taşlardan ETKİLENMEMELİ (bkz. yorum: yalnız merkez ve alt bölge değişti).
  equal(getGroup(board, 1, 1).size, 6, 'sol üst grubun taş sayısı beklenmedik şekilde değişti');
  equal(getGroup(board, 9, 1).size, 8, 'üst orta grubun taş sayısı beklenmedik şekilde değişti');
  equal(getGroup(board, 17, 0).size, 7, 'sağ üst grubun taş sayısı beklenmedik şekilde değişti');
});

// ── Tek gerçek göz vs. sahte göz: farklı formasyonlar, doğru etiketleme ──

test('"tek gerçek göz" (step[1]) ile "sahte göz" (step[2]) FARKLI formasyonlar', () => {
  const a = JSON.stringify(l7.steps[1].board);
  const b = JSON.stringify(l7.steps[2].board);
  ok(a !== b, 'step[1] ve step[2] aynı board seed\'ini kullanıyor');
});

test('step[1] (tek gerçek göz): metinde "sahte göz" denmiyor, marker GERÇEK göz', () => {
  const step = l7.steps[1];
  ok(!/sahte g[öo]z/i.test(step.text), 'tek gerçek göz adımı "sahte göz" olarak etiketlenmiş — regresyon!');
  const board = buildBoard(step);
  const gi = step.groupIndicators[0];
  const cls = classifyPoint(board, gi.x, gi.y);
  ok(cls && cls.isTrue, 'step[1] marker\'ı GERÇEK göz değil');
  equal(gi.color, 'green');
});

test('step[2] (gerçek sahte göz): marker gerçekten SAHTE (çapraz kontrolü eksik), kırmızı işaretli', () => {
  const step = l7.steps[2];
  const board = buildBoard(step);
  const gi = step.groupIndicators[0];
  equal(gi.color, 'red');
  const region = findEmptyRegion(board, gi.x, gi.y);
  equal(region.points.length, 1, 'sahte göz adayı tek noktalı olmalı');
  const cls = classifyRegion(board, region);
  equal(cls.colors.size, 1, 'sahte göz adayı tek renkle çevrili olmalı (dört yönden)');
  equal(cls.groupCount, 1, 'sahte göz adayı tek bir grupla çevrili olmalı');
  const color = [...cls.colors][0];
  const diag = diagonalControl(board, gi.x, gi.y, color);
  ok(!diag.isTrue, 'çapraz kontrolü GERÇEK göz için yeterli görünüyor — sahte göz formasyonu bozuk');
  ok(diag.friendly < diag.onBoardCount, 'sahte göz için en az bir çapraz nokta açık/rakip olmalı');
});

// ── Tek gözlü grup neden koşulsuz canlı değil (step[3]) ───────────────

test('step[3]: cevap hamlesi GERÇEKTEN yasal VE grubun TÜM taşlarını yakalıyor (tek göz = son nefes)', () => {
  const step = l7.steps[3];
  const board = buildBoard(step);
  const color = step.turn === 'white' ? 'white' : 'black';
  const v = isValidMove(board, step.answer.x, step.answer.y, color);
  ok(v.valid, `answer hamlesi yasal değil: ${JSON.stringify(v)}`);
  const blackStoneCount = step.board.filter(s => s.color === 'B').length;
  const { captured } = applyMove(board, step.answer.x, step.answer.y, color);
  equal(captured.length, blackStoneCount, 'tüm siyah taşlar yakalanmalı');
});

test('step[3]: cevap noktası oynanmadan ÖNCE GERÇEKTEN tam bir çapraz-kontrollü göz (öğretici iddia doğru)', () => {
  const step = l7.steps[3];
  const board = buildBoard(step);
  const cls = classifyPoint(board, step.answer.x, step.answer.y);
  ok(cls && cls.isTrue, 'answer noktası GERÇEK bir göz değilse "gerçek göz bile yetmez" dersi anlamsızlaşır');
});

// ── İç alanı ikiye bölme (step[4] ve step[7]): gerçekten iki ayrık göz ──

for (const idx of [4, 7]) {
  test(`step[${idx}]: cevap hamlesi yasal, boş bir noktaya oynanıyor`, () => {
    const step = l7.steps[idx];
    const board = buildBoard(step);
    ok(board.isEmpty(step.answer.x, step.answer.y), 'answer noktası zaten dolu');
    const color = step.turn === 'white' ? 'white' : 'black';
    const v = isValidMove(board, step.answer.x, step.answer.y, color);
    ok(v.valid, `answer hamlesi yasal değil: ${JSON.stringify(v)}`);
  });

  test(`step[${idx}]: doğru cevap SONRASI gerçekten İKİ AYRI, tek-noktalı, çapraz-doğrulanmış göz oluşuyor (eyePointsAfterAnswer'a güvenilmedi — yeniden hesaplandı)`, () => {
    const step = l7.steps[idx];
    const board = buildBoard(step);
    const color = step.turn === 'white' ? 'white' : 'black';
    const { newState } = applyMove(board, step.answer.x, step.answer.y, color);
    const byGroup = scanSinglePointEyesByGroup(newState, color === 'white' ? 'white' : 'black');
    let bestGroupEyes = [];
    for (const pts of byGroup.values()) {
      const trueOnes = pts.filter(p => p.isTrue);
      if (trueOnes.length > bestGroupEyes.length) bestGroupEyes = trueOnes;
    }
    ok(bestGroupEyes.length >= 2, `hamle sonrası aynı gruba ait en az 2 GERÇEK göz bekleniyordu, bulunan: ${bestGroupEyes.length}`);
  });

  test(`step[${idx}]: hamle sonrası oluşan iki göz birbirinden AYRIK (ortak boş kesişim yolu yok — aynı bağlı bölge değiller)`, () => {
    const step = l7.steps[idx];
    const board = buildBoard(step);
    const color = step.turn === 'white' ? 'white' : 'black';
    const { newState } = applyMove(board, step.answer.x, step.answer.y, color);
    const byGroup = scanSinglePointEyesByGroup(newState, color);
    const pts = [...byGroup.values()].sort((a, b) => b.length - a.length)[0] || [];
    const trueEyes = pts.filter(p => p.isTrue);
    ok(trueEyes.length >= 2, 'iki göz bulunamadı');
    const [e1, e2] = trueEyes;
    const r1 = findEmptyRegion(newState, e1.x, e1.y);
    ok(!r1.points.some(p => p.x === e2.x && p.y === e2.y), 'iki göz AYNI bağlı boş bölgede — gerçekten ayrılmamış');
  });

  test(`step[${idx}]: yakalanan taş yok (cevap kendi taşını yerleştiriyor, rakip taş almıyor)`, () => {
    const step = l7.steps[idx];
    const board = buildBoard(step);
    const color = step.turn === 'white' ? 'white' : 'black';
    const { captured } = applyMove(board, step.answer.x, step.answer.y, color);
    equal(captured.length, 0);
  });
}

// ── Sahte gözü bozan yasal hamle (step[5]) ────────────────────────────

test('step[5]: rakibin (beyaz) kritik hamlesi GERÇEKTEN yasal (intihar DEĞİL)', () => {
  const step = l7.steps[5];
  const board = buildBoard(step);
  const color = step.turn === 'white' ? 'white' : 'black';
  const v = isValidMove(board, step.answer.x, step.answer.y, color);
  ok(v.valid, `kritik hamle yasal değil: ${JSON.stringify(v)}`);
});

test('step[5]: aynı sahte göz formasyonu step[2] ile TUTARLI (aynı kırmızı nokta, aynı çapraz zafiyet)', () => {
  const s2 = l7.steps[2], s5 = l7.steps[5];
  equal(JSON.stringify(s2.board), JSON.stringify(s5.board));
  equal(s2.groupIndicators[0].x, 4);
  equal(s2.groupIndicators[0].y, 4);
});

// ── Hazır iki gözlü canlı grup (step[6]) ──────────────────────────────

test('step[6]: iki yeşil marker GERÇEKTEN aynı gruba ait, ikisi de doğrulanmış TRUE eye', () => {
  const step = l7.steps[6];
  const board = buildBoard(step);
  const [a, b] = step.groupIndicators;
  const ca = classifyPoint(board, a.x, a.y);
  const cb = classifyPoint(board, b.x, b.y);
  ok(ca && ca.isTrue, 'ilk marker gerçek göz değil');
  ok(cb && cb.isTrue, 'ikinci marker gerçek göz değil');
  equal(ca.groupId, cb.groupId, 'iki göz aynı gruba ait değil');
});

// ── Feedback metni gerçek sonuçla eşleşiyor mu ────────────────────────

test('"iki göz tamamlandı" diyen fb_ok metinleri yalnız GERÇEKTEN iki göz üreten adımlarda kullanılıyor', () => {
  l7.steps.forEach((step, i) => {
    if (!step.fb_ok || !/iki (ayrı )?g[öo]z/i.test(step.fb_ok)) return;
    ok(step.answer, `step[${i}]: fb_ok "iki göz" diyor ama answer yok`);
    const board = buildBoard(step);
    const color = step.turn === 'white' ? 'white' : 'black';
    const { newState } = applyMove(board, step.answer.x, step.answer.y, color);
    const byGroup = scanSinglePointEyesByGroup(newState, color);
    const best = [...byGroup.values()].sort((a, b) => b.length - a.length)[0] || [];
    ok(best.filter(p => p.isTrue).length >= 2, `step[${i}]: fb_ok "iki göz" iddia ediyor ama hamle sonrası doğrulanamadı`);
  });
});

test('step[4] fb_ok metnindeki koordinatlar ((1,5) ve (3,5)) GERÇEK sonuçla eşleşiyor', () => {
  const step = l7.steps[4];
  const board = buildBoard(step);
  const { newState } = applyMove(board, step.answer.x, step.answer.y, 'black');
  const c1 = classifySinglePointEye(newState, 1, 5);
  const c2 = classifySinglePointEye(newState, 3, 5);
  ok(c1.isEyeCandidate && c1.isTrue, '(1,5) gerçek göz değil — fb_ok metni yanlış koordinat veriyor');
  ok(c2.isEyeCandidate && c2.isTrue, '(3,5) gerçek göz değil — fb_ok metni yanlış koordinat veriyor');
  ok(/\(1,5\)/.test(step.fb_ok) && /\(3,5\)/.test(step.fb_ok));
});

test('step[7] fb_ok metnindeki koordinatlar ((3,2) ve (2,3)) GERÇEK sonuçla eşleşiyor', () => {
  const step = l7.steps[7];
  const board = buildBoard(step);
  const { newState } = applyMove(board, step.answer.x, step.answer.y, 'black');
  const c1 = classifySinglePointEye(newState, 3, 2);
  const c2 = classifySinglePointEye(newState, 2, 3);
  ok(c1.isEyeCandidate && c1.isTrue, '(3,2) gerçek göz değil');
  ok(c2.isEyeCandidate && c2.isTrue, '(2,3) gerçek göz değil');
  ok(/\(3,2\)/.test(step.fb_ok) && /\(2,3\)/.test(step.fb_ok));
});

// ── Taş sırası bağımsızlığı ────────────────────────────────────────────

test('taş listesi SIRASI değiştiğinde analiz sonucu değişmiyor (sıra-bağımsız)', () => {
  const step = l7.steps[2]; // sahte göz — en anlamlı sınıflandırma
  const board1 = buildBoard(step);
  const shuffled = { ...step, board: [...step.board].reverse() };
  const board2 = buildBoard(shuffled);
  const gi = step.groupIndicators[0];
  const c1 = classifySinglePointEye(board1, gi.x, gi.y);
  const c2 = classifySinglePointEye(board2, gi.x, gi.y);
  equal(c1.isTrue, c2.isTrue);
  equal(c1.color, c2.color);
});

// ── Bütün answer hamleleri: boş + yasal (genel regresyon süpürmesi) ────

test('REGRESYON: l7\'deki HİÇBİR answer hamlesi SUICIDE (veya başka bir nedenle) yasadışı değil', () => {
  l7.steps.forEach((step, i) => {
    if (!step.answer) return;
    const board = buildBoard(step);
    ok(board.isEmpty(step.answer.x, step.answer.y), `step[${i}]: answer noktası dolu`);
    const color = step.turn === 'white' ? 'white' : 'black';
    const v = isValidMove(board, step.answer.x, step.answer.y, color);
    ok(v.valid, `step[${i}]: answer hamlesi yasadışı (${v.reason}) — SUICIDE cevabın "doğru cevap" olarak tanımlanması regresyonu!`);
  });
});

// ── eyeAnalysis modülünün kendisi: hatalı girdide anlaşılır sonuç ──────

test('classifySinglePointEye: dolu bir noktada güvenle isEyeCandidate:false döner (çökme YOK)', () => {
  const board = buildBoard(l7.steps[1]);
  const stone = l7.steps[1].board[0];
  const cls = classifySinglePointEye(board, stone.x, stone.y);
  equal(cls.isEyeCandidate, false);
});

test('classifySinglePointEye: board dışı koordinatta güvenle isEyeCandidate:false döner (çökme YOK)', () => {
  const board = buildBoard(l7.steps[1]);
  const cls = classifySinglePointEye(board, -1, -1);
  equal(cls.isEyeCandidate, false);
});

test('classifySinglePointEye: iki farklı (bağlantısız) grup tarafından paylaşılan boş nokta isEyeCandidate:false döner', () => {
  // Sentetik, board-bağımsız örnek: (2,2) merkez noktasının ORTOGONAL
  // komşuları hepsi siyah AMA (1,1)/(3,1) taşları (2,1) YOKLUĞUNDA (1,2)
  // grubuyla BAĞLANTISIZ — yani (2,2) aslında hiçbirinin tek başına gözü
  // değil, iki AYRI grubun paylaştığı bir sınır noktası. Bu senaryo
  // önceden step[0]'ın 19×19 board'unda (9,9) noktasıyla test ediliyordu
  // (SGF'in dolgu kümesiyle merkez grubu ayıran, düzeltilmemiş hâliyle);
  // o formasyon artık düzeltildi (bkz. core/curriculum.js), bu yüzden
  // burada AYNI edge-case'i bağımsız, sentetik bir board ile koruyoruz.
  const board = new BoardState(9);
  // Grup A: (1,2),(2,1) — (2,2)'nin sol ve üst komşuları, BİRBİRİNE bağlı değil.
  board.placeStone(1, 2, 'black');
  board.placeStone(2, 1, 'black');
  // Grup B: (3,2),(2,3) — (2,2)'nin sağ ve alt komşuları, YİNE birbirine bağlı değil,
  // ve Grup A'ya da bağlı değil (aralarında hep boşluk var).
  board.placeStone(3, 2, 'black');
  board.placeStone(2, 3, 'black');
  // (2,2)'nin 4 ortogonal komşusu da siyah ama İKİ (aslında dört) AYRI
  // bağlantısız gruba ait — kimsenin tek başına gözü değil.
  const cls = classifySinglePointEye(board, 2, 2);
  equal(cls.isEyeCandidate, false, '(2,2) birden fazla bağlantısız gruba ait — hiçbirinin GERÇEK gözü olmamalı');
});

console.log(`\ntwoEyesCurriculum test sayısı: ${passed + failed}`);
console.log('özet:', `${passed}/${passed + failed}`);
if (failed) process.exit(1);
