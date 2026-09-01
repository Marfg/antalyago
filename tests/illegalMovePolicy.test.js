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
  deriveLegalCaptureExamples, resolveCaptureExampleMoment, toRuntimeColor,
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

test('An 2: legalCaptureExamples curriculum\'un GERÇEK moves[] dizisindeki HER hedefi (2) — yalnız İLK/siyah hamle DEĞİL (bkz. v3 revizyonu: alt/beyaz formasyon artık SESSİZCE ATLANMIYOR)', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  equal(m1.legalCaptureExamples.length, l4.steps[1].moves.length);
  equal(m1.legalCaptureExamples.length, 2);
  const rawTargets = l4.steps[1].moves.map(mv => ({ row: mv.y, col: mv.x }));
  const resolvedTargets = m1.legalCaptureExamples.map((_, i) => resolveCaptureExampleMoment(m1, i).targetPoints[0]);
  equal(resolvedTargets, rawTargets);
});

test('An 2: HER örnek (sourceIndex 0 VE 1) KENDİ AUTHORED renginde bağımsız core/ruleEngine.js ile GERÇEKTEN yasal ve curriculum\'un authored capture listesiyle BİREBİR eşleşen 5 taşı yakalıyor', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  m1.legalCaptureExamples.forEach((ex, i) => {
    const resolved = resolveCaptureExampleMoment(m1, i);
    const bs = seedBoard(resolved.board, resolved.size);
    const target = resolved.targetPoints[0];
    const runtimeColor = toRuntimeColor(resolved.moveColor);
    const check = isValidMove(bs, target.col, target.row, runtimeColor);
    equal(check.valid, true, `örnek ${i} (renk:${resolved.moveColor}) yasal ÇIKMALI`);
    const { captured } = applyMove(bs, target.col, target.row, runtimeColor);
    equal(captured.length, 5, `örnek ${i} 5 taş yakalamalı`);
    const rawMove = l4.steps[1].moves[ex.sourceIndex];
    const capturedKeys = new Set(captured.map(c => `${c.x},${c.y}`));
    for (const c of rawMove.capture) {
      ok(capturedKeys.has(`${c.x},${c.y}`), `örnek ${i}: curriculum'un authored capture noktası (${c.x},${c.y}) GERÇEK sonuçta yok`);
    }
    equal(resolved.expectedCapturedCount, 5, `örnek ${i}`);
    equal(resolved.expectedResultConcept, 'capture', `örnek ${i}`);
  });
});

test('An 2: HER örnek board seed\'i YALNIZ KENDİ formasyonunu içerir — sourceIndex 0 (üst, y<=2) İLE sourceIndex 1 (alt, y>=6) HİÇ TAŞ PAYLAŞMAZ', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  const ex0 = resolveCaptureExampleMoment(m1, 0);
  const ex1 = resolveCaptureExampleMoment(m1, 1);
  ok(ex0.board.every(s => s.y <= 2), 'örnek 0 (üst) board seedinde y>2 taş OLMAMALI');
  ok(ex1.board.every(s => s.y >= 6), 'örnek 1 (alt) board seedinde y<6 taş OLMAMALI');
  equal(ex0.board.length, 12);
  equal(ex1.board.length, 12);
  const keys0 = new Set(ex0.board.map(s => `${s.x},${s.y}`));
  const keys1 = new Set(ex1.board.map(s => `${s.x},${s.y}`));
  for (const k of keys0) ok(!keys1.has(k), `örnek 0/1 ORTAK taş paylaşıyor: ${k}`);
});

/* ══════════════════════════════════════════════════════════════════
   AUTHORED RENK KORUNUMU (bkz. görev talimatı Bölüm 13, 20 madde) —
   renk normalizasyonu TERK EDİLDİ: her örnek curriculum'da yazıldığı
   GERÇEK renklerle çalışır.
   ══════════════════════════════════════════════════════════════════ */

test('1) İki legal-capture örneği vardır', () => {
  const [, m1] = getIllegalMoveMoments();
  equal(m1.legalCaptureExamples.length, 2);
});

