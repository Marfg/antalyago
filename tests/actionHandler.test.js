/**
 * tests/actionHandler.test.js
 * node tests/actionHandler.test.js
 *
 * core/actionHandler.js şu ana kadar hiç doğrudan test edilmemişti. Bu
 * dosya (a) bu görevde eklenen SHOW_LIBERTIES_REQUEST action'ını, (b)
 * BOARD_TAP/HINT_REQUEST gibi dokunulan mevcut davranışların bozulmadığını
 * doğrulayan asgari bir güvenlik ağı sağlar — tüm ActionHandler'ı
 * kapsamlı test etmek bu görevin kapsamı dışında.
 */

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

import { BoardState } from '../core/boardState.js';
import { LessonEngine } from '../core/lessonEngine.js';
import { ActionHandler } from '../core/actionHandler.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Gerçek curriculum'a bağımlı olmayan minimal, izole bir müfredat.
const MINI_CURRICULUM = [
  { id: 'c1', title: 'Test Bölümü', lessons: [
    { id: 'l1', title: 'Test Dersi', steps: [
      { text: 'adım 0', board: [{ color: 'B', x: 4, y: 4 }], answer: { x: 4, y: 5 }, turn: 'black', size: 9 },
    ] },
  ] },
];

function freshHandler() {
  const board = new BoardState(9);
  const lesson = new LessonEngine(MINI_CURRICULUM);
  lesson.loadLesson('l1');
  const handler = new ActionHandler(board, lesson);
  // loadLesson yalnızca lessonEngine state'ini kurar — board'u ActionHandler
  // dışından, gerçek ogren-3d.html'deki STEP_GOTO akışının yaptığı gibi
  // adımın board verisiyle tohumluyoruz.
  board.placeStone(4, 4, 'black');
  return { board, lesson, handler };
}

// ── Mevcut davranış — regresyon güvenlik ağı ─────────────────────────

test('BOARD_TAP: doğru cevap → correct feedback + PLACE_STONE effect + legal:true', () => {
  const { handler } = freshHandler();
  const result = handler.handle({ type: 'BOARD_TAP', payload: { x: 4, y: 5 } });
  ok(result.ok);
  equal(result.feedback.type, 'correct');
  equal(result.legal, true);
  ok(result.effects.some(e => e.type === 'PLACE_STONE'));
});

test('BOARD_TAP: kural-geçerli ama müfredat açısından yanlış hamle → legal:true, ok:false (v0.2)', () => {
  // (4,4) merkez taş — (0,0)'a oynamak kural olarak tamamen geçerli bir
  // hamledir, yalnızca bu dersin beklediği cevap değildir. legal/curriculum
  // doğruluğu birbirinden AYRI kavramlardır.
  const { handler } = freshHandler();
  const result = handler.handle({ type: 'BOARD_TAP', payload: { x: 0, y: 0 } });
  equal(result.ok, false);
  equal(result.feedback.type, 'wrong');
  equal(result.legal, true, 'kural ihlali yok — yalnız ders cevabı yanlış');
});

test('BOARD_TAP: ko kuralı ihlali → legal:false (v0.2)', () => {
  const board = new BoardState(9);
  const lesson = new LessonEngine(MINI_CURRICULUM);
  lesson.loadLesson('l1');
  const handler = new ActionHandler(board, lesson);
  board.koPoint = { x: 2, y: 2 };
  const result = handler.handle({ type: 'BOARD_TAP', payload: { x: 2, y: 2 } });
  equal(result.legal, false, 'ko noktasına oynamak kural ihlalidir');
  equal(result.feedback.type, 'wrong');
  ok(result.feedback.text.includes('Ko'));
});

test('BOARD_TAP: yanlış cevap → wrong feedback, taş konmaz', () => {
  const { handler, board } = freshHandler();
  const before = board.stones.length;
  const result = handler.handle({ type: 'BOARD_TAP', payload: { x: 0, y: 0 } });
  equal(result.feedback.type, 'wrong');
  equal(board.stones.length, before, 'yanlış cevapta board değişmemeli');
});

test('HINT_REQUEST: SHOW_HINT effect\'i doğru hedef noktayı taşır', () => {
  const { handler } = freshHandler();
  const result = handler.handle({ type: 'HINT_REQUEST' });
  ok(result.ok);
  const hint = result.effects.find(e => e.type === 'SHOW_HINT');
  ok(hint, 'SHOW_HINT effect\'i mevcut');
  equal(hint.targets[0].x, 4);
  equal(hint.targets[0].y, 5);
});

test('bilinmeyen action: ok:false + hata feedback', () => {
  const { handler } = freshHandler();
  const result = handler.handle({ type: 'NOT_A_REAL_ACTION' });
  equal(result.ok, false);
  equal(result.feedback.type, 'error');
});

// ── Yeni: SHOW_LIBERTIES_REQUEST ─────────────────────────────────────

test('SHOW_LIBERTIES_REQUEST: tek taşın tüm nefes noktalarını SHOW_LIBERTY_HIGHLIGHTS ile döner', () => {
  const { handler } = freshHandler();
  const result = handler.handle({ type: 'SHOW_LIBERTIES_REQUEST' });
  ok(result.ok);
  const eff = result.effects.find(e => e.type === 'SHOW_LIBERTY_HIGHLIGHTS');
  ok(eff, 'mevcut SHOW_LIBERTY_HIGHLIGHTS effect\'i yeniden kullanılıyor (yeni effect tipi icat edilmedi)');
  // (4,4) merkez taşının 4 nefes noktası: (3,4)(5,4)(4,3)(4,5)
  equal(eff.points.length, 4);
  const keys = eff.points.map(p => `${p.x},${p.y}`).sort();
  equal(keys.join('|'), '3,4|4,3|4,5|5,4');
  equal(result.feedback.type, 'info');
});

test('SHOW_LIBERTIES_REQUEST: iki ayrı taş varsa her ikisinin nefes noktaları birleşir, tekrar etmez', () => {
  const { handler, board } = freshHandler();
  board.placeStone(0, 0, 'white'); // izole ikinci taş, köşe: 2 nefes noktası
  const result = handler.handle({ type: 'SHOW_LIBERTIES_REQUEST' });
  const eff = result.effects.find(e => e.type === 'SHOW_LIBERTY_HIGHLIGHTS');
  equal(eff.points.length, 6, '4 (merkez) + 2 (köşe) = 6, tekrar yok');
});

test('SHOW_LIBERTIES_REQUEST: tahtada taş yoksa boş nokta listesi ve bilgilendirici mesaj döner', () => {
  const board = new BoardState(9);
  const lesson = new LessonEngine(MINI_CURRICULUM);
  lesson.loadLesson('l1');
  const handler = new ActionHandler(board, lesson);
  const result = handler.handle({ type: 'SHOW_LIBERTIES_REQUEST' });
  const eff = result.effects.find(e => e.type === 'SHOW_LIBERTY_HIGHLIGHTS');
  equal(eff.points.length, 0);
  equal(result.feedback.text, 'Tahtada taş yok.');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
