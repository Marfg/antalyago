/**
 * tests/studentModelLiberty.test.js
 * node tests/studentModelLiberty.test.js
 *
 * Student Model v0.5.1 — "liberty" kovasının GERÇEK müfredat (core/curriculum.js
 * l2, adım 5 ve 6) ve GERÇEK ActionHandler/LessonEngine akışından veri
 * ürettiğini doğrular. Synthetic fixture'lar DEĞİL — bu testler bilinçli
 * olarak PRODUCTION curriculum verisini kullanır, çünkü bu patch'in tüm
 * amacı "liberty kovası artık yalnız teorik değil, gerçek kullanımda aktif"
 * garantisini kanıtlamaktır.
 */

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

import { BoardState } from '../core/boardState.js';
import { LessonEngine } from '../core/lessonEngine.js';
import { ActionHandler } from '../core/actionHandler.js';
import { CURRICULUM } from '../core/curriculum.js';
import { deriveEvents, resolveActiveConcept } from '../core/teacherPanelBridge.js';
import { createStudentModel, applyStudentEvent, getConceptState } from '../core/studentModel.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const l2Lesson = CURRICULUM.flatMap(c => c.lessons).find(l => l.id === 'l2');

function setup(stepIdx) {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CURRICULUM);
  lesson.loadLesson('l2');
  lesson.loadStep(stepIdx);
  const step = lesson.currentStep();
  for (const s of step.board) board.placeStone(s.x, s.y, s.color === 'B' ? 'black' : 'white');
  const handler = new ActionHandler(board, lesson);
  return { board, lesson, handler, step };
}

// ── Curriculum / concept ──────────────────────────────────────────────

test('l2 adım 5 ve 6 gerçekten cevap bekliyor (stepRequiresAnswer üzerinden dolaylı — answers dizisi var)', () => {
  equal(!!l2Lesson.steps[5].answers, true);
  equal(!!l2Lesson.steps[6].answers, true);
});

test('l2 adım 5/6: resolveActiveConcept → "liberty" (atari/capture DEĞİL)', () => {
  for (const idx of [5, 6]) {
    const { board, step } = setup(idx);
    const concept = resolveActiveConcept({ lessonId: 'l2', boardState: board, step, result: null });
    equal(concept, 'liberty', `adım[${idx}] concept liberty olmalı, geldi: ${concept}`);
  }
});

test('l2 adım 5/6: bu step\'lerde gerçekten atari YOK (tüm taşların 1\'den fazla nefesi var)', () => {
  for (const idx of [5, 6]) {
    const { board, step } = setup(idx);
    const concept = resolveActiveConcept({ lessonId: 'l2', boardState: board, step, result: null });
    ok(concept !== 'atari', `adım[${idx}] yanlışlıkla atari kovasına yönlenmemeli`);
  }
});

// ── Event → Student Model akışı (gerçek ActionHandler üzerinden) ──────

test('l2 adım 5: doğru cevap → gerçek answer_evaluated event\'i concept:"liberty" taşır', () => {
  const { board, lesson, handler } = setup(5);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 3, y: 4 } }; // (4,4) taşının bir nefes noktası
  const result = handler.handle(action);
  ok(result.ok, 'gerçek nefes noktasına tıklamak doğru kabul edilmeli');
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  const evaluated = events.find(e => e.type === 'answer_evaluated');
  ok(evaluated, 'answer_evaluated üretilmeli');
  equal(evaluated.payload.result, 'correct');
  equal(evaluated.payload.concept, 'liberty');
});

test('l2 adım 5: yanlış cevap → answer_evaluated concept:"liberty", result:"incorrect"', () => {
  const { board, lesson, handler } = setup(5);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } }; // taşa bitişik değil
  const result = handler.handle(action);
  equal(result.ok, false);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  const evaluated = events.find(e => e.type === 'answer_evaluated');
  ok(evaluated);
  equal(evaluated.payload.result, 'incorrect');
  equal(evaluated.payload.concept, 'liberty');
});

test('l2 adım 5: doğru cevapta capture GERÇEKLEŞMEZ (REMOVE_STONES effect\'i yok)', () => {
  const { board, handler } = setup(5);
  const action = { type: 'BOARD_TAP', payload: { x: 3, y: 4 } };
  const result = handler.handle(action);
  ok(!result.effects.some(e => e.type === 'REMOVE_STONES'), 'saf nefes noktası adımında hiçbir taş kaldırılmamalı');
});