test('2) sourceIndex\'ler 0,1', () => {
  const [, m1] = getIllegalMoveMoments();
  equal(m1.legalCaptureExamples.map(e => e.sourceIndex), [0, 1]);
});

test('3) Örnek 0 authored moveColor SİYAH (\'B\')', () => {
  const [, m1] = getIllegalMoveMoments();
  equal(m1.legalCaptureExamples[0].moveColor, 'B');
  equal(l4.steps[1].moves[0].color, 'B'); // curriculum'un KENDİ verisiyle çapraz doğrulama
});

test('4) Örnek 1 authored moveColor BEYAZ (\'W\') — renk-ters-çevirme YOK', () => {
  const [, m1] = getIllegalMoveMoments();
  equal(m1.legalCaptureExamples[1].moveColor, 'W');
  equal(l4.steps[1].moves[1].color, 'W'); // curriculum'un KENDİ verisiyle çapraz doğrulama
});

test('5) Örnek 0 board renkleri curriculum ile BİREBİR (üst formasyon: 5 beyaz hedef + 7 siyah duvar)', () => {
  const [, m1] = getIllegalMoveMoments();
  const ex0 = m1.legalCaptureExamples[0];
  const rawNear = l4.steps[1].board.filter(s => Math.abs(s.y - l4.steps[1].moves[0].y) <= 2);
  const sig = arr => arr.map(s => `${s.color}${s.x},${s.y}`).sort().join('|');
  equal(sig(ex0.board), sig(rawNear));
  equal(ex0.board.filter(s => s.color === 'W').length, 5);
  equal(ex0.board.filter(s => s.color === 'B').length, 7);
});

test('6) Örnek 1 board renkleri curriculum ile BİREBİR (alt formasyon: 7 beyaz duvar + 5 siyah hedef) — RENK TERS ÇEVRİLMEMİŞ', () => {
  const [, m1] = getIllegalMoveMoments();
  const ex1 = m1.legalCaptureExamples[1];
  const rawNear = l4.steps[1].board.filter(s => Math.abs(s.y - l4.steps[1].moves[1].y) <= 2);
  const sig = arr => arr.map(s => `${s.color}${s.x},${s.y}`).sort().join('|');
  equal(sig(ex1.board), sig(rawNear));
  equal(ex1.board.filter(s => s.color === 'W').length, 7);
  equal(ex1.board.filter(s => s.color === 'B').length, 5);
});

test('7) Hiçbir örnekte color inversion YOK — `colorInverted`/`invertStoneColor` policy\'de mevcut DEĞİL', () => {
  const [, m1] = getIllegalMoveMoments();
  ok(!('colorInverted' in m1.legalCaptureExamples[0]));
  ok(!('colorInverted' in m1.legalCaptureExamples[1]));
  const src = deriveLegalCaptureExamples.toString();
  ok(!/invertStoneColor|colorInverted/.test(src), 'deriveLegalCaptureExamples kaynağında renk-ters-çevirme kalıntısı OLMAMALI');
});

test('8) Örnek 0 hedef x/y → row/col dönüşümü doğru (row=y, col=x)', () => {
  const [, m1] = getIllegalMoveMoments();
  const ex0 = m1.legalCaptureExamples[0];
  equal(ex0.targetPointXY, { x: 4, y: 0 });
  equal(ex0.targetPoint, { row: 0, col: 4 });
});

test('9) Örnek 1 hedef x/y → row/col dönüşümü doğru (row=y, col=x)', () => {
  const [, m1] = getIllegalMoveMoments();
  const ex1 = m1.legalCaptureExamples[1];
  equal(ex1.targetPointXY, { x: 4, y: 8 });
  equal(ex1.targetPoint, { row: 8, col: 4 });
});

test('10) Örnek 0 hamlesi legal (GERÇEK RuleEngine, authored siyah rengiyle)', () => {
  const [, m1] = getIllegalMoveMoments();
  const resolved = resolveCaptureExampleMoment(m1, 0);
  const bs = seedBoard(resolved.board, resolved.size);
  const check = isValidMove(bs, resolved.targetPoints[0].col, resolved.targetPoints[0].row, toRuntimeColor(resolved.moveColor));
  equal(check.valid, true);
});

