/**
 * tests/capturePracticePolicy.test.js
 * node tests/capturePracticePolicy.test.js
 *
 * scenes/capturePracticePolicy.js — DOM'suz, saf değerlendirme politikası.
 * core/curriculum.js l3 dersinin GERÇEK (production) steps[3..8] verisini
 * kullanır — synthetic fixture DEĞİL (edge-case testleri HARİÇ, bkz. dosya
 * altı), bkz. tests/capturePolicy.test.js ile AYNI disiplin.
 */
import assert from 'node:assert/strict';
import {
  MOMENT_STEP_INDICES, MOMENT_COUNT, HINT_MODES, getCapturePracticeMoments,
  normalizeBoardSeed, resolveTargetGroup, computeHintMode, computeMomentConcept,
  isValidCapturePoint, computePracticeResult, buildResultText, isKnownHintMode,
} from '../scenes/capturePracticePolicy.js';
import { findAtariGroups } from '../core/captureObservation.js';
import { defaultConceptForLesson } from '../core/conceptMap.js';
import { BoardState } from '../core/boardState.js';
import { applyMove } from '../core/ruleEngine.js';

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

test('MOMENT_STEP_INDICES = [3,4,5,6,7,8] (l3 kullanıcıya görünen 4-9. adımlar)', () => {
  equal(MOMENT_STEP_INDICES, [3, 4, 5, 6, 7, 8]);
  equal(MOMENT_COUNT, 6);
});

test('getCapturePracticeMoments() curriculum sırasıyla TAM 6 öğe döner', () => {
  const moments = getCapturePracticeMoments();
  equal(moments.length, 6);
  equal(moments.map(m => m.curriculumStepIndex), [3, 4, 5, 6, 7, 8]);
  equal(moments.map(m => m.momentIndex), [0, 1, 2, 3, 4, 5]);
});

test('hedef grup boyutu curriculum\'un GERÇEK authored sırasıyla 1,1,2,2,2,5', () => {
  const moments = getCapturePracticeMoments();
  equal(moments.map(m => m.targetGroupSize), [1, 1, 2, 2, 2, 5]);
});

const EXPECTED = [
  { visible: 4, stepIndex: 3, size: 1, lastLib: { row: 1, col: 0 } },
  { visible: 5, stepIndex: 4, size: 1, lastLib: { row: 1, col: 4 } },
  { visible: 6, stepIndex: 5, size: 2, lastLib: { row: 6, col: 4 } },
  { visible: 7, stepIndex: 6, size: 2, lastLib: { row: 0, col: 6 } },
  { visible: 8, stepIndex: 7, size: 2, lastLib: { row: 1, col: 7 } },
  { visible: 9, stepIndex: 8, size: 5, lastLib: { row: 3, col: 3 } },
];

for (const exp of EXPECTED) {
  test(`görünen adım ${exp.visible} (stepIndex ${exp.stepIndex}): GERÇEK hedef grup boyutu ${exp.size}, son nefes curriculum answer ile AYNI`, () => {
    const moments = getCapturePracticeMoments();
    const m = moments.find(x => x.curriculumStepIndex === exp.stepIndex);
    ok(m, 'moment bulunamadı');
    equal(m.targetGroupSize, exp.size);
    equal(m.lastLibertyPoints, [exp.lastLib]);
    equal(m.curriculumStatedAnswer, exp.lastLib);
    ok(isValidCapturePoint(m, exp.lastLib));
    ok(!isValidCapturePoint(m, { row: 0, col: 0 }) || (exp.lastLib.row === 0 && exp.lastLib.col === 0), 'uzak nokta reddedilmeli');
  });
}

