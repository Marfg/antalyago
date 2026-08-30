/**
 * tests/illegalMovePolicy.test.js
 * node tests/illegalMovePolicy.test.js
 *
 * scenes/illegalMovePolicy.js — DOM'suz, saf değerlendirme politikası.
 * core/curriculum.js l4 dersinin GERÇEK (production) steps[0..1] verisini
 * kullanır — synthetic fixture DEĞİL (edge-case testleri HARİÇ, bkz. dosya
 * altı), bkz. tests/capturePracticePolicy.test.js ile AYNI disiplin.
 */
import assert from 'node:assert/strict';
import {
  MOMENT_STEP_INDICES, MOMENT_COUNT, MOMENT_KINDS, CONCEPT,
  getIllegalMoveMoments, normalizeBoardSeed, isTargetPoint, evaluateAttempt,
  boardSignature, reasonLabelTr, isKnownMomentKind, pointKey, normalizeRejectedMoment,
} from '../scenes/illegalMovePolicy.js';
import { CURRICULUM } from '../core/curriculum.js';
import { BoardState } from '../core/boardState.js';
import { isValidMove, applyMove } from '../core/ruleEngine.js';

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

function seedBoard(boardSeed, size = 9) {
  const bs = new BoardState(size);
  for (const s of boardSeed) bs.placeStone(s.x, s.y, s.color === 'B' ? 'black' : 'white');
  return bs;
}

const l4 = CURRICULUM.flatMap(c => c.lessons).find(l => l.id === 'l4');

test('MOMENT_STEP_INDICES = [0,1] (l4 kullanıcıya görünen 1-2. adımlar)', () => {
  equal(MOMENT_STEP_INDICES, [0, 1]);
  equal(MOMENT_COUNT, 2);
});

test('getIllegalMoveMoments() curriculum sırasıyla TAM 2 öğe döner', () => {
  const moments = getIllegalMoveMoments();
  equal(moments.length, 2);
  equal(moments.map(m => m.curriculumStepIndex), [0, 1]);
  equal(moments.map(m => m.momentIndex), [0, 1]);
});

test('An 1 kind:"rejected", An 2 kind:"legal_capture" — İKİ FARKLI GERÇEK durum (bkz. dosya başı not)', () => {
  const moments = getIllegalMoveMoments();
  equal(moments[0].kind, MOMENT_KINDS.REJECTED);
  equal(moments[1].kind, MOMENT_KINDS.LEGAL_CAPTURE);
});

test('1) An 1: ilk adım curriculum\'un KENDİ forbidden dizisindeki TAM DÖRT hedefi çıkarır (kamera/test kolaylığı gerekçesiyle TEK hedefe indirilmez — bkz. görev talimatı)', () => {
  const moments = getIllegalMoveMoments();
  const m0 = moments[0];
  equal(m0.targetPoints.length, 4);
  const sortKey = p => `${p.row},${p.col}`;
  const rawExpected = l4.steps[0].forbidden.map(p => ({ row: p.y, col: p.x }));
  equal(
    [...m0.targetPoints].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [...rawExpected].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
  );
});

test('2) An 1: dört hedef benzersizdir (Set boyutu 4)', () => {
  const [m0] = getIllegalMoveMoments();
  const keys = new Set(m0.targetPoints.map(pointKey));
  equal(keys.size, 4);
});

test('3) An 1: dört hedef tahta içindedir', () => {
  const [m0] = getIllegalMoveMoments();
  const bs = seedBoard(m0.board, m0.size);
  for (const p of m0.targetPoints) ok(bs.isInBounds(p.col, p.row), `(${p.row},${p.col}) tahta dışı`);
});

test('4) An 1: dört hedef boştur (hiçbiri dolu değil)', () => {
  const [m0] = getIllegalMoveMoments();
  const bs = seedBoard(m0.board, m0.size);
  for (const p of m0.targetPoints) ok(!bs.isOccupied(p.col, p.row), `(${p.row},${p.col}) dolu OLMAMALI`);
});