test("11) Örnek 1 hamlesi legal (GERÇEK RuleEngine, authored BEYAZ rengiyle — 'black' varsayılmadan)", () => {
  const [, m1] = getIllegalMoveMoments();
  const resolved = resolveCaptureExampleMoment(m1, 1);
  equal(toRuntimeColor(resolved.moveColor), 'white');
  const bs = seedBoard(resolved.board, resolved.size);
  const check = isValidMove(bs, resolved.targetPoints[0].col, resolved.targetPoints[0].row, 'white');
  equal(check.valid, true);
});

test('12) Örnek 0, 5 BEYAZ taş yakalar (capturedColor:\'W\')', () => {
  const [, m1] = getIllegalMoveMoments();
  const ex0 = m1.legalCaptureExamples[0];
  equal(ex0.capturedColor, 'W');
  equal(ex0.expectedCapturedCount, 5);
});

test('13) Örnek 1, 5 SİYAH taş yakalar (capturedColor:\'B\')', () => {
  const [, m1] = getIllegalMoveMoments();
  const ex1 = m1.legalCaptureExamples[1];
  equal(ex1.capturedColor, 'B');
  equal(ex1.expectedCapturedCount, 5);
});

test('14) Her iki örnekte DOĞRU taş rengi board\'da kalır (yeni yerleşen taş authored moveColor\'ıyla AYNI, GERÇEK applyMove sonrası)', () => {
  const [, m1] = getIllegalMoveMoments();
  m1.legalCaptureExamples.forEach((ex, i) => {
    const resolved = resolveCaptureExampleMoment(m1, i);
    const bs = seedBoard(resolved.board, resolved.size);
    const runtimeColor = toRuntimeColor(resolved.moveColor);
    const { newState } = applyMove(bs, resolved.targetPoints[0].col, resolved.targetPoints[0].row, runtimeColor);
    const placedColor = newState.colorAt(resolved.targetPoints[0].col, resolved.targetPoints[0].row);
    equal(placedColor, runtimeColor, `örnek ${i}: yerleşen taş ${runtimeColor} olmalı`);
  });
});

test('15) Her iki örnekte resultConcept \'capture\'', () => {
  const [, m1] = getIllegalMoveMoments();
  for (const ex of m1.legalCaptureExamples) equal(ex.resultConcept, 'capture');
});

test('16) Policy seed\'i mutate ETMEZ (renk normalizasyonu KALDIRILDIKTAN SONRA da AYNI disiplin)', () => {
  const [, m1] = getIllegalMoveMoments();
  m1.legalCaptureExamples.forEach((ex, i) => {
    const before = boardSignature(ex.board);
    const resolved = resolveCaptureExampleMoment(m1, i);
    evaluateAttempt(resolved, resolved.targetPoints[0]);
    equal(boardSignature(ex.board), before, `örnek ${i}: board seed DEĞİŞMEMELİ`);
  });
});

test('17) Örnek sırası deterministik (art arda iki çağrı AYNI sourceIndex/moveColor sırasını üretir)', () => {
  const a = getIllegalMoveMoments()[1].legalCaptureExamples;
  const b = getIllegalMoveMoments()[1].legalCaptureExamples;
  equal(a.map(e => [e.sourceIndex, e.moveColor]), b.map(e => [e.sourceIndex, e.moveColor]));
});

test('18) Eksik/invalid moveColor issue üretir (deriveLegalCaptureExamples AÇIK Error fırlatır)', () => {
  const step = { text: 'test', size: 9, board: [], moves: [{ color: 'X', x: 4, y: 4, capture: [] }] };
  throws(() => deriveLegalCaptureExamples(step, 1), /geçersiz renk/);
});