test('görünen adım 7 (stepIndex6): board seed SALDIRAN taşlarla BAŞLAR — anchor tespiti dizilim SIRASINDAN bağımsız', () => {
  const moments = getCapturePracticeMoments();
  const m = moments.find(x => x.curriculumStepIndex === 6);
  equal(m.board[0].color, 'B');
  equal(m.targetGroupSize, 2);
  equal(m.lastLibertyPoints, [{ row: 0, col: 6 }]);
});
test('görünen adım 8 (stepIndex7): board seed SALDIRAN taşlarla BAŞLAR — anchor tespiti dizilim SIRASINDAN bağımsız', () => {
  const moments = getCapturePracticeMoments();
  const m = moments.find(x => x.curriculumStepIndex === 7);
  equal(m.board[0].color, 'B');
  equal(m.targetGroupSize, 2);
});
test('görünen adım 9 (stepIndex8): board seed SALDIRAN taşlarla BAŞLAR (8 siyah taş) — L-şekil 5 taşlı grup doğru bulunur', () => {
  const moments = getCapturePracticeMoments();
  const m = moments.find(x => x.curriculumStepIndex === 8);
  equal(m.board[0].color, 'B');
  equal(m.targetGroupSize, 5);
});

test('her altı an da GERÇEK olarak TEK nefes noktasına indirgenir (atari senaryosu) — sabit varsayım DEĞİL', () => {
  const moments = getCapturePracticeMoments();
  for (const m of moments) equal(m.lastLibertyPoints.length, 1, `step=${m.curriculumStepIndex}`);
});

test('assessmentConcept HER ALTI anda "atari" — core/captureObservation.js ile ÇAPRAZ DOĞRULAMA', () => {
  const moments = getCapturePracticeMoments();
  for (const m of moments) {
    equal(m.assessmentConcept, 'atari');
    const bs = seedBoard(m.board, m.size);
    const atariGroups = findAtariGroups(bs);
    const target = m.lastLibertyPoints[0];
    const matching = atariGroups.find(g => g.color === 'white' &&
      g.liberties.some(l => l.x === target.col && l.y === target.row));
    ok(matching, `step=${m.curriculumStepIndex}: findAtariGroups AYNI son nefes noktasını bulmalı`);
  }
});

test('sahne-seviyesi (primary) concept — core/conceptMap.js defaultConceptForLesson("l3") ile AYNI ("capture")', () => {
  equal(defaultConceptForLesson('l3'), 'capture');
});

test('expectedResultConcept HER ALTI anda "capture" — GERÇEK applyMove sonucundan', () => {
  const moments = getCapturePracticeMoments();
  for (const m of moments) {
    equal(m.expectedResultConcept, 'capture', `step=${m.curriculumStepIndex}`);
    const bs = seedBoard(m.board, m.size);
    const target = m.lastLibertyPoints[0];
    const { captured } = applyMove(bs, target.col, target.row, 'black');
    equal(captured.length, m.targetGroupSize, `step=${m.curriculumStepIndex}: yakalanan taş sayısı hedef grup boyutuyla eşleşmeli`);
  }
});

test('computePracticeResult: doğru noktada hedef grup TAM OLARAK kalkar, capturedCount === targetGroupSize', () => {
  const moments = getCapturePracticeMoments();
  for (const m of moments) {
    const target = m.lastLibertyPoints[0];
    const result = computePracticeResult(m, target);
    equal(result.capturedCount, m.targetGroupSize, `step=${m.curriculumStepIndex}`);
    ok(result.targetRemovedFromBoard, `step=${m.curriculumStepIndex}: hedef grup tahtadan kalkmalı`);
  }
});

test('yanlış (hedef-dışı gerçek) bir noktaya oynansa bile board SEED kendisi değişmez — computePracticeResult BAĞIMSIZ bir simülasyon üzerinde çalışır', () => {
  const moments = getCapturePracticeMoments();
  const m = moments[0];
  const before = JSON.stringify(m.board);
  computePracticeResult(m, m.lastLibertyPoints[0]);
  equal(JSON.stringify(m.board), before, 'moment.board mutate edilmemeli');
});

test('hintMode dağılımı: immediate, after_mistake, on_request, on_request, after_mistake, none_until_request', () => {
  const moments = getCapturePracticeMoments();
  equal(moments.map(m => m.hintMode), [
    HINT_MODES.IMMEDIATE, HINT_MODES.AFTER_MISTAKE, HINT_MODES.ON_REQUEST,
    HINT_MODES.ON_REQUEST, HINT_MODES.AFTER_MISTAKE, HINT_MODES.NONE_UNTIL_REQUEST,
  ]);
});