test('5) An 1: dört hedefin DÖRDÜ de bağımsız core/ruleEngine.js isValidMove ile GERÇEKTEN SUICIDE (çapraz doğrulama — curriculum\'un "4 farklı yasak nokta" iddiası TAMAMEN kanıtlanır)', () => {
  const [m0] = getIllegalMoveMoments();
  const bs = seedBoard(m0.board, m0.size);
  for (const p of m0.targetPoints) {
    const check = isValidMove(bs, p.col, p.row, 'black');
    equal(check.valid, false, `(${p.row},${p.col}) yasal ÇIKMAMALI`);
    equal(check.reason, 'SUICIDE', `(${p.row},${p.col}) reason SUICIDE olmalı`);
  }
  equal(m0.expectedReason, 'SUICIDE');
  equal(m0.expectedCapturedCount, 0);
});

test('An 1: board seed curriculum\'un TAM 14 taşlı board\'uyla BİREBİR aynı — dört formasyonun TAMAMI görünür (kamera/mobil kadraj gerekçesiyle BUDANMAZ, bkz. dosya başı revizyon notu)', () => {
  const [m0] = getIllegalMoveMoments();
  const rawBoard = normalizeBoardSeed(l4.steps[0].board);
  const sig = arr => arr.map(s => `${s.color}${s.x},${s.y}`).sort().join('|');
  equal(sig(m0.board), sig(rawBoard));
  equal(m0.board.length, 14);
});

test('An 2: hedef nokta curriculum\'un KENDİ ham moves[0] (siyah) hamlesiyle BİREBİR aynı', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  const rawTarget = l4.steps[1].moves.find(mv => mv.color === 'B');
  equal(m1.targetPoints, [{ row: rawTarget.y, col: rawTarget.x }]);
});

test('An 2: hedef hamle bağımsız core/ruleEngine.js ile GERÇEKTEN yasal ve curriculum\'un authored capture listesiyle BİREBİR eşleşen 5 taşı yakalıyor', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  const bs = seedBoard(m1.board, m1.size);
  const target = m1.targetPoints[0];
  const check = isValidMove(bs, target.col, target.row, 'black');
  equal(check.valid, true);
  const { captured } = applyMove(bs, target.col, target.row, 'black');
  equal(captured.length, 5);
  const rawTarget = l4.steps[1].moves.find(mv => mv.color === 'B');
  const capturedKeys = new Set(captured.map(c => `${c.x},${c.y}`));
  for (const c of rawTarget.capture) {
    ok(capturedKeys.has(`${c.x},${c.y}`), `curriculum'un authored capture noktası (${c.x},${c.y}) GERÇEK sonuçta yok`);
  }
  equal(m1.expectedCapturedCount, 5);
  equal(m1.expectedResultConcept, 'capture');
});

test('An 2: board seed YALNIZ üst (siyah/kullanıcı) formasyonu içerir — alt (beyaz) simetrik formasyon YOK', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  ok(m1.board.every(s => s.y <= 2), 'An 2 board seedinde y>2 (alt formasyon) taş OLMAMALI');
  equal(m1.board.length, 12);
});

test('assessmentConcept HER İKİ anda "forbidden_move" — export edilen CONCEPT sabitiyle AYNI', () => {
  const moments = getIllegalMoveMoments();
  equal(CONCEPT, 'forbidden_move');
  for (const m of moments) equal(m.assessmentConcept, CONCEPT);
});

test('isTargetPoint: DÖRT hedefin HERBİRİ true, kümede olmayan false, null/undefined güvenle false', () => {
  const [m0] = getIllegalMoveMoments();
  for (const p of m0.targetPoints) ok(isTargetPoint(m0, p), `(${p.row},${p.col}) hedef olarak tanınmalı`);
  ok(!isTargetPoint(m0, { row: 8, col: 0 }));
  ok(!isTargetPoint(m0, null));
  ok(!isTargetPoint(m0, undefined));
});

test('6/7/8) evaluateAttempt: An 1\'in DÖRT hedefinin HERBİRİ → legal:false, reason:SUICIDE, isCurriculumTarget:true, captured boş, board signature/taş sayısı DEĞİŞMEZ', () => {
  const [m0] = getIllegalMoveMoments();
  const sigBefore = boardSignature(m0.board);
  const countBefore = m0.board.length;
  for (const p of m0.targetPoints) {
    const result = evaluateAttempt(m0, p);
    equal(result.legal, false, `(${p.row},${p.col})`);
    equal(result.reason, 'SUICIDE', `(${p.row},${p.col})`);
    equal(result.isCurriculumTarget, true, `(${p.row},${p.col})`);
    equal(result.captured, [], `(${p.row},${p.col})`);
    equal(result.capturedCount, 0, `(${p.row},${p.col})`);
  }
  equal(boardSignature(m0.board), sigBefore, 'board signature dört analiz SONRASI da DEĞİŞMEMELİ');
  equal(m0.board.length, countBefore, 'taş sayısı DEĞİŞMEMELİ');
});

