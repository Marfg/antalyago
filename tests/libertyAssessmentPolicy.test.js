/**
 * tests/libertyAssessmentPolicy.test.js
 * node tests/libertyAssessmentPolicy.test.js
 *
 * scenes/libertyAssessmentPolicy.js — DOM'suz, saf değerlendirme politikası.
 * core/curriculum.js l2 dersinin GERÇEK (production) steps[3..7] verisini
 * kullanır — synthetic fixture DEĞİL, bkz. tests/studentModelLiberty.test.js
 * ile AYNI disiplin.
 */
import assert from 'node:assert/strict';
import {
  ASSESSMENT_STEP_INDICES, ASSESSMENT_COUNT, getAssessmentSteps,
  computeRealLiberties, computeChoiceCorrectIndex, computeTapTargets,
  isValidTapAnswer, isValidChoiceAnswer, computeAssessmentConcept,
} from '../scenes/libertyAssessmentPolicy.js';
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

test('ASSESSMENT_STEP_INDICES = [3,4,5,6,7] (l2 kullanıcıya görünen 4-8. adımlar)', () => {
  equal(ASSESSMENT_STEP_INDICES, [3, 4, 5, 6, 7]);
  equal(ASSESSMENT_COUNT, 5);
});

test('getAssessmentSteps() curriculum sırasıyla TAM 5 öğe döner', () => {
  const steps = getAssessmentSteps();
  equal(steps.length, 5);
  equal(steps.map(s => s.curriculumStepIndex), [3, 4, 5, 6, 7]);
});

test('tip dağılımı: steps[3]/[4] "choice", steps[5]/[6]/[7] "board_tap"', () => {
  const steps = getAssessmentSteps();
  equal(steps.map(s => s.type), ['choice', 'choice', 'board_tap', 'board_tap', 'board_tap']);
});

test('steps[3] (köşe taşı): GERÇEK nefes sayısı 2, doğru seçenek index 0', () => {
  const [a] = getAssessmentSteps();
  equal(computeRealLiberties(a.board, a.size).length, 2);
  equal(computeChoiceCorrectIndex(a), 0);
  ok(isValidChoiceAnswer(a, 0));
  ok(!isValidChoiceAnswer(a, 1));
  ok(!isValidChoiceAnswer(a, 2));
});

test('steps[4] (bitişik siyah sonrası): GERÇEK nefes sayısı 3, doğru seçenek index 0', () => {
  const [, a] = getAssessmentSteps();
  equal(computeRealLiberties(a.board, a.size).length, 3);
  equal(computeChoiceCorrectIndex(a), 0);
});

test('steps[5] (tek taş): GERÇEK 4 nefes noktası, curriculum answers ile birebir aynı KÜME', () => {
  const steps = getAssessmentSteps();
  const a = steps[2];
  const targets = computeTapTargets(a);
  equal(targets.length, 4);
  const stated = new Set(a.curriculumStatedAnswers.map(p => `${p.y},${p.x}`));
  const real = new Set(targets.map(p => `${p.row},${p.col}`));
  equal([...stated].sort(), [...real].sort());
  for (const t of targets) ok(isValidTapAnswer(a, t), `${JSON.stringify(t)} kabul edilmeli`);
  ok(!isValidTapAnswer(a, { row: 0, col: 0 }), 'uzak nokta reddedilmeli');
});

test('steps[6] (2 taşlı grup): GERÇEK 4 nefes noktası, curriculum answers ile birebir aynı KÜME', () => {
  const steps = getAssessmentSteps();
  const a = steps[3];
  const targets = computeTapTargets(a);
  equal(targets.length, 4);
  const stated = new Set(a.curriculumStatedAnswers.map(p => `${p.y},${p.x}`));
  const real = new Set(targets.map(p => `${p.row},${p.col}`));
  equal([...stated].sort(), [...real].sort());
});

test('steps[7] (atari): GERÇEK hedef kümesi TAM OLARAK tek noktaya iner (4,5)', () => {
  const steps = getAssessmentSteps();
  const a = steps[4];
  const targets = computeTapTargets(a);
  equal(targets.length, 1);
  equal(targets[0], { row: 5, col: 4 });
  ok(isValidTapAnswer(a, { row: 5, col: 4 }));
  ok(!isValidTapAnswer(a, { row: 4, col: 5 }), 'x/y ile row/col karıştırılmamalı');
});