test('computeHintMode: momentIndex+targetGroupSize\'a göre HER dal test edilebilir (bkz. görev talimatı: "körlemesine hard-code etme")', () => {
  equal(computeHintMode(0, 1), HINT_MODES.IMMEDIATE);
  equal(computeHintMode(1, 1), HINT_MODES.AFTER_MISTAKE);
  equal(computeHintMode(2, 2), HINT_MODES.ON_REQUEST);
  equal(computeHintMode(3, 2), HINT_MODES.ON_REQUEST);
  equal(computeHintMode(4, 2), HINT_MODES.AFTER_MISTAKE);
  equal(computeHintMode(5, 5), HINT_MODES.NONE_UNTIL_REQUEST);
});

test('isKnownHintMode: dört bilinen değeri kabul eder, bilinmeyeni reddeder', () => {
  for (const mode of Object.values(HINT_MODES)) ok(isKnownHintMode(mode), mode);
  ok(!isKnownHintMode('unknown_mode'));
  ok(!isKnownHintMode(undefined));
});

test('buildResultText: tek taşta özel ifade, grupta GERÇEK sayıyla üretilir (statik metinden DEĞİL)', () => {
  equal(buildResultText(1), 'Doğru. Taşın son nefes noktası kapandı ve taş alındı.');
  equal(buildResultText(2), 'Doğru. 2 taşlık grup tahtadan alındı.');
  equal(buildResultText(5), 'Doğru. 5 taşlık grup tahtadan alındı.');
});

test('terminoloji: promptText/feedbackOk/feedbackErr hiçbirinde "özgürlük"/"serbestlik" YOK', () => {
  const moments = getCapturePracticeMoments();
  for (const m of moments) {
    const combined = `${m.promptText} ${m.feedbackOk || ''} ${m.feedbackErr || ''}`;
    ok(!/özgürlük|serbestlik/i.test(combined), `step=${m.curriculumStepIndex}: yasak terminoloji sızmış: "${combined}"`);
  }
});

test('getCapturePracticeMoments() SAF — art arda iki çağrı AYNI sonucu üretir (yan etki/mutasyon YOK)', () => {
  const a = getCapturePracticeMoments();
  const b = getCapturePracticeMoments();
  equal(a, b);
});

/* ══════════════════════════════════════════════════════════════════
   Edge-case testleri — synthetic fixture'larla (bkz. görev talimatı
   Bölüm 14: "birden fazla beyaz grup", "birden fazla atari grubu",
   "geçersiz/missing answer", "answer yasal fakat hedef grubu almıyor",
   "target group bulunamıyor", "hedef grup birden fazla nefese sahip",
   "dolu answer noktası", "duplicate board noktası", "yanlış renk/sıra").
   ══════════════════════════════════════════════════════════════════ */

test('EDGE: birden fazla BAĞIMSIZ beyaz grup, yalnız biri atari — atari OLAN doğru bulunur', () => {
  // Grup A: köşe (0,0), tek nefes (0,1)/(1,0) — biri kapatılmış.
  const seed = [
    { color: 'W', x: 0, y: 0 }, { color: 'B', x: 1, y: 0 }, // atari: son nefes (0,1)
    { color: 'W', x: 8, y: 8 }, // ataride DEĞİL — 2 nefesi var ((8,7) ve (7,8))
  ];
  const target = resolveTargetGroup(seed, 9, { x: 0, y: 1 });
  equal(target.points, [{ x: 0, y: 0 }]);
  equal(target.liberties, [{ x: 0, y: 1 }]);
});