test('9/10) Serbest sıralı ilerleme simülasyonu: dört hedef HERHANGİ bir sırada tamamlanabilir; AYNI hedefe tekrar dokunmak Set boyutunu ARTIRMAZ', () => {
  const [m0] = getIllegalMoveMoments();
  // Kasıtlı KARIŞIK sıra — curriculum'un authored sırasıyla AYNI OLMAMALI.
  const shuffled = [m0.targetPoints[2], m0.targetPoints[0], m0.targetPoints[3], m0.targetPoints[1]];
  const attempted = new Set();
  for (const p of shuffled) {
    const result = evaluateAttempt(m0, p);
    ok(result.isCurriculumTarget && !result.legal, `(${p.row},${p.col}) GERÇEK hedef+SUICIDE olmalı`);
    attempted.add(pointKey(p));
  }
  equal(attempted.size, 4, 'dört benzersiz hedefin TAMAMI karışık sırada tamamlanabilmeli');
  // Aynı noktaya (ilk bulunan) TEKRAR dokunma — Set boyutu ARTMAMALI.
  attempted.add(pointKey(shuffled[0]));
  equal(attempted.size, 4, 'aynı hedefe tekrar dokunmak Set boyutunu artırmamalı');
});

test('11) Non-curriculum bir SUICIDE nokta (bu board\'da GERÇEKTEN yok, ama sentetik olarak) progress\'e sayılmaz — isCurriculumTarget:false', () => {
  // An 1'in board'unda curriculum'un 4 hedefi DIŞINDA başka SUICIDE nokta
  // YOK (bağımsızca doğrulandı — bkz. aşağıdaki "tüm board taraması" testi).
  // Bu, evaluateAttempt'in GENEL sözleşmesini (hedef-dışı gerçek bir SUICIDE
  // noktası olsaydı bile isCurriculumTarget:false dönerdi) sentetik bir
  // moment üzerinde kanıtlar.
  // (4,5) — curriculum'un GERÇEK forbidden[2] noktasıyla AYNI izole 4-taşlı
  // "kutu" deseni (bkz. illegalMovePolicy.js dosya başı notu) — TÜM DÖRT
  // komşu (4,4)/(4,6)/(3,5)/(5,5) beyaz, (4,5) boş → GERÇEKTEN SUICIDE.
  const seed = normalizeBoardSeed([{ color: 'W', x: 4, y: 4 }, { color: 'W', x: 4, y: 6 }, { color: 'W', x: 3, y: 5 }, { color: 'W', x: 5, y: 5 }]);
  const synthetic = { board: seed, size: 9, targetPoints: [{ row: 8, col: 8 }] }; // hedef BAŞKA bir nokta
  const result = evaluateAttempt(synthetic, { row: 5, col: 4 }); // (x=4,y=5) GERÇEK SUICIDE ama hedef DEĞİL
  equal(result.legal, false);
  equal(result.reason, 'SUICIDE');
  equal(result.isCurriculumTarget, false, 'curriculum hedefi OLMAYAN bir SUICIDE noktası true DÖNMEMELİ');
});

test('An 1\'in TAM 9×9 board\'unda curriculum\'un dört hedefi DIŞINDA GERÇEKTEN başka hiçbir SUICIDE nokta yok (tüm board taraması)', () => {
  const [m0] = getIllegalMoveMoments();
  const bs = seedBoard(m0.board, m0.size);
  const targetKeys = new Set(m0.targetPoints.map(pointKey));
  let extraSuicideCount = 0;
  for (let row = 0; row < m0.size; row++) {
    for (let col = 0; col < m0.size; col++) {
      if (bs.isOccupied(col, row)) continue;
      if (targetKeys.has(pointKey({ row, col }))) continue;
      const check = isValidMove(bs, col, row, 'black');
      if (!check.valid && check.reason === 'SUICIDE') extraSuicideCount++;
    }
  }
  equal(extraSuicideCount, 0, 'curriculum\'un dört hedefi DIŞINDA fazladan SUICIDE nokta OLMAMALI');
});

