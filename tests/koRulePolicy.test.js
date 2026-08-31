/**
 * tests/koRulePolicy.test.js
 * node tests/koRulePolicy.test.js
 *
 * scenes/koRulePolicy.js — DOM'suz, saf değerlendirme politikası.
 * core/curriculum.js l5 dersinin GERÇEK (production) steps[0..1] verisini
 * kullanır — synthetic fixture DEĞİL (edge-case testleri HARİÇ, bkz. dosya
 * altı), bkz. tests/illegalMovePolicy.test.js İLE AYNI disiplin.
 */
import assert from 'node:assert/strict';
import {
  MOMENT_STEP_INDICES, MOMENT_COUNT, MOMENT_KINDS, CONCEPT, KO_ATTEMPT_COLOR,
  getKoRuleMoments, normalizeBoardSeed, evaluateKoAttempt, isSuccessfulAttempt,
  boardSignature, reasonLabelTr, isKnownMomentKind, pointKey,
  computeCaptureOrigin, normalizeRejectMoment, normalizeRetakeMoment,
} from '../scenes/koRulePolicy.js';
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

const l5 = CURRICULUM.flatMap(c => c.lessons).find(l => l.id === 'l5');

test('MOMENT_STEP_INDICES = [0,1] (l5 kullanıcıya görünen 1-2. adımlar)', () => {
  equal(MOMENT_STEP_INDICES, [0, 1]);
  equal(MOMENT_COUNT, 2);
});

test('CONCEPT = "ko", KO_ATTEMPT_COLOR = "white"', () => {
  equal(CONCEPT, 'ko');
  equal(KO_ATTEMPT_COLOR, 'white');
});

test('getKoRuleMoments() curriculum sırasıyla TAM 2 öğe döner', () => {
  const moments = getKoRuleMoments();
  equal(moments.length, 2);
  equal(moments.map(m => m.curriculumStepIndex), [0, 1]);
  equal(moments.map(m => m.momentIndex), [0, 1]);
});

test('An 1 kind:"ko_reject", An 2 kind:"ko_retake" — İKİ FARKLI GERÇEK durum', () => {
  const moments = getKoRuleMoments();
  equal(moments[0].kind, MOMENT_KINDS.REJECT);
  equal(moments[1].kind, MOMENT_KINDS.RETAKE);
});

test('An 1: ko noktası curriculum\'un KENDİ yakalama hamlesinin GERÇEK sonucundan türer (hard-code DEĞİL)', () => {
  const [reject] = getKoRuleMoments();
  const captureMove = l5.steps[0].moves.find(m => m.color === 'B');
  equal(reject.koPoint, { row: captureMove.capture[0].y, col: captureMove.capture[0].x });
});

test('An 1 ve An 2 AYNI fiziksel ko noktasını işaret eder', () => {
  const [reject, retake] = getKoRuleMoments();
  equal(reject.koPoint, retake.koPoint);
});

test('An 1: ko noktasına BEYAZ hamle GERÇEKTEN KO reason\'ıyla reddedilir, isTarget:true, isSuccessfulAttempt:true', () => {
  const [reject] = getKoRuleMoments();
  const attempt = evaluateKoAttempt(reject, reject.koPoint);
  equal(attempt.legal, false);
  equal(attempt.reason, 'KO');
  equal(attempt.isTarget, true);
  equal(attempt.capturedCount, 0);
  ok(isSuccessfulAttempt(reject, attempt), 'ko noktasındaki deneme başarılı sayılmalı');
});

test('An 1: hedef-dışı GERÇEK bir nokta (boş köşe) isTarget:false, isSuccessfulAttempt:false', () => {
  const [reject] = getKoRuleMoments();
  const farCorner = { row: 8, col: 0 };
  const attempt = evaluateKoAttempt(reject, farCorner);
  equal(attempt.isTarget, false);
  ok(!isSuccessfulAttempt(reject, attempt), 'hedef-dışı nokta başarılı SAYILMAMALI');
});

test('An 1: evaluateKoAttempt board seed\'ini MUTATE ETMEZ (imza ÖNCESİ/SONRASI aynı)', () => {
  const [reject] = getKoRuleMoments();
  const sigBefore = boardSignature(reject.boardAfterSetup);
  evaluateKoAttempt(reject, reject.koPoint);
  evaluateKoAttempt(reject, { row: 0, col: 0 });
  const sigAfter = boardSignature(reject.boardAfterSetup);
  equal(sigBefore, sigAfter);
});