test('l2 adım 6 (bağlı 2 taş grubu): doğru cevap concept:"liberty" olarak akar', () => {
  const { board, lesson, handler } = setup(6);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 1, y: 3 } }; // grubun nefes noktalarından biri
  const result = handler.handle(action);
  ok(result.ok);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  const evaluated = events.find(e => e.type === 'answer_evaluated');
  equal(evaluated.payload.concept, 'liberty');
});

// ── Student Model: sayaçlar doğru kovaya yazılır, diğerleri ETKİLENMEZ ─

test('l2 adım 5 doğru cevap → Student Model: liberty.correct/attempts artar, atari/capture HİÇ değişmez', () => {
  const { board, lesson, handler } = setup(5);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 5, y: 4 } };
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });

  let model = createStudentModel();
  for (const e of events) ({ model } = applyStudentEvent(model, e));

  const liberty = getConceptState(model, 'liberty');
  equal(liberty.attempts, 1);
  equal(liberty.correct, 1);
  equal(liberty.independentCorrect, 1, 'yardımsız doğru cevap → bağımsız sayılmalı');

  equal(getConceptState(model, 'atari').attempts, 0, 'atari kovası ETKİLENMEMELİ');
  equal(getConceptState(model, 'capture').attempts, 0, 'capture kovası ETKİLENMEMELİ');
  equal(model.currentConcept, 'liberty');
});

// ── Independent correct doğrulaması ────────────────────────────────────

test('l2 adım 5: yardımsız doğru cevap → independentCorrect artar', () => {
  const { board, lesson, handler } = setup(5);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 4, y: 5 } };
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  let model = createStudentModel();
  for (const e of events) ({ model } = applyStudentEvent(model, e));
  equal(getConceptState(model, 'liberty').independentCorrect, 1);
});

test('l2 adım 5: yardım (give_hint) sonrası doğru cevap → correct artar ama independentCorrect ARTMAZ', () => {
  const { board, lesson, handler } = setup(5);
  let model = createStudentModel();

  // 1. deneme: yanlış
  let boardBefore = board.clone();
  let action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } };
  let result = handler.handle(action);
  let events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  for (const e of events) ({ model } = applyStudentEvent(model, e));

  // AI (simüle edilmiş) bir sözlü ipucu verdi — gerçek core/teacherAssistant.js'in
  // ürettiği event'in AYNI şekli (bkz. tests/studentModel.test.js hintEvent()).
  ({ model } = applyStudentEvent(model, {
    type: 'ai_teacher_responded', lessonId: 'l2', stepId: 'l2:5', payload: { action: 'give_hint', hintLevel: 1 },
  }));

  // 2. deneme: doğru
  boardBefore = board.clone();
  action = { type: 'BOARD_TAP', payload: { x: 4, y: 3 } };
  result = handler.handle(action);
  ok(result.ok);
  events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  for (const e of events) ({ model } = applyStudentEvent(model, e));

  const liberty = getConceptState(model, 'liberty');
  equal(liberty.correct, 1);
  equal(liberty.independentCorrect, 0, 'yardım kullanıldığı için bağımsız SAYILMAMALI');
  equal(liberty.hintsUsed, 1);
});

// ── Regression ────────────────────────────────────────────────────────

test('regresyon: l3 (capture) akışı hâlâ doğru concept\'e yazıyor, liberty\'e KARIŞMIYOR', () => {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CURRICULUM);
  lesson.loadLesson('l3');
  const step = lesson.currentStep();
  for (const s of step.board) board.placeStone(s.x, s.y, s.color === 'B' ? 'black' : 'white');
  const handler = new ActionHandler(board, lesson);

  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: step.answer.x, y: step.answer.y } };
  const result = handler.handle(action);
  ok(result.ok);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  let model = createStudentModel();
  for (const e of events) ({ model } = applyStudentEvent(model, e));

  equal(getConceptState(model, 'capture').attempts, 1);
  equal(getConceptState(model, 'liberty').attempts, 0, 'l3 capture akışı liberty kovasını ETKİLEMEMELİ');
});

test('regresyon: l2 adım 7 (eski adım 5 — atari/capture) hâlâ "atari" concept\'ini üretiyor, liberty DEĞİL', () => {
  const { board, lesson, handler } = setup(7);
  const boardBefore = board.clone();
  const action = { type: 'BOARD_TAP', payload: { x: 0, y: 0 } }; // yanlış — atari hâlâ aktif
  const result = handler.handle(action);
  const events = deriveEvents({ action, result, lessonEngine: lesson, boardState: board, boardBefore });
  const evaluated = events.find(e => e.type === 'answer_evaluated');
  equal(evaluated.payload.concept, 'atari', 'l2\'nin eski atari adımı hâlâ kaydırılmadan doğru kovaya yazmalı');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
