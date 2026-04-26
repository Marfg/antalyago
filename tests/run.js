/**
 * tests/run.js
 * Node.js ile çalışır: node tests/run.js
 * Hiçbir test framework'ü gerekmez.
 */

import { BoardState }    from '../core/boardState.js';
import { getGroup, getLiberties, computeCaptures, isValidMove, applyMove } from '../core/ruleEngine.js';
import { isCorrectAnswer, stepRequiresAnswer, LessonEngine } from '../core/lessonEngine.js';

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${b}, got ${a}`);
}

// ── BoardState testleri ───────────────────────────────────────────

console.log('\n▶ BoardState');

test('9x9 oluşturma', () => {
  const b = new BoardState(9);
  assertEqual(b.size, 9);
  assertEqual(b.grid.length, 9);
  assertEqual(b.grid[0].length, 9);
  assertEqual(b.stones.length, 0);
});

test('placeStone ve colorAt', () => {
  const b = new BoardState(9);
  b.placeStone(3, 3, 'black');
  assertEqual(b.colorAt(3, 3), 'black');
  assertEqual(b.stones.length, 1);
  assert(b.isOccupied(3, 3));
  assert(b.isEmpty(4, 4));
});

test('removeStone', () => {
  const b = new BoardState(9);
  b.placeStone(3, 3, 'black');
  b.removeStone(3, 3);
  assertEqual(b.colorAt(3, 3), null);
  assertEqual(b.stones.length, 0);
});

test('isInBounds sınır kontrolü', () => {
  const b = new BoardState(9);
  assert(b.isInBounds(0, 0));
  assert(b.isInBounds(8, 8));
  assert(!b.isInBounds(9, 0));
  assert(!b.isInBounds(-1, 0));
});

test('neighbors köşe', () => {
  const b = new BoardState(9);
  const ns = b.neighbors(0, 0);
  assertEqual(ns.length, 2);
});

test('neighbors kenar', () => {
  const b = new BoardState(9);
  const ns = b.neighbors(4, 0);
  assertEqual(ns.length, 3);
});

test('neighbors merkez', () => {
  const b = new BoardState(9);
  const ns = b.neighbors(4, 4);
  assertEqual(ns.length, 4);
});

test('clone bağımsızlığı', () => {
  const b = new BoardState(9);
  b.placeStone(3, 3, 'black');
  const c = b.clone();
  c.placeStone(4, 4, 'white');
  assert(!b.isOccupied(4, 4), 'orijinal etkilenmemeli');
  assert(c.isOccupied(4, 4));
});

// ── RuleEngine testleri ───────────────────────────────────────────

console.log('\n▶ RuleEngine');

test('getGroup — tek taş', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'black');
  const g = getGroup(b, 4, 4);
  assertEqual(g.size, 1);
  assert(g.has('4,4'));
});

test('getGroup — bağlı iki taş', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'black');
  b.placeStone(5, 4, 'black');
  const g = getGroup(b, 4, 4);
  assertEqual(g.size, 2);
  assert(g.has('5,4'));
});

test('getGroup — rakip taşa geçmez', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'black');
  b.placeStone(5, 4, 'white');
  const g = getGroup(b, 4, 4);
  assertEqual(g.size, 1);
});

test('getLiberties — merkez taş 4 liberty', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'black');
  const g = getGroup(b, 4, 4);
  const libs = getLiberties(b, g);
  assertEqual(libs.size, 4);
});

test('getLiberties — köşe taş 2 liberty', () => {
  const b = new BoardState(9);
  b.placeStone(0, 0, 'black');
  const g = getGroup(b, 0, 0);
  const libs = getLiberties(b, g);
  assertEqual(libs.size, 2);
});

test('computeCaptures — tek taş yakalama', () => {
  const b = new BoardState(9);
  // Beyaz taşı çevrele: sol, üst, sağ tarafı doldur
  b.placeStone(3, 4, 'white');  // yakalanacak
  b.placeStone(2, 4, 'black');
  b.placeStone(3, 3, 'black');
  b.placeStone(4, 4, 'black');
  // Son nefes: (3,5) — buraya siyah koyunca beyaz yakalanmalı
  const caps = computeCaptures(b, 3, 5, 'black');
  assertEqual(caps.length, 1);
  assertEqual(caps[0].x, 3);
  assertEqual(caps[0].y, 4);
});

test('computeCaptures — yakalama yok', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'white');
  const caps = computeCaptures(b, 3, 4, 'black');
  assertEqual(caps.length, 0);
});

test('isValidMove — normal hamle geçerli', () => {
  const b = new BoardState(9);
  const r = isValidMove(b, 4, 4, 'black');
  assert(r.valid);
});

test('isValidMove — dolu nokta geçersiz', () => {
  const b = new BoardState(9);
  b.placeStone(4, 4, 'black');
  const r = isValidMove(b, 4, 4, 'white');
  assert(!r.valid);
  assertEqual(r.reason, 'OCCUPIED');
});

test('isValidMove — intihar geçersiz (yakalama yok)', () => {
  const b = new BoardState(9);
  // Beyaz taşlar (0,0) köşesini çevreler ama başka libertyları var → yakalanmaz
  // Siyah (0,0)'a koyunca kendi libertysi = 0 → intihar
  b.placeStone(1, 0, 'white');
  b.placeStone(0, 1, 'white');
  const r = isValidMove(b, 0, 0, 'black');
  assert(!r.valid);
  assertEqual(r.reason, 'SUICIDE');
});

test('isValidMove — yakalama intihar saymaz', () => {
  // Köşe (0,0) noktası: iki beyaz taş bu noktayı tek liberty olarak görüyor
  // Siyah (0,0)'a koyarsa her iki beyazı yakalar → geçerli hamle (intihar değil)
  //
  //   (1,0)=W  komşuları: (0,0)[hedef], (2,0)=B, (1,1)=B → tek liberty = (0,0)
  //   (0,1)=W  komşuları: (0,0)[hedef], (0,2)=B, (1,1)=B → tek liberty = (0,0)
  const b = new BoardState(9);
  b.placeStone(2, 0, 'black');
  b.placeStone(1, 1, 'black');
  b.placeStone(0, 2, 'black');
  b.placeStone(1, 0, 'white');
  b.placeStone(0, 1, 'white');
  const r = isValidMove(b, 0, 0, 'black');
  assert(r.valid, 'yakalama yapılan hamle geçerli olmalı');
});

test('applyMove — taş konulur, board değişir', () => {
  const b = new BoardState(9);
  const { newState } = applyMove(b, 4, 4, 'black');
  assert(newState.isOccupied(4, 4));
  assert(!b.isOccupied(4, 4), 'orijinal mutate edilmemeli');
  assertEqual(newState.turn, 'white');
});

test('applyMove — capture gerçekleşir', () => {
  const b = new BoardState(9);
  b.placeStone(3, 4, 'white');
  b.placeStone(2, 4, 'black');
  b.placeStone(3, 3, 'black');
  b.placeStone(4, 4, 'black');
  const { newState, captured } = applyMove(b, 3, 5, 'black');
  assertEqual(captured.length, 1);
  assert(!newState.isOccupied(3, 4), 'yakalanan taş kaldırılmalı');
});

// ── LessonEngine testleri ─────────────────────────────────────────

console.log('\n▶ LessonEngine');

// Minimal mock curriculum
const MOCK_CURRICULUM = [{
  id: 'c1', title: 'Test Bölümü', lessons: [
    {
      id: 'l1', title: 'Test Ders 1', steps: [
        { text: '<p>Adım 1</p>', board: [], auto: true, size: 9 },
        { text: '<p>Adım 2</p>', board: [], answer: { x: 4, y: 4 }, turn: 'black', size: 9 },
        { text: '<p>Adım 3</p>', board: [], answers: [{ x: 3, y: 3 }, { x: 5, y: 5 }], size: 9 },
        { text: '<p>Adım 4</p>', board: [], answers: 'any', size: 9 },
      ]
    },
    {
      id: 'l2', title: 'Test Ders 2', steps: [
        { text: '<p>Adım 1</p>', board: [], auto: true, size: 9 },
      ]
    }
  ]
}];

// localStorage mock (Node.js'te yok)
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] ?? null; },
  setItem(k, v) { this._data[k] = v; },
  removeItem(k) { delete this._data[k]; },
};

test('isCorrectAnswer — answer eşleşmesi', () => {
  const step = { answer: { x: 4, y: 4 } };
  assert(isCorrectAnswer(step, 4, 4));
  assert(!isCorrectAnswer(step, 3, 3));
});

test('isCorrectAnswer — answers dizisi', () => {
  const step = { answers: [{ x: 3, y: 3 }, { x: 5, y: 5 }] };
  assert(isCorrectAnswer(step, 3, 3));
  assert(isCorrectAnswer(step, 5, 5));
  assert(!isCorrectAnswer(step, 4, 4));
});

test('isCorrectAnswer — answers any', () => {
  const step = { answers: 'any' };
  assert(isCorrectAnswer(step, 0, 0));
  assert(isCorrectAnswer(step, 8, 8));
});

test('isCorrectAnswer — cevap gerektirmeyen adım', () => {
  assert(!isCorrectAnswer(null, 4, 4));
  assert(!isCorrectAnswer({ auto: true }, 4, 4));
});

test('stepRequiresAnswer', () => {
  assert(!stepRequiresAnswer({ auto: true }));
  assert(stepRequiresAnswer({ answer: { x: 4, y: 4 } }));
  assert(stepRequiresAnswer({ answers: 'any' }));
  assert(!stepRequiresAnswer(null));
});

test('LessonEngine — ders yükleme', () => {
  const eng = new LessonEngine(MOCK_CURRICULUM);
  const state = eng.loadLesson('l1');
  assertEqual(state.type, 'STEP_LOADED');
  assertEqual(state.stepIdx, 0);
  assertEqual(state.totalSteps, 4);
  assert(state.stepDone, 'auto adım hemen done olmalı');
});

test('LessonEngine — doğru cevap', () => {
  const eng = new LessonEngine(MOCK_CURRICULUM);
  eng.loadLesson('l1');
  eng.loadStep(1);  // answer: {x:4,y:4}
  const r = eng.validateAnswer(4, 4);
  assert(r.correct);
  assert(r.stepDone);
  assertEqual(r.mistakeCount, 0);
});

test('LessonEngine — yanlış cevap', () => {
  const eng = new LessonEngine(MOCK_CURRICULUM);
  eng.loadLesson('l1');
  eng.loadStep(1);
  const r = eng.validateAnswer(0, 0);
  assert(!r.correct);
  assert(!r.stepDone);
  assertEqual(r.mistakeCount, 1);
});

test('LessonEngine — canAdvance auto adımda', () => {
  const eng = new LessonEngine(MOCK_CURRICULUM);
  eng.loadLesson('l1');  // ilk adım auto
  assert(eng.canAdvance());
});

test('LessonEngine — canAdvance interaktif adımda (cevap verilmeden)', () => {
  const eng = new LessonEngine(MOCK_CURRICULUM);
  eng.loadLesson('l1');
  eng.loadStep(1);  // answer gerektirir
  assert(!eng.canAdvance());
});

test('LessonEngine — nextStep ilerler', () => {
  const eng = new LessonEngine(MOCK_CURRICULUM);
  eng.loadLesson('l1');
  const s2 = eng.nextStep();
  assertEqual(s2.stepIdx, 1);
});

test('LessonEngine — son adımdan nextStep → LESSON_COMPLETE', () => {
  const eng = new LessonEngine(MOCK_CURRICULUM);
  eng.loadLesson('l1');
  // Tüm adımlardan geç
  eng.loadStep(3); // answers: 'any', auto değil ama validateAnswer ile done yapabiliriz
  eng.validateAnswer(0, 0); // 'any' → doğru
  const r = eng.nextStep();
  assertEqual(r.type, 'LESSON_COMPLETE');
  assertEqual(r.lessonId, 'l1');
  assert(r.nextLesson !== null);
});

test('LessonEngine — progress', () => {
  global.localStorage._data = {};  // önceki testin tamamlama kaydını temizle
  const eng = new LessonEngine(MOCK_CURRICULUM);
  const p = eng.progress();
  assertEqual(p.total, 2);
  assertEqual(p.done, 0);
});

// ── Özet ─────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`Toplam: ${passed + failed}   ✓ ${passed}   ✗ ${failed}`);
console.log('─'.repeat(40));
if (failed > 0) process.exit(1);
