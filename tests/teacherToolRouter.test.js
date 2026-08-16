/**
 * tests/teacherToolRouter.test.js
 * node tests/teacherToolRouter.test.js
 *
 * core/teacherToolRouter.js — LLM'nin "tool" talebini (yalnız bir isim)
 * deterministik olarak doğrular ve mevcut effects[] sözleşmesine çevirir.
 * Bu testlerin asıl amacı: LLM'in hiçbir koordinatına GÜVENİLMEDİĞİNİ ve
 * hedefin her zaman gerçek board/step durumundan türediğini kanıtlamak.
 */

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

import { BoardState } from '../core/boardState.js';
import { LessonEngine } from '../core/lessonEngine.js';
import { routeTeacherTool } from '../core/teacherToolRouter.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// l3'ün gerçek "tek taş atari" desenini yansıtan izole kurgu (diğer
// v0.2/v0.3 test dosyalarıyla aynı fixture deseni).
const CAPTURE_CURRICULUM = [
  { id: 'c1', title: 'Test Bölümü', lessons: [
    { id: 'l3', title: 'Taş Alma', steps: [
      {
        text: '<p>Beyaz taşı yakala.</p>',
        board: [{ color: 'W', x: 4, y: 4 }, { color: 'B', x: 3, y: 4 }, { color: 'B', x: 4, y: 3 }, { color: 'B', x: 5, y: 4 }],
        answer: { x: 4, y: 5 }, turn: 'black', size: 9,
      },
    ] },
    // Atari İÇERMEYEN bir adım — "no_target_group" senaryosu için.
    { id: 'l2', title: 'Nefes Noktaları', steps: [
      { text: '<p>Bu taşın nefes noktalarına dokun.</p>', board: [{ color: 'B', x: 4, y: 4 }], answer: { x: 4, y: 5 }, turn: 'black', size: 9 },
      { text: '<p>Auto adım.</p>', board: [], auto: true, size: 9 },
    ] },
  ] },
];

function captureSetup() {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CAPTURE_CURRICULUM);
  lesson.loadLesson('l3');
  const step = lesson.currentStep();
  for (const s of step.board) board.placeStone(s.x, s.y, s.color === 'B' ? 'black' : 'white');
  return { board, lesson };
}

// ── say / give_hint — router'a gerek yok, her zaman izinli ───────────

test('say → allowed:true, effects boş (router\'a gerek yok)', () => {
  const { board, lesson } = captureSetup();
  const r = routeTeacherTool({ toolResponse: { action: 'say', message: 'x', hintLevel: null }, lessonEngine: lesson, boardState: board });
  equal(r.allowed, true);
  equal(r.effects.length, 0);
  equal(r.reason, null);
});

test('give_hint → allowed:true, effects boş (bu milestone\'da SHOW_HINT\'e otomatik eşlenmiyor)', () => {
  const { board, lesson } = captureSetup();
  const r = routeTeacherTool({ toolResponse: { action: 'give_hint', message: 'x', hintLevel: 1 }, lessonEngine: lesson, boardState: board });
  equal(r.allowed, true);
  equal(r.effects.length, 0);
});

// ── show_liberties: doğru context + hedef grup → allowed ────────────

test('show_liberties: atari mevcut → allowed:true, SHOW_LIBERTY_HIGHLIGHTS effect\'i, gerçek nefes noktası', () => {
  const { board, lesson } = captureSetup();
  const r = routeTeacherTool({ toolResponse: { action: 'show_liberties', message: 'x', hintLevel: null }, lessonEngine: lesson, boardState: board });
  equal(r.allowed, true);
  equal(r.tool, 'show_liberties');
  equal(r.effects.length, 1);
  equal(r.effects[0].type, 'SHOW_LIBERTY_HIGHLIGHTS');
  equal(r.targetCount, 1);
  // Beyaz (4,4) taşının tek gerçek nefes noktası (4,5) — LLM bunu hiç söylemedi,
  // toolResponse'ta hiçbir koordinat yoktu; nokta board'dan hesaplandı.
  equal(r.effects[0].points[0].x, 4);
  equal(r.effects[0].points[0].y, 5);
});