test('EDGE: birden fazla ATARİ grubu — curriculum answer\'ın GERÇEKTEN kaldırdığı grup seçilir (tahmin DEĞİL)', () => {
  const seedA = [{ color: 'W', x: 0, y: 0 }, { color: 'B', x: 1, y: 0 }]; // atari, son nefes (0,1)
  const seedB = [{ color: 'W', x: 8, y: 8 }, { color: 'B', x: 7, y: 8 }]; // atari, son nefes (8,7)
  const combined = [...seedA, ...seedB];
  const targetB = resolveTargetGroup(combined, 9, { x: 8, y: 7 });
  equal(targetB.points, [{ x: 8, y: 8 }]);
  const targetA = resolveTargetGroup(combined, 9, { x: 0, y: 1 });
  equal(targetA.points, [{ x: 0, y: 0 }]);
});

test('EDGE: birden fazla atari adayı + answer YOK — açık, tanımlayıcı Error fırlatılır (çökme yerine)', () => {
  const seedA = [{ color: 'W', x: 0, y: 0 }, { color: 'B', x: 1, y: 0 }];
  const seedB = [{ color: 'W', x: 8, y: 8 }, { color: 'B', x: 7, y: 8 }];
  throws(() => resolveTargetGroup([...seedA, ...seedB], 9, null), /birden fazla atari adayı var ama curriculum answer yok/);
});

test('EDGE: target group bulunamıyor (hiç atari grubu yok) — açık Error fırlatılır', () => {
  throws(() => resolveTargetGroup([], 9, null), /atari'de beyaz grup bulunamadı/);
});

test('EDGE: hedef grup birden fazla nefese sahip (atari DEĞİL) — "bulunamadı" olarak raporlanır', () => {
  // Tek beyaz taş, YALNIZ bir komşusu siyah — 3 nefesi kalır, atari DEĞİL.
  const seed = [{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 4, y: 3 }];
  throws(() => resolveTargetGroup(seed, 9, null), /atari'de beyaz grup bulunamadı/);
});

test('EDGE: answer yasal fakat HİÇBİR atari adayının tamamını kaldırmıyor — açık Error fırlatılır', () => {
  const seedA = [{ color: 'W', x: 0, y: 0 }, { color: 'B', x: 1, y: 0 }]; // atari (0,1)
  const seedB = [{ color: 'W', x: 8, y: 8 }, { color: 'B', x: 7, y: 8 }]; // atari (8,7)
  // Yasal ama alakasız bir boş noktaya oynanırsa hiçbir grubu YAKALAMAZ.
  throws(() => resolveTargetGroup([...seedA, ...seedB], 9, { x: 4, y: 4 }), /hiçbir atari adayının TAMAMINI kaldırmıyor/);
});

test('EDGE: curriculum answer YASAL DEĞİLSE (ör. dolu noktaya işaret ediyorsa) açık Error fırlatılır', () => {
  const seedA = [{ color: 'W', x: 0, y: 0 }, { color: 'B', x: 1, y: 0 }];
  const seedB = [{ color: 'W', x: 8, y: 8 }, { color: 'B', x: 7, y: 8 }];
  // (1,0) zaten dolu — yasa dışı "answer".
  throws(() => resolveTargetGroup([...seedA, ...seedB], 9, { x: 1, y: 0 }), /yasal değil/);
});

test('EDGE: normalizeBoardSeed — duplicate board noktası açık Error fırlatır', () => {
  throws(() => normalizeBoardSeed([{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 4, y: 4 }]), /duplicate board noktası/);
});

test('EDGE: normalizeBoardSeed — geçersiz/bilinmeyen renk açık Error fırlatır (yanlış renk/sıra)', () => {
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

test('EDGE: computeMomentConcept — geçerli tek-atari seed için "atari" döner', () => {
  const seed = [{ color: 'W', x: 0, y: 0 }, { color: 'B', x: 1, y: 0 }];
  equal(computeMomentConcept(seed, 9, { x: 0, y: 1 }), 'atari');
});

test('isValidCapturePoint: null/undefined nokta güvenle reddedilir', () => {
  const [m] = getCapturePracticeMoments();
  ok(!isValidCapturePoint(m, null));
  ok(!isValidCapturePoint(m, undefined));
});

console.log(`\ncapturePracticePolicy test sayısı: ${passed + failed}`);
console.log('özet:', `${passed}/${passed + failed}`);
if (failed) process.exit(1);