test('showLibertiesBeforeAnswer: yalnız choice tipi (steps[3]/[4]) true, board_tap tipi (steps[5..7]) false', () => {
  const steps = getAssessmentSteps();
  equal(steps.map(s => s.showLibertiesBeforeAnswer), [true, true, false, false, false]);
});

test('cameraPreset her adım için çözülüyor (null DEĞİL)', () => {
  const steps = getAssessmentSteps();
  for (const s of steps) ok(s.cameraPreset, `step[${s.curriculumStepIndex}] cameraPreset çözülmeli, bulunan: ${s.cameraPreset}`);
});

test('promptText her adımda curriculum\'un GERÇEK ★ çerçeveli metnini taşır (boş değil)', () => {
  const steps = getAssessmentSteps();
  for (const s of steps) {
    ok(typeof s.promptText === 'string' && s.promptText.includes('Alıştırma'), `step[${s.curriculumStepIndex}] promptText boş/yanlış`);
  }
});

test('choice tipi promptText/questionLabel + options metinleri "özgürlük/liberty" İÇERMİYOR', () => {
  const steps = getAssessmentSteps().filter(s => s.type === 'choice');
  for (const s of steps) {
    ok(!/özgürl|serbestlik|\bliberty\b|\bliberties\b/i.test(s.promptText), `step[${s.curriculumStepIndex}] promptText yasak terim içeriyor`);
    ok(!/özgürl|serbestlik|\bliberty\b|\bliberties\b/i.test(s.questionLabel), `step[${s.curriculumStepIndex}] questionLabel yasak terim içeriyor`);
    for (const o of s.options) {
      ok(!/özgürl|serbestlik|\bliberty\b|\bliberties\b/i.test(o.feedback || ''), `step[${s.curriculumStepIndex}] option feedback yasak terim içeriyor`);
    }
  }
});

test('board_tap tipi promptText/feedbackOk/feedbackErr "özgürlük/liberty" İÇERMİYOR', () => {
  const steps = getAssessmentSteps().filter(s => s.type === 'board_tap');
  for (const s of steps) {
    ok(!/özgürl|serbestlik|\bliberty\b|\bliberties\b/i.test(s.promptText), `step[${s.curriculumStepIndex}] promptText yasak terim içeriyor`);
    ok(!/özgürl|serbestlik|\bliberty\b|\bliberties\b/i.test(s.feedbackOk || ''), `step[${s.curriculumStepIndex}] feedbackOk yasak terim içeriyor`);
    ok(!/özgürl|serbestlik|\bliberty\b|\bliberties\b/i.test(s.feedbackErr || ''), `step[${s.curriculumStepIndex}] feedbackErr yasak terim içeriyor`);
  }
});

test('computeChoiceCorrectIndex negatif index DÖNMEZ (her adımda gerçek sayıyla eşleşen bir seçenek VAR)', () => {
  const steps = getAssessmentSteps().filter(s => s.type === 'choice');
  for (const s of steps) ok(computeChoiceCorrectIndex(s) >= 0, `step[${s.curriculumStepIndex}] eşleşen seçenek bulunamadı`);
});

test('isValidTapAnswer null/undefined nokta için güvenle false döner', () => {
  const steps = getAssessmentSteps().filter(s => s.type === 'board_tap');
  for (const s of steps) {
    ok(!isValidTapAnswer(s, null));
    ok(!isValidTapAnswer(s, undefined));
  }
});

// ══════════════════════════════════════════════════════════════════
// v2 — kavram ayrımı (bkz. görev talimatı): sahnenin PRIMARY concept'i
// ('liberty') ile HER ÖĞENİN GERÇEK assessmentConcept'i (+ varsa
// expectedResultConcept) ayrı alanlarda taşınır. Tek bir global sabitin
// TÜM beş öğeye yayıldığı önceki hata BURADA kalıcı olarak engellenir.
// ══════════════════════════════════════════════════════════════════