test('12) Yasal başka bir hamle (hedef-dışı) progress\'e sayılmaz — isCurriculumTarget:false', () => {
  const [m0] = getIllegalMoveMoments();
  const farEmpty = { row: 8, col: 0 };
  ok(!m0.targetPoints.some(p => p.row === farEmpty.row && p.col === farEmpty.col), 'test noktası yanlışlıkla hedef kümede');
  const result = evaluateAttempt(m0, farEmpty);
  equal(result.legal, true);
  equal(result.isCurriculumTarget, false);
});

test('14) Dördüncü benzersiz hedef tamamlandığında Set boyutu targetPoints.length\'e ULAŞIR (scene katmanının "Devam" kararı bunun üzerine kurulur)', () => {
  const [m0] = getIllegalMoveMoments();
  const attempted = new Set(m0.targetPoints.slice(0, 3).map(pointKey));
  ok(attempted.size !== m0.targetPoints.length, 'ön koşul: üç hedefte HENÜZ tamamlanmamış olmalı');
  attempted.add(pointKey(m0.targetPoints[3]));
  equal(attempted.size, m0.targetPoints.length, 'dördüncü benzersiz hedeften SONRA Set tam boyuta ulaşmalı');
});

test('evaluateAttempt: An 1 hedef-dışı DOLU bir kesişim → legal:false, reason:OCCUPIED, isCurriculumTarget:false', () => {
  const [m0] = getIllegalMoveMoments();
  const occupied = { row: m0.board[0].y, col: m0.board[0].x };
  const result = evaluateAttempt(m0, occupied);
  equal(result.legal, false);
  equal(result.reason, 'OCCUPIED');
  equal(result.isCurriculumTarget, false);
});

test('17/18/19) An 2 hedef noktası → legal:true, capturedCount:5, isCurriculumTarget:true, resultConcept "capture" (An 1\'in çoklu-hedef mekanizması SIZMADI — TEK hedef kalır)', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  equal(m1.targetPoints.length, 1, 'An 2 TEK hedef olmalı');
  const result = evaluateAttempt(m1, m1.targetPoints[0]);
  equal(result.legal, true);
  equal(result.capturedCount, 5);
  equal(result.isCurriculumTarget, true);
  equal(m1.expectedResultConcept, 'capture');
});

test('20) evaluateAttempt: moment.board ASLA mutate edilmez — art arda iki farklı deneme sonrası board signature AYNI kalır', () => {
  const moments = getIllegalMoveMoments();
  for (const m of moments) {
    const before = boardSignature(m.board);
    evaluateAttempt(m, m.targetPoints[0]);
    evaluateAttempt(m, { row: 8, col: 0 });
    const after = boardSignature(m.board);
    equal(after, before, `step=${m.curriculumStepIndex}: moment.board DEĞİŞMEMELİ`);
  }
});

test('boardSignature: sıradan BAĞIMSIZ (aynı taşlar farklı sırada AYNI imzayı üretir)', () => {
  const a = [{ color: 'W', x: 0, y: 0 }, { color: 'B', x: 1, y: 0 }];
  const b = [{ color: 'B', x: 1, y: 0 }, { color: 'W', x: 0, y: 0 }];
  equal(boardSignature(a), boardSignature(b));
});

test('reasonLabelTr: bilinen dört reason KISA, Türkçe metin döner; bilinmeyen reason AÇIKÇA "bilinmeyen" der (sessizce yanlış metin ÜRETMEZ)', () => {
  for (const reason of ['SUICIDE', 'OCCUPIED', 'OUT_OF_BOUNDS', 'KO']) {
    const label = reasonLabelTr(reason);
    ok(typeof label === 'string' && label.length > 0, reason);
    ok(!/^Bilinmeyen/.test(label), `${reason} bilinmeyen OLMAMALI`);
  }
  ok(/Bilinmeyen/.test(reasonLabelTr('SOME_NEW_REASON')));
});

