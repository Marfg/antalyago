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

test('her YEŞİL marker gerçekten doğrulanmış bir TRUE eye (tek grup, tek renk, çapraz kontrollü)', () => {
  l7.steps.forEach((step, i) => {
    if (!step.groupIndicators) return;
    const board = buildBoard(step);
    for (const gi of step.groupIndicators.filter(g => g.color === 'green')) {
      const cls = classifyPoint(board, gi.x, gi.y);
      ok(cls, `step[${i}]: yeşil marker (${gi.x},${gi.y}) tek-grup/tek-renk ile çevrili değil`);
      ok(cls.isTrue === true, `step[${i}]: yeşil marker (${gi.x},${gi.y}) GERÇEK göz değil (SAHTE göz yeşille işaretlenmiş — regresyon!)`);
    }
  });
});

test('REGRESYON: hiçbir KIRMIZI marker aslında doğrulanmış bir TRUE eye değil (canlı grubun gözü kırmızı/ölümlü gösterilemez)', () => {
  l7.steps.forEach((step, i) => {
    if (!step.groupIndicators) return;
    const board = buildBoard(step);
    for (const gi of step.groupIndicators.filter(g => g.color === 'red')) {
      const cls = classifyPoint(board, gi.x, gi.y);
      const isVerifiedTrueEye = !!(cls && cls.isTrue === true);
      ok(!isVerifiedTrueEye, `step[${i}]: kırmızı marker (${gi.x},${gi.y}) aslında GERÇEK bir göz — 5508c99 regresyonu geri dönmüş!`);
    }
  });
});

// ── 19×19 (step[0]): canlı gruplar + göz kümeleri ────────────────────

test('step[0] (19×19): her yeşil marker grubu, GERÇEKTEN o gruba ait iki ayrı göz sağlıyor', () => {
  const step = l7.steps[0];
  equal(step.size, 19);
  const board = buildBoard(step);
  const byGroup = new Map();
  for (const gi of step.groupIndicators) {
    const cls = classifyPoint(board, gi.x, gi.y);
    ok(cls && cls.isTrue, `(${gi.x},${gi.y}) doğrulanmış gerçek göz değil`);
    if (!byGroup.has(cls.groupId)) byGroup.set(cls.groupId, []);
    byGroup.get(cls.groupId).push({ x: gi.x, y: gi.y });
  }
  ok(byGroup.size >= 2, 'en az iki farklı canlı grup gösterilmeli');
  for (const [gid, pts] of byGroup) {
    ok(pts.length >= 2, `grup ${gid.slice(0, 12)}… yalnız ${pts.length} doğrulanmış göze sahip (iki gerekli)`);
  }
});

test('step[0]: eski regresyon (5508c99) noktaları (17,17) (0,18) (2,18) (8,18) (10,18) (18,18) artık "yeşil canlı göz" olarak sunulmuyor', () => {
  const step = l7.steps[0];
  const stillClaimedGreen = (step.groupIndicators || [])
    .filter(g => g.color === 'green')
    .some(g => [[17,17],[0,18],[2,18],[8,18],[10,18],[18,18]].some(([x,y]) => x === g.x && y === g.y));
  ok(!stillClaimedGreen, 'eski hatalı işaretli noktalar hâlâ yeşil olarak sunuluyor');
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

test('classifySinglePointEye: iki farklı grup tarafından paylaşılan boş nokta isEyeCandidate:false döner', () => {
  // (9,9) — step[0]'ın 19x19 board'unda İKİ AYRI siyah grup tarafından paylaşılan, kimsenin gözü olmayan bir nokta.
  const board = buildBoard(l7.steps[0]);
  const cls = classifySinglePointEye(board, 9, 9);
  equal(cls.isEyeCandidate, false, '(9,9) iki farklı gruba ait — hiçbirinin GERÇEK gözü değil');
});

console.log(`\ntwoEyesCurriculum test sayısı: ${passed + failed}`);
console.log('özet:', `${passed}/${passed + failed}`);
if (failed) process.exit(1);