test('show_liberties: LLM\'in cevabına konulmuş sahte bir "points" alanı YOK SAYILIR (zaten router girdisi yalnız {action,message,hintLevel})', () => {
  const { board, lesson } = captureSetup();
  // routeTeacherTool yalnızca parseTeacherResponse'un ÜRETTİĞİ temiz value'yu
  // alır — şema zaten points/coordinates/targets'ı reddeder (bkz.
  // teacherResponseSchema.test.js). Burada router'ın KENDİSİNİN de böyle
  // fazladan bir alanı asla effect üretiminde kullanmadığını doğruluyoruz.
  const spoofed = { action: 'show_liberties', message: 'x', hintLevel: null, points: [{ x: 0, y: 0 }] };
  const r = routeTeacherTool({ toolResponse: spoofed, lessonEngine: lesson, boardState: board });
  equal(r.effects[0].points[0].x, 4, 'gerçek hedef (4,5) kullanılmalı, sahte (0,0) DEĞİL');
  equal(r.effects[0].points[0].y, 5);
});

// ── show_liberties: hedef grup yok → rejected(no_target_group) ──────

test('show_liberties: atari yok (yalnız serbest tek taş) → rejected, reason:no_target_group', () => {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CAPTURE_CURRICULUM);
  lesson.loadLesson('l2'); // adım 0: tek taş, 4 nefes noktası — atari değil
  board.placeStone(4, 4, 'black');
  const r = routeTeacherTool({ toolResponse: { action: 'show_liberties', message: 'x', hintLevel: null }, lessonEngine: lesson, boardState: board });
  equal(r.allowed, false);
  equal(r.tool, 'show_liberties');
  equal(r.reason, 'no_target_group');
  equal(r.effects.length, 0);
});

// ── show_liberties: adım cevap gerektirmiyor → rejected(not_allowed_for_step) ──

test('show_liberties: auto/gözlem adımında → rejected, reason:not_allowed_for_step', () => {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CAPTURE_CURRICULUM);
  lesson.loadLesson('l2');
  lesson.loadStep(1); // auto adım, cevap gerektirmiyor
  const r = routeTeacherTool({ toolResponse: { action: 'show_liberties', message: 'x', hintLevel: null }, lessonEngine: lesson, boardState: board });
  equal(r.allowed, false);
  equal(r.reason, 'not_allowed_for_step');
});

// ── show_liberties: geçersiz context ─────────────────────────────────

test('show_liberties: boardState verilmezse → rejected, reason:invalid_context', () => {
  const { lesson } = captureSetup();
  const r = routeTeacherTool({ toolResponse: { action: 'show_liberties', message: 'x', hintLevel: null }, lessonEngine: lesson, boardState: null });
  equal(r.allowed, false);
  equal(r.reason, 'invalid_context');
});

test('show_liberties: lessonEngine\'de yüklü ders yoksa → rejected, reason:invalid_context', () => {
  const board = new BoardState(9);
  const lesson = new LessonEngine(CAPTURE_CURRICULUM); // loadLesson çağrılmadı
  const r = routeTeacherTool({ toolResponse: { action: 'show_liberties', message: 'x', hintLevel: null }, lessonEngine: lesson, boardState: board });
  equal(r.allowed, false);
  equal(r.reason, 'invalid_context');
});

// ── unsupported_tool ──────────────────────────────────────────────────

test('şema-dışı/desteklenmeyen bir action doğrudan router\'a verilirse → rejected, reason:unsupported_tool', () => {
  const { board, lesson } = captureSetup();
  const r = routeTeacherTool({ toolResponse: { action: 'move_stone', message: 'x' }, lessonEngine: lesson, boardState: board });
  equal(r.allowed, false);
  equal(r.reason, 'unsupported_tool');
});

test('toolResponse/action boşsa → rejected, reason:unsupported_tool', () => {
  const { board, lesson } = captureSetup();
  const r = routeTeacherTool({ toolResponse: null, lessonEngine: lesson, boardState: board });
  equal(r.allowed, false);
  equal(r.reason, 'unsupported_tool');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