test('isKnownMomentKind: iki bilinen değeri kabul eder, bilinmeyeni reddeder', () => {
  ok(isKnownMomentKind(MOMENT_KINDS.REJECTED));
  ok(isKnownMomentKind(MOMENT_KINDS.LEGAL_CAPTURE));
  ok(!isKnownMomentKind('unknown_kind'));
  ok(!isKnownMomentKind(undefined));
});

test('terminoloji: promptText hiçbirinde "özgürlük"/"serbestlik" YOK', () => {
  const moments = getIllegalMoveMoments();
  for (const m of moments) {
    ok(!/özgürlük|serbestlik/i.test(m.promptText), `step=${m.curriculumStepIndex}: yasak terminoloji sızmış`);
  }
});

test('getIllegalMoveMoments() SAF — art arda iki çağrı AYNI sonucu üretir (yan etki/mutasyon YOK)', () => {
  const a = getIllegalMoveMoments();
  const b = getIllegalMoveMoments();
  equal(a, b);
});

/* ══════════════════════════════════════════════════════════════════
   Edge-case testleri — synthetic moment/seed'lerle (bkz. görev talimatı
   Bölüm 18: "eksik answer", "board dışı answer", "answer noktası yasal
   çıkıyor", "yanlış reason", "duplicate board noktası", "geçersiz renk",
   "analiz sonrası state mutation olmadığının kanıtı").
   ══════════════════════════════════════════════════════════════════ */

test('EDGE: normalizeBoardSeed — duplicate board noktası açık Error fırlatır', () => {
  throws(() => normalizeBoardSeed([{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 4, y: 4 }]), /duplicate board noktası/);
});

test('EDGE: normalizeBoardSeed — geçersiz/bilinmeyen renk açık Error fırlatır', () => {
  throws(() => normalizeBoardSeed([{ color: 'X', x: 4, y: 4 }]), /geçersiz taş rengi/);
});

test('EDGE: normalizeBoardSeed — geçersiz koordinat açık Error fırlatır', () => {
  throws(() => normalizeBoardSeed([{ color: 'W', x: 'a', y: 4 }]), /geçersiz koordinat/);
});

test('EDGE: normalizeBoardSeed — boş/eksik seed güvenle boş dizi döner (çökme YOK)', () => {
  equal(normalizeBoardSeed(undefined), []);
  equal(normalizeBoardSeed(null), []);
  equal(normalizeBoardSeed([]), []);
});

/* ── normalizeRejectedMoment (export edildi — bkz. dosya başı gerekçe):
   curriculum verisi bozuk/hatalı OLSAYDI ne olurdu — GERÇEK l4 verisi
   DEĞİŞTİRİLMEDEN, sentetik `step` nesneleriyle (bkz. görev talimatı
   Bölüm 10/13: "duplicate curriculum verisi issue üretir", "eksik hedef
   issue üretir"). ── */

// (4,4) — DÖRT beyaz komşu (4,3)/(3,4)/(5,4)/(4,5) ile çevrili, KENDİSİ boş
// → GERÇEKTEN SUICIDE (isValidMove ile bağımsızca doğrulanabilir).
const SURROUNDED_EMPTY_BOARD = [
  { color: 'W', x: 4, y: 3 }, { color: 'W', x: 3, y: 4 }, { color: 'W', x: 5, y: 4 }, { color: 'W', x: 4, y: 5 },
];

test('15) normalizeRejectedMoment — duplicate forbidden noktası açık Error fırlatır (sessizce yutulmaz)', () => {
  const step = {
    text: 'test',
    size: 9,
    board: SURROUNDED_EMPTY_BOARD,
    forbidden: [{ x: 4, y: 4 }, { x: 4, y: 4 }],
  };
  throws(() => normalizeRejectedMoment(step, 0, 0), /duplicate forbidden noktası/);
});

test('16) normalizeRejectedMoment — dört BENZERSİZ hedeften AZ (eksik) veya ÇOK olduğunda açık Error fırlatır', () => {
  const singleTargetStep = {
    text: 'test',
    size: 9,
    board: SURROUNDED_EMPTY_BOARD,
    forbidden: [{ x: 4, y: 4 }], // yalnız BİR gerçek SUICIDE nokta — 4 DEĞİL
  };
  throws(() => normalizeRejectedMoment(singleTargetStep, 0, 0), /tam olarak 4 benzersiz yasak nokta bekleniyor/);
});