test('An 2: ko noktasına BEYAZ hamle GERÇEKTEN kabul edilir, curriculum\'un authored capture alanıyla eşleşir', () => {
  const [, retake] = getKoRuleMoments();
  const retakeMove = l5.steps[1].moves[2];
  const attempt = evaluateKoAttempt(retake, retake.koPoint);
  equal(attempt.legal, true);
  equal(attempt.reason, null);
  equal(attempt.isTarget, true);
  equal(attempt.capturedCount, retakeMove.capture.length);
  equal(
    [...attempt.captured].sort((a, b) => a.row - b.row || a.col - b.col),
    retakeMove.capture.map(c => ({ row: c.y, col: c.x })).sort((a, b) => a.row - b.row || a.col - b.col),
  );
  ok(isSuccessfulAttempt(retake, attempt), 'geri alma denemesi başarılı sayılmalı');
});

test('An 2: expectedCapturedCount GERÇEK yakalama sayısıyla (1) eşleşir', () => {
  const [, retake] = getKoRuleMoments();
  equal(retake.expectedCapturedCount, 1);
});

test('An 2: hedef-dışı GERÇEK bir nokta isTarget:false, isSuccessfulAttempt:false', () => {
  const [, retake] = getKoRuleMoments();
  const farCorner = { row: 8, col: 0 };
  const attempt = evaluateKoAttempt(retake, farCorner);
  equal(attempt.isTarget, false);
  ok(!isSuccessfulAttempt(retake, attempt), 'hedef-dışı nokta başarılı SAYILMAMALI');
});

test('reasonLabelTr("KO") görev talimatında BİREBİR istenen Türkçe metni döner', () => {
  equal(reasonLabelTr('KO'), 'Ko kuralı — bu hamle tahtayı önceki pozisyona döndürür; hemen oynanamaz.');
});

test('reasonLabelTr bilinmeyen bir reason için açık bir "bilinmeyen" metni döner (sessizce yanlış YANITLAMAZ)', () => {
  ok(/bilinmeyen/i.test(reasonLabelTr('SOME_UNKNOWN_REASON')));
});

test('isKnownMomentKind yalnız ko_reject/ko_retake için true döner', () => {
  ok(isKnownMomentKind(MOMENT_KINDS.REJECT));
  ok(isKnownMomentKind(MOMENT_KINDS.RETAKE));
  ok(!isKnownMomentKind('something_else'));
});

test('pointKey deterministik "row,col" formatı üretir', () => {
  equal(pointKey({ row: 4, col: 5 }), '4,5');
});

test('normalizeBoardSeed geçersiz renk için throw eder', () => {
  throws(() => normalizeBoardSeed([{ color: 'X', x: 0, y: 0 }]), /geçersiz taş rengi/);
});

test('normalizeBoardSeed duplicate koordinat için throw eder', () => {
  throws(() => normalizeBoardSeed([{ color: 'B', x: 1, y: 1 }, { color: 'W', x: 1, y: 1 }]), /duplicate board noktası/);
});

/* ══════════════════════════════════════ EDGE: computeCaptureOrigin/normalizeRejectMoment ══ */

test('EDGE: yakalama hamlesi (moves) yoksa throw eder', () => {
  const badStep = { board: l5.steps[0].board, moves: [], size: 9 };
  throws(() => computeCaptureOrigin(badStep, 99), /siyah yakalama hamlesi/);
});

test('EDGE: yakalama hamlesi TAM 1 taş yakalamıyorsa throw eder (0 taş — legal ama capture yok)', () => {
  // Boş bir noktaya (yakalama YOK) "yakalama hamlesi" gibi davranan sentetik veri.
  const badStep = {
    board: [{ color: 'B', x: 0, y: 0 }],
    moves: [{ color: 'B', x: 4, y: 4 }], // yakalama üretmeyen, sıradan bir hamle
    size: 9,
  };
  throws(() => computeCaptureOrigin(badStep, 99), /TAM OLARAK bir taş yakalamalı|yasal DEĞİL/);
});