test('steps[3..6] (item 1-4) GERÇEK assessmentConcept\'i "liberty" — atari/capture ÜRETMEZ', () => {
  const steps = getAssessmentSteps();
  for (const s of steps.filter(s => s.curriculumStepIndex !== 7)) {
    equal(s.assessmentConcept, 'liberty', `step[${s.curriculumStepIndex}] assessmentConcept 'liberty' olmalı`);
    ok(!('expectedResultConcept' in s), `step[${s.curriculumStepIndex}] expectedResultConcept HİÇ olmamalı (gereksiz kalabalık)`);
  }
});

test('steps[7] (item 5, atari/yakalama) GERÇEK assessmentConcept\'i "atari", expectedResultConcept\'i "capture"', () => {
  const steps = getAssessmentSteps();
  const a = steps[4];
  equal(a.curriculumStepIndex, 7);
  equal(a.assessmentConcept, 'atari');
  equal(a.expectedResultConcept, 'capture');
});

test('assessmentConcept sırayla deterministik: [liberty,liberty,liberty,liberty,atari]', () => {
  const steps = getAssessmentSteps();
  equal(steps.map(s => s.assessmentConcept), ['liberty', 'liberty', 'liberty', 'liberty', 'atari']);
});

test('computeAssessmentConcept: tam 1 nefes noktası kalan board "atari" döner, ≥2 nefes "liberty" döner', () => {
  equal(computeAssessmentConcept([{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 3, y: 4 }, { color: 'B', x: 4, y: 3 }, { color: 'B', x: 5, y: 4 }]), 'atari');
  equal(computeAssessmentConcept([{ color: 'B', x: 4, y: 4 }]), 'liberty');
  equal(computeAssessmentConcept([{ color: 'W', x: 0, y: 0 }]), 'liberty');
});

test('çapraz doğrulama: computeAssessmentConcept, core/captureObservation.js (findAtariGroups) + core/conceptMap.js (defaultConceptForLesson) GERÇEK sonucuyla HER öğede birebir eşleşir', () => {
  const steps = getAssessmentSteps();
  for (const s of steps) {
    const bs = new BoardState(s.size);
    for (const stone of s.board) bs.placeStone(stone.x, stone.y, stone.color === 'B' ? 'black' : 'white');
    const expected = findAtariGroups(bs).length > 0 ? 'atari' : defaultConceptForLesson('l2');
    equal(s.assessmentConcept, expected, `step[${s.curriculumStepIndex}]: policy=${s.assessmentConcept} vs GERÇEK resolver=${expected}`);
  }
});

test('çapraz doğrulama: steps[7]\'nin expectedResultConcept\'i, GERÇEK applyMove() simülasyonuyla (curriculum metninden DEĞİL) doğrulanır', () => {
  const steps = getAssessmentSteps();
  const a = steps[4];
  const bs = new BoardState(a.size);
  for (const stone of a.board) bs.placeStone(stone.x, stone.y, stone.color === 'B' ? 'black' : 'white');
  const target = computeTapTargets(a)[0];
  const { captured } = applyMove(bs, target.col, target.row, 'black');
  ok(captured.length > 0, 'GERÇEK simülasyon bir yakalama üretmeli');
  equal(a.expectedResultConcept, 'capture');
});

// Not: scenes/scene05LibertyAssessment.js'in curriculumRefs'i BURADA (Node
// unit testinde) doğrudan import EDİLMEDİ — o dosya tarayıcı-versiyonlu
// (`?v=...`) import'lar ve DOM-bağımlı yaşam döngüsü taşıyor. curriculumRefs'in
// getAssessmentSteps()'ten TÜRETİLDİĞİ (bkz. scene05LibertyAssessment.js
// `curriculumRefs: getAssessmentSteps().map(...)`) — statik olarak, ikinci
// bir kaynaktan DEĞİL — bu dosyanın satır satır okunmasıyla doğrulanabilir;
// GERÇEK çapraz denetim Teacher Studio Diagnostics'te (CURRICULUM_REF_CONCEPT_MISMATCH)
// ve gerçek tarayıcıda tests/verify-learning-scenes.mjs H28/H30'da yapılır.

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