test('19) Authored renk ile runtime renk farklıysa issue üretir (sentetik: yakalanan taş hamleyle AYNI renkte olursa Error)', () => {
  // (4,4) beyaz — SİYAH oynarsa GERÇEKTE yasal DEĞİL (intihar), bu yüzden
  // yerine GERÇEKTEN capture yapan ama "capture" alanı BİLEREK YANLIŞ
  // authored bir senaryo kullanılır — GERÇEK sonuç authored'la eşleşmez.
  const step = {
    text: 'test', size: 9,
    board: [{ color: 'W', x: 6, y: 1 }, { color: 'B', x: 5, y: 1 }, { color: 'B', x: 7, y: 1 }, { color: 'B', x: 6, y: 0 }],
    moves: [{ color: 'B', x: 6, y: 2, capture: [{ x: 9, y: 9 }] }], // GERÇEKTE (6,1) yakalanır, authored liste YANLIŞ
  };
  throws(() => deriveLegalCaptureExamples(step, 1), /authored 'capture' alanıyla eşleşmiyor/);
});

test('20) Event metadata için gerekli renkler policy\'den doğru okunur (resolveCaptureExampleMoment moveColor/capturedColor taşır — sahne bunları event payload\'ına DOĞRUDAN kopyalar)', () => {
  const [, m1] = getIllegalMoveMoments();
  const resolved0 = resolveCaptureExampleMoment(m1, 0);
  const resolved1 = resolveCaptureExampleMoment(m1, 1);
  equal(resolved0.moveColor, 'B'); equal(resolved0.capturedColor, 'W');
  equal(resolved1.moveColor, 'W'); equal(resolved1.capturedColor, 'B');
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

test('17/18/19) An 2 HER örneğin (çözümlenmiş) hedef noktası → legal:true, capturedCount:5, isCurriculumTarget:true, resultConcept "capture" (An 1\'in çoklu-hedef mekanizması SIZMADI — HER örnek TEK hedef taşır)', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  m1.legalCaptureExamples.forEach((ex, i) => {
    const resolved = resolveCaptureExampleMoment(m1, i);
    equal(resolved.targetPoints.length, 1, `örnek ${i}: TEK hedef olmalı`);
    const result = evaluateAttempt(resolved, resolved.targetPoints[0]);
    equal(result.legal, true, `örnek ${i}`);
    equal(result.capturedCount, 5, `örnek ${i}`);
    equal(result.isCurriculumTarget, true, `örnek ${i}`);
    equal(resolved.expectedResultConcept, 'capture', `örnek ${i}`);
  });
});

test('20) evaluateAttempt: moment.board ASLA mutate edilmez — art arda iki farklı deneme sonrası board signature AYNI kalır (An 1 + An 2\'nin HER örneği)', () => {
  const moments = getIllegalMoveMoments();
  for (const m of moments) {
    const resolvedList = m.kind === MOMENT_KINDS.LEGAL_CAPTURE
      ? m.legalCaptureExamples.map((_, i) => resolveCaptureExampleMoment(m, i))
      : [m];
    for (const r of resolvedList) {
      const before = boardSignature(r.board);
      evaluateAttempt(r, r.targetPoints[0]);
      evaluateAttempt(r, { row: 8, col: 0 });
      const after = boardSignature(r.board);
      equal(after, before, `step=${r.curriculumStepIndex}: moment.board DEĞİŞMEMELİ`);
    }
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

/* ── deriveLegalCaptureExamples (export edildi — bkz. görev talimatı Bölüm
   14: "eksik formasyon issue üretiyor", "capture yapmayan örnek issue
   üretiyor", "bir örnek sessizce filtrelenemiyor"). İKİ BAĞIMSIZ (y=0-2 VE
   y=6-8, curriculum'un GERÇEK yerleşimiyle AYNI ilke — bkz. dosya başı
   not) sentetik formasyon kullanır: her ikisi de tek-taş atari yakalaması,
   GERÇEK isValidMove/applyMove ile bağımsızca doğrulanabilir. ── */
const TWO_ZONE_CAPTURE_BOARD = [
  { color: 'W', x: 6, y: 1 }, { color: 'B', x: 5, y: 1 }, { color: 'B', x: 7, y: 1 }, { color: 'B', x: 6, y: 0 },
  { color: 'W', x: 6, y: 7 }, { color: 'B', x: 5, y: 7 }, { color: 'B', x: 7, y: 7 }, { color: 'B', x: 6, y: 8 },
];
const TWO_ZONE_CAPTURE_MOVES = [
  { color: 'B', x: 6, y: 2, capture: [{ x: 6, y: 1 }] },
  { color: 'B', x: 6, y: 6, capture: [{ x: 6, y: 7 }] },
];

test('21) deriveLegalCaptureExamples: gerçek curriculum örnek sayısı doğru (l4.steps[1].moves.length ile BİREBİR) VE bütün sourceIndex\'ler korunur — hiçbir örnek sessizce filtrelenmez', () => {
  const step = { text: 'test', size: 9, board: TWO_ZONE_CAPTURE_BOARD, moves: TWO_ZONE_CAPTURE_MOVES };
  const examples = deriveLegalCaptureExamples(step, 1);
  equal(examples.length, 2);
  equal(examples.map(e => e.sourceIndex), [0, 1]);
});

test('22) deriveLegalCaptureExamples: örnek SIRASI deterministik — art arda iki çağrı AYNI sırayı üretir', () => {
  const step = { text: 'test', size: 9, board: TWO_ZONE_CAPTURE_BOARD, moves: TWO_ZONE_CAPTURE_MOVES };
  const a = deriveLegalCaptureExamples(step, 1);
  const b = deriveLegalCaptureExamples(step, 1);
  equal(a.map(e => e.targetPoint), b.map(e => e.targetPoint));
});

test('23) deriveLegalCaptureExamples: HER örneğin board seed\'i geçerli, hedefi tahta içinde VE boş, hamlesi GERÇEKTEN yasal, GERÇEKTEN capture yapıyor, capturedCount doğru', () => {
  const step = { text: 'test', size: 9, board: TWO_ZONE_CAPTURE_BOARD, moves: TWO_ZONE_CAPTURE_MOVES };
  const examples = deriveLegalCaptureExamples(step, 1);
  for (const ex of examples) {
    const bs = seedBoard(ex.board, ex.size);
    ok(bs.isInBounds(ex.targetPoint.col, ex.targetPoint.row), 'hedef tahta içinde olmalı');
    ok(!bs.isOccupied(ex.targetPoint.col, ex.targetPoint.row), 'hedef boş olmalı');
    const check = isValidMove(bs, ex.targetPoint.col, ex.targetPoint.row, 'black');
    equal(check.valid, true);
    const { captured } = applyMove(bs, ex.targetPoint.col, ex.targetPoint.row, 'black');
    equal(captured.length, 1);
    equal(ex.expectedCapturedCount, 1);
    equal(ex.resultConcept, 'capture');
  }
});

test('24) deriveLegalCaptureExamples: policy hiçbir seed\'i mutate ETMEZ — iki örneği art arda değerlendirmek board imzalarını DEĞİŞTİRMEZ', () => {
  const step = { text: 'test', size: 9, board: TWO_ZONE_CAPTURE_BOARD, moves: TWO_ZONE_CAPTURE_MOVES };
  const examples = deriveLegalCaptureExamples(step, 1);
  const sigsBefore = examples.map(e => boardSignature(e.board));
  for (const ex of examples) {
    const bs = seedBoard(ex.board, ex.size);
    applyMove(bs, ex.targetPoint.col, ex.targetPoint.row, 'black'); // bs kendi KOPYASI — ex.board'a dokunmaz
  }
  const sigsAfter = examples.map(e => boardSignature(e.board));
  equal(sigsAfter, sigsBefore);
});

test('25) deriveLegalCaptureExamples: örneklerin BAĞIMSIZLIĞI — sırayı TERSİNE çevirmek (örnek1 önce değerlendirilse) SONUCU DEĞİŞTİRMEZ (iki hamle sırasıyla doğrulama)', () => {
  const step = { text: 'test', size: 9, board: TWO_ZONE_CAPTURE_BOARD, moves: TWO_ZONE_CAPTURE_MOVES };
  const examples = deriveLegalCaptureExamples(step, 1);
  const evalInOrder = (order) => order.map(i => {
    const ex = examples[i];
    const bs = seedBoard(ex.board, ex.size);
    const { captured } = applyMove(bs, ex.targetPoint.col, ex.targetPoint.row, 'black');
    return captured.length;
  });
  equal(evalInOrder([0, 1]), evalInOrder([1, 0]), 'sıra SONUCU etkilememeli — örnekler bağımsız');
});

test('26) deriveLegalCaptureExamples: "moves" dizisi boş/yok → açık Error (eksik formasyon SESSİZCE geçilmez)', () => {
  const step = { text: 'test', size: 9, board: [], moves: [] };
  throws(() => deriveLegalCaptureExamples(step, 1), /'moves' dizisi boş\/yok/);
});

test('27) deriveLegalCaptureExamples: hedef hamle GERÇEKTE yasal DEĞİLSE (SUICIDE) açık Error fırlatır', () => {
  // (4,4) dört siyahla çevrili boş nokta — beyaz oynarsa GERÇEK intihar (yakalama YOK).
  const step = {
    text: 'test', size: 9,
    board: [{ color: 'B', x: 4, y: 3 }, { color: 'B', x: 3, y: 4 }, { color: 'B', x: 5, y: 4 }, { color: 'B', x: 4, y: 5 }],
    moves: [{ color: 'W', x: 4, y: 4, capture: [] }],
  };
  throws(() => deriveLegalCaptureExamples(step, 1), /yasal DEĞİL/);
});

test('28) deriveLegalCaptureExamples: hedef hamle yasal AMA hiçbir taş YAKALAMIYORSA açık Error fırlatır ("legal_capture" en az bir yakalama gerektirir)', () => {
  const step = {
    text: 'test', size: 9,
    // (0,4) uzak, İLGİSİZ bir beyaz taş — yalnız "bağlamsal taş VAR" koşulunu
    // sağlamak için (bkz. deriveLegalCaptureExamples "hiçbir GERÇEK bağlamsal
    // taş bulunamadı" ön koşulu), hedefe KOMŞU DEĞİL, yakalanmaz.
    board: [{ color: 'W', x: 0, y: 4 }],
    moves: [{ color: 'B', x: 4, y: 4, capture: [] }], // normal hamle — capture YOK
  };
  throws(() => deriveLegalCaptureExamples(step, 1), /hiçbir taş YAKALAMIYOR/);
});

test('29) deriveLegalCaptureExamples: GERÇEK capture sonucu curriculum\'un authored "capture" alanıyla eşleşmiyorsa açık Error fırlatır (yanlış/eksik authored liste sessizce KABUL edilmez)', () => {
  const step = {
    text: 'test', size: 9,
    board: TWO_ZONE_CAPTURE_BOARD,
    moves: [{ color: 'B', x: 6, y: 2, capture: [{ x: 9, y: 9 }] }], // GERÇEKTE (6,1) yakalanıyor, authored liste YANLIŞ
  };
  throws(() => deriveLegalCaptureExamples(step, 1), /authored 'capture' alanıyla eşleşmiyor/);
});

test('30) deriveLegalCaptureExamples: duplicate (aynı board+hedef) örnek açık Error fırlatır — sessizce yutulmaz', () => {
  const step = {
    text: 'test', size: 9,
    board: [{ color: 'W', x: 6, y: 1 }, { color: 'B', x: 5, y: 1 }, { color: 'B', x: 7, y: 1 }, { color: 'B', x: 6, y: 0 }],
    moves: [
      { color: 'B', x: 6, y: 2, capture: [{ x: 6, y: 1 }] },
      { color: 'B', x: 6, y: 2, capture: [{ x: 6, y: 1 }] }, // BİREBİR aynı hedef+formasyon tekrar
    ],
  };
  throws(() => deriveLegalCaptureExamples(step, 1), /DUPLICATE/);
});

test('31) deriveLegalCaptureExamples: geçersiz renk (ne B ne W) açık Error fırlatır', () => {
  const step = { text: 'test', size: 9, board: [], moves: [{ color: 'X', x: 4, y: 4, capture: [] }] };
  throws(() => deriveLegalCaptureExamples(step, 1), /geçersiz renk/);
});

test('32) resolveCaptureExampleMoment: geçersiz exampleIndex açık Error fırlatır (sessizce undefined DÖNMEZ)', () => {
  const moments = getIllegalMoveMoments();
  const m1 = moments[1];
  throws(() => resolveCaptureExampleMoment(m1, 99), /geçersiz legalCaptureExamples index/);
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