test('EDGE: yakalama hamlesi GERÇEKTEN ko üretmiyorsa (2+ taş yakalama) throw eder', () => {
  // İki beyaz taşı birden yakalayan bir siyah hamle — tek-taş ko önkoşulunu bozar.
  const badStep = {
    board: [
      { color: 'W', x: 3, y: 0 }, { color: 'W', x: 5, y: 0 },
      { color: 'B', x: 2, y: 0 }, { color: 'B', x: 6, y: 0 },
      { color: 'B', x: 3, y: 1 }, { color: 'B', x: 4, y: 1 }, { color: 'B', x: 5, y: 1 },
    ],
    moves: [{ color: 'B', x: 4, y: 0 }],
    size: 9,
  };
  throws(() => computeCaptureOrigin(badStep, 99), /TAM OLARAK bir taş yakalamalı/);
});

test('EDGE: normalizeRejectMoment — ko noktası GERÇEKTEN KO reddiyle sonuçlanmıyorsa throw eder (origin bozulmuş)', () => {
  const origin = computeCaptureOrigin(l5.steps[0], 0);
  const brokenOrigin = { ...origin, koPoint: { row: 0, col: 0 } }; // GERÇEK ko noktasından FARKLI, sahte bir nokta
  throws(() => normalizeRejectMoment(brokenOrigin, l5.steps[0], 0, 0), /beklenen KO reddiyle sonuçlanmadı/);
});

/* ══════════════════════════════════════ EDGE: normalizeRetakeMoment ══ */

const REAL_ORIGIN = computeCaptureOrigin(l5.steps[0], 0);

test('EDGE: retake — üçten az scripted hamle varsa throw eder', () => {
  const badStep = { ...l5.steps[1], moves: l5.steps[1].moves.slice(0, 2) };
  throws(() => normalizeRetakeMoment(REAL_ORIGIN, badStep, 1, 1), /en az üç scripted hamle/);
});

test('EDGE: retake — ilk hamle beyaz DEĞİLSE throw eder', () => {
  const badStep = { ...l5.steps[1], moves: [{ ...l5.steps[1].moves[0], color: 'B' }, l5.steps[1].moves[1], l5.steps[1].moves[2]] };
  throws(() => normalizeRetakeMoment(REAL_ORIGIN, badStep, 1, 1), /ilk scripted hamle BEYAZ/);
});

test('EDGE: retake — ikinci hamle siyah DEĞİLSE throw eder', () => {
  const badStep = { ...l5.steps[1], moves: [l5.steps[1].moves[0], { ...l5.steps[1].moves[1], color: 'W' }, l5.steps[1].moves[2]] };
  throws(() => normalizeRetakeMoment(REAL_ORIGIN, badStep, 1, 1), /ikinci scripted hamle SİYAH/);
});

test('EDGE: retake — geri alma hedefi An 1\'in ko noktasıyla uyuşmuyorsa throw eder', () => {
  const badStep = { ...l5.steps[1], moves: [l5.steps[1].moves[0], l5.steps[1].moves[1], { ...l5.steps[1].moves[2], x: 0, y: 0 }] };
  throws(() => normalizeRetakeMoment(REAL_ORIGIN, badStep, 1, 1), /UYUŞMUYOR/);
});

test('EDGE: retake — authored board seed An 1\'in yakalama-sonrası durumuyla eşleşmiyorsa throw eder', () => {
  const badStep = { ...l5.steps[1], board: [...l5.steps[1].board, { color: 'B', x: 8, y: 8 }] };
  throws(() => normalizeRetakeMoment(REAL_ORIGIN, badStep, 1, 1), /GERÇEK durumuyla eşleşmiyor/);
});

test('EDGE: retake — ko noktası başlangıçta yasak DEĞİLSE (bozuk origin) throw eder', () => {
  // Ko bayrağı OLMAYAN taze bir origin — ko noktası serbestmiş gibi davranır.
  const freeOrigin = { ...REAL_ORIGIN, afterCaptureState: (() => {
    const clone = REAL_ORIGIN.afterCaptureState.clone();
    clone.koPoint = null;
    return clone;
  })() };
  throws(() => normalizeRetakeMoment(freeOrigin, l5.steps[1], 1, 1), /başlangıçta yasak DEĞİL/);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