test('EDGE: normalizeRejectedMoment — "forbidden" listesi boş/yok açık Error fırlatır', () => {
  const step = { text: 'test', size: 9, board: [], forbidden: [] };
  throws(() => normalizeRejectedMoment(step, 0, 0), /'forbidden' dizisi boş\/yok/);
});

test('EDGE: normalizeRejectedMoment — forbidden noktası tahta dışıysa açık Error fırlatır', () => {
  const step = { text: 'test', size: 9, board: [], forbidden: [{ x: 20, y: 20 }] };
  throws(() => normalizeRejectedMoment(step, 0, 0), /tahta dışı/);
});

test('EDGE: normalizeRejectedMoment — forbidden noktası GERÇEKTE yasalsa (curriculum verisiyle çelişki) açık Error fırlatır', () => {
  const step = { text: 'test', size: 9, board: [], forbidden: [{ x: 4, y: 4 }] }; // boş board — (4,4) tamamen yasal
  throws(() => normalizeRejectedMoment(step, 0, 0), /RuleEngine'e göre ASLINDA yasal/);
});

test('EDGE: normalizeRejectedMoment — forbidden noktası dolu bir kesişimi işaret ederse (reason SUICIDE değil, OCCUPIED) açık Error fırlatır', () => {
  const step = { text: 'test', size: 9, board: [{ color: 'W', x: 4, y: 4 }], forbidden: [{ x: 4, y: 4 }] }; // hedefin KENDİSİ dolu
  throws(() => normalizeRejectedMoment(step, 0, 0), /beklenmeyen reddetme nedeni/);
});

test('EDGE: evaluateAttempt — tahta dışı bir "answer" noktası OUT_OF_BOUNDS ile güvenle reddedilir (çökme YOK)', () => {
  const synthetic = { board: normalizeBoardSeed([{ color: 'W', x: 4, y: 4 }]), size: 9, targetPoints: [] };
  const result = evaluateAttempt(synthetic, { row: -1, col: 20 });
  equal(result.legal, false);
  equal(result.reason, 'OUT_OF_BOUNDS');
  equal(result.isCurriculumTarget, false);
});

test('EDGE: evaluateAttempt — hedef kümesi BOŞ bir moment üzerinde HER nokta isCurriculumTarget:false döner', () => {
  const synthetic = { board: [], size: 9, targetPoints: [] };
  const result = evaluateAttempt(synthetic, { row: 4, col: 4 });
  equal(result.isCurriculumTarget, false);
});

test('EDGE: evaluateAttempt — curriculum\'daki gibi "yasak görünen ama GERÇEKTE yasal" bir sentetik intihar+yakalama senaryosu doğru sonuç verir', () => {
  // Tek beyaz taş, üç kenarı siyahla çevrili, son boş komşusuna (0,0) siyah
  // oynarsa GERÇEKTE beyazı yakalar (intihar DEĞİL) — köşe: yalnız 2 komşu.
  const seed = normalizeBoardSeed([{ color: 'W', x: 1, y: 0 }, { color: 'B', x: 2, y: 0 }, { color: 'B', x: 1, y: 1 }]);
  const synthetic = { board: seed, size: 9, targetPoints: [{ row: 0, col: 0 }] };
  const result = evaluateAttempt(synthetic, { row: 0, col: 0 });
  equal(result.legal, true);
  equal(result.capturedCount, 1);
  equal(result.isCurriculumTarget, true);
});

test('EDGE: evaluateAttempt — analiz sonrası synthetic moment.board mutate EDİLMEDİ (state mutation kanıtı)', () => {
  const seed = normalizeBoardSeed([{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 4, y: 3 }, { color: 'B', x: 3, y: 4 }, { color: 'B', x: 5, y: 4 }]);
  const synthetic = { board: seed, size: 9, targetPoints: [{ row: 5, col: 4 }] };
  const before = boardSignature(synthetic.board);
  evaluateAttempt(synthetic, { row: 5, col: 4 }); // (4,4) beyazın son nefesi — GERÇEK intihar/yakalama denemesi
  equal(boardSignature(synthetic.board), before);
});

console.log(`\nillegalMovePolicy test sayısı: ${passed + failed}`);
console.log('özet:', `${passed}/${passed + failed}`);
if (failed) process.exit(1);
