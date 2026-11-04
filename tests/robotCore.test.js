/**
 * tests/robotCore.test.js
 * Robotun saf katmanları: oyun durumu, handikap merdiveni, ağ girdileri,
 * arama, ipucu araçları. Tarayıcı ve model gerektirmez.
 */
import assert from 'node:assert/strict';
import { __test } from '../core/goAI.js';
import { BLACK, WHITE, createGame, finishCounting, illegalReason, passTurn, playMove, pointOf, positionOf, resign, scoreGame, suggestDead, toggleDead } from '../core/robotGame.js';
import { LADDER, createLadder, gameSettings, loadLadder, recordResult } from '../core/handicapLadder.js';
import { NET_CHANNELS, buildInputs, komiWave, readOwnership, readPolicy, readWinrate } from '../core/kataFeatures.js';
import { ROBOT_STRENGTH, chooseRobotMove, estimateLead, searchPosition } from '../core/robotSearch.js';
import { dangerHint, moveHint, moveReason, regionHint, regionName, selfAtariWarning, territoryEstimate } from '../core/hintTools.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✓', name); passed++; } catch (error) { console.error('  ✗', name, '-', error.message); failed++; }
}

/** Satır dizisinden oyun: X siyah, O beyaz. */
function board(rows, options = {}) {
  const game = createGame(options);
  rows.forEach((row, y) => [...row.replace(/ /g, '')].forEach((cell, x) => {
    game.grid[pointOf(x, y)] = cell === 'X' ? BLACK : cell === 'O' ? WHITE : 0;
  }));
  return game;
}
const EMPTY = Array(9).fill('. . . . . . . . .');

/* ── Kurallar ── */
await test('iki taşlı grubun tek taş alması ko değildir, geri alınabilir', () => {
  const rows = ['O . O O O', 'O . O . O', 'O . X X X', 'O . O X X', '. O X . O'];
  const grid = new Int8Array(25);
  rows.forEach((row, y) => [...row.replace(/ /g, '')].forEach((cell, x) => { grid[y * 5 + x] = cell === 'X' ? BLACK : cell === 'O' ? WHITE : 0; }));
  const take = __test.play({ grid, size: 5, ko: -1 }, WHITE, 3, 4);
  assert.ok(take, 'hamle yasal olmalı');
  assert.equal(take.captured.length, 1);
  assert.equal(take.ko, -1, 'sahte ko doğmamalı');
});

await test('gerçek ko hâlâ yasak, pas geçince yasak kalkar', () => {
  const game = board([
    '. X O . . . . . .',
    'X . X O . . . . .',
    '. X O . . . . . .',
    ...Array(6).fill('. . . . . . . . .')]);
  game.toPlay = WHITE;
  assert.equal(playMove(game, 1, 1).ok, true);
  assert.equal(game.ko, pointOf(2, 1));
  assert.equal(illegalReason(game, 2, 1), 'KO');
  passTurn(game);
  assert.equal(game.ko, -1);
  passTurn(game);
  assert.equal(game.phase, 'counting');
});

await test('handikapta ilk hamle beyazın, geçmişe taş yazılmaz', () => {
  const game = createGame(gameSettings(createLadder()));
  assert.equal(game.toPlay, WHITE);
  assert.equal(game.history.length, 0);
  assert.equal(game.grid.reduce((n, c) => n + (c === BLACK), 0), 4);
  assert.equal(game.komi, 0.5);
});

await test('ölü taş önerisi ve dokunarak düzeltme sayımı değiştirir', () => {
  const game = board([
    '. . X O . . . . .',
    '. O X O . . . . .',
    '. . X O . . . . .',
    '. . X O . . . . .',
    'X X X O . . . . .',
    'O O O O . . . . .',
    ...Array(3).fill('. . . . . . . . .')]);
  passTurn(game); passTurn(game);
  const raw = scoreGame(game);
  const ownership = new Float32Array(81).fill(-0.9);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (!(y === 4 && x > 2)) ownership[pointOf(x, y)] = 0.8;
  suggestDead(game, ownership);
  assert.ok(game.dead.has(pointOf(1, 1)), 'ölü beyaz taş önerilmeli');
  assert.equal(game.dead.size, 1, 'canlı gruplar ölü sayılmamalı');
  const cleaned = scoreGame(game);
  assert.equal(cleaned.black, raw.black + 8, 'bölge siyaha dönmeli');
  toggleDead(game, 1, 1);
  assert.equal(scoreGame(game).black, raw.black, 'dokunuş geri almalı');
  toggleDead(game, 1, 1);
  const result = finishCounting(game);
  assert.equal(game.phase, 'over');
  assert.equal(result.black + result.white + 0, cleaned.black + cleaned.white);
});

await test('skor: taş + bölge toplamı komiyle kazananı verir', () => {
  const game = createGame({ komi: 0.5 });
  const score = scoreGame(game);
  assert.equal(score.black, 0);
  assert.equal(score.winner, WHITE);
});

await test('teslim oyunu sayımsız bitirir', () => {
  const game = createGame();
  assert.equal(resign(game).resigned, true);
  assert.equal(game.phase, 'over');
  assert.equal(playMove(game, 0, 0).ok, false);
});

/* ── Handikap merdiveni ── */
await test('yeni oyuncu 4 taşla başlar', () => {
  const settings = gameSettings(createLadder());
  assert.equal(settings.stones.length, 4);
  assert.equal(settings.index, 0);
});

await test('her galibiyet bir basamak çıkarır, yenilgi değiştirmez', () => {
  let ladder = createLadder();
  const stones = [];
  for (let i = 0; i < LADDER.length; i++) { stones.push(gameSettings(ladder).stones.length); ladder = recordResult(ladder, true).ladder; }
  assert.deepEqual(stones, [4, 3, 2, 0, 0]);
  const before = createLadder();
  const lost = recordResult(recordResult(before, true).ladder, false);
  assert.equal(lost.ladder.level, 1);
  assert.equal(lost.advanced, false);
  assert.equal(lost.ladder.games, 2);
});

await test('merdiven tepede durur, son basamak komili eşit oyundur', () => {
  let ladder = { ...createLadder(), level: LADDER.length - 1 };
  const result = recordResult(ladder, true);
  assert.equal(result.ladder.level, LADDER.length - 1);
  assert.equal(result.advanced, false);
  assert.equal(gameSettings(result.ladder).komi, 6.5);
  assert.equal(gameSettings({ ...ladder, level: 3 }).komi, 0.5);
});

await test('bozuk ve eski merdiven verisi güvenle sıfırlanır', () => {
  for (const raw of ['{bozuk', '{"version":99}', '{"version":1,"level":9,"wins":0,"games":0}', '{"version":1,"level":-1,"wins":0,"games":0}']) {
    assert.deepEqual(loadLadder(raw), createLadder());
  }
  assert.equal(loadLadder(JSON.stringify({ version: 1, level: 2, wins: 2, games: 3 })).level, 2);
});

/* ── Ağ girdileri ── */
await test('V7 girdileri: taşlar, nefes, ko, geçmiş, komi', () => {
  const game = board(['X O . . . . . . .', ...Array(8).fill('. . . . . . . . .')]);
  game.toPlay = BLACK;
  game.ko = pointOf(4, 4);
  const { bin, global } = buildInputs({ ...positionOf(game), history: [{ color: BLACK, point: 0 }, { color: WHITE, point: 1 }] });
  const at = (x, y, c) => bin[(y * 19 + x) * NET_CHANNELS + c];
  assert.equal(at(0, 0, 1), 1, 'sıradaki oyuncunun taşı');
  assert.equal(at(1, 0, 2), 1, 'rakip taşı');
  assert.equal(at(0, 0, 3), 1, 'tek nefes');
  assert.equal(at(1, 0, 4), 1, 'iki nefes');
  assert.equal(at(8, 8, 0), 1, 'tahta içi');
  assert.equal(at(9, 9, 0), 0, 'tahta dışı');
  assert.equal(at(4, 4, 6), 1, 'ko');
  assert.equal(at(1, 0, 9), 1, 'son hamle');
  assert.equal(at(0, 0, 10), 1, 'bir önceki hamle');
  assert.ok(Math.abs(global[5] + 6.5 / 20) < 1e-6, 'siyah için eksi komi');
  assert.equal(komiWave(6.5, 9), -0.5);
});

await test('pas geçmişi ve oyunu bitiren pas işaretlenir', () => {
  const { global } = buildInputs({ ...positionOf(createGame()), history: [{ color: WHITE, point: -1 }] });
  assert.equal(global[0], 1);
  assert.equal(global[14], 1);
});

await test('ağ çıktıları okunur: politika toplamı 1, sahiplik siyah açısından', () => {
  const raw = new Float32Array(362).fill(-5); raw[0] = 2; raw[361] = 1;
  const policy = readPolicy(raw, 9);
  assert.equal(policy.length, 82);
  assert.ok(Math.abs(policy.reduce((s, v) => s + v, 0) - 1) < 1e-5);
  assert.ok(policy[0] > policy[81]);
  assert.ok(readWinrate([3, 0, -9]) > 0.9);
  const own = new Float32Array(361).fill(0); own[0] = 3;
  assert.ok(readOwnership(own, 9, WHITE)[0] < -0.9, 'beyaz sırasında işaret döner');
});

/* ── Arama ── */
function fakeEval(top, { winrate = 0.5, own = 0.2, pass = 1e-4 } = {}) {
  return async position => {
    const n = position.size * position.size;
    const policy = new Float32Array(n + 1).fill(1e-4);
    if (position.grid[top] === 0) policy[top] = 0.9;
    policy[n] = pass;
    return { policy, winrate, ownership: new Float32Array(n).fill(own) };
  };
}

await test('arama yasal hamleleri sıralar, kendi gözünü doldurmaz', async () => {
  const game = board([
    '. X . . . . . . .', 'X . . . . . . . .', ...Array(7).fill('. . . . . . . . .')]);
  const result = await searchPosition(positionOf(game), fakeEval(0));
  assert.ok(!result.moves.some(m => m.point === 0), 'göz doldurulmamalı');
  assert.equal(result.moves.reduce((s, m) => s + m.visits, 0), ROBOT_STRENGTH.visits - 1);
});

await test('arama aday bulur, ziyaret sayısı sabittir', async () => {
  let calls = 0;
  const evaluate = fakeEval(pointOf(4, 4));
  const result = await searchPosition(positionOf(createGame()), p => { calls++; return evaluate(p); });
  assert.equal(result.moves[0].point, pointOf(4, 4));
  assert.equal(calls, ROBOT_STRENGTH.visits);
});

await test('süre dolunca arama en az ilk değerlendirmeyle biter', async () => {
  let calls = 0;
  const evaluate = fakeEval(pointOf(4, 4));
  await searchPosition(positionOf(createGame()), p => { calls++; return evaluate(p); }, { deadline: Date.now() - 1 });
  assert.equal(calls, 1);
});

await test('robot önde ve oyuncu pas geçtiyse oyunu bitirir, gerideyse sürdürür', async () => {
  const game = board(['X . . . . . . . .', ...Array(8).fill('. . . . . . . . .')], {});
  game.toPlay = WHITE;
  game.history.push({ color: BLACK, point: -1 });
  const position = positionOf(game);
  const behind = await searchPosition(position, fakeEval(pointOf(4, 4), { own: 0.9 }));
  assert.notEqual(chooseRobotMove(behind, position), -1, 'gerideyken pas geçmemeli');
  const ahead = await searchPosition(position, fakeEval(pointOf(4, 4), { own: -0.9 }));
  assert.equal(chooseRobotMove(ahead, position), -1);
});

await test('robot erken oyunda pas geçmez', async () => {
  const position = positionOf(createGame());
  const analysis = await searchPosition(position, fakeEval(pointOf(4, 4), { pass: 0.99 }));
  assert.notEqual(chooseRobotMove(analysis, position, () => 0.1), -1);
});

await test('alan farkı komiyi hesaba katar', () => {
  assert.equal(estimateLead(new Float32Array(81).fill(0), 0.5), -0.5);
});

/* ── İpucu araçları ── */
await test('tehlike ipucu atarideki taşı ve nefesini gösterir', () => {
  const game = board([
    'X O . . . . . . .', 'O . . . . . . . .', ...Array(7).fill('. . . . . . . . .')]);
  // (0,0) siyah: nefesi yok değil; aşağıda tek nefesli kurulur
  game.grid[pointOf(0, 1)] = 0;
  const hint = dangerHint(game, BLACK);
  assert.equal(hint.kind, 'danger');
  assert.deepEqual(hint.marks, [{ x: 0, y: 1 }]);
});

await test('tehlike yoksa yakalama fırsatı, o da yoksa sakin ipucu', () => {
  const chance = board(['O X . . . . . . .', ...Array(8).fill('. . . . . . . . .')]);
  assert.equal(dangerHint(chance, BLACK).kind, 'chance');
  assert.equal(dangerHint(createGame(), BLACK).kind, 'calm');
});

await test('bölge adları Türkçe ve doğrudur', () => {
  assert.equal(regionName(7, 1, 9), 'sağ üst köşe');
  assert.equal(regionName(1, 7, 9), 'sol alt köşe');
  assert.equal(regionName(4, 4, 9), 'merkez');
  assert.equal(regionName(4, 8, 9), 'alt kenar');
});

const analysisOf = (...points) => ({
  moves: points.map((point, i) => ({ point, x: point % 9, y: (point / 9) | 0, visits: 5 - i, prior: 0.5 })),
  ownership: new Float32Array(81),
});

await test('bölge ipucu hamleyi söylemez, çevresini işaretler', () => {
  const hint = regionHint(createGame(), analysisOf(pointOf(6, 2)));
  assert.match(hint.text, /sağ üst köşe/);
  assert.ok(hint.marks.length >= 4);
});

await test('hamle ipucu nedenini söyler', () => {
  const game = board(['O X . . . . . . .', ...Array(8).fill('. . . . . . . . .')]);
  game.toPlay = BLACK;
  assert.match(moveReason(game, BLACK, { x: 0, y: 1, point: pointOf(0, 1) }), /1 taş yakalar/);
  const hint = moveHint(game, analysisOf(pointOf(0, 1)));
  assert.match(hint.text, /A8/);
  assert.deepEqual(hint.ghost, { x: 0, y: 1 });
});

await test('tahmini alan: toplam 81, boş noktaya pul, komi farkta', () => {
  const game = board(['X . . . . . . . .', ...Array(8).fill('. . . . . . . . .')], { komi: 0.5 });
  const ownership = new Float32Array(81).fill(-0.9);
  ownership[0] = 0.9; ownership[1] = 0.9;
  const estimate = territoryEstimate(game, ownership);
  assert.equal(estimate.black + estimate.white, 81);
  assert.equal(estimate.leader, WHITE);
  assert.equal(estimate.marks.find(m => m.x === 1 && m.y === 0).color, 'black');
  assert.ok(!estimate.marks.some(m => m.x === 0 && m.y === 0), 'taşın üstüne pul konmaz');
  assert.equal(estimate.early, false);
  assert.equal(territoryEstimate(createGame(), new Float32Array(81)).early, true);
});

await test('kendini atariye sokma uyarılır, yakalayan hamle uyarılmaz', () => {
  const game = board([
    '. O . . . . . . .', 'O . O . . . . . .', '. O . . . . . . .', ...Array(6).fill('. . . . . . . . .')]);
  game.grid[pointOf(1, 2)] = 0;
  assert.match(selfAtariWarning(game, BLACK, 1, 1), /tek nefesi/);
  assert.equal(selfAtariWarning(createGame(), BLACK, 4, 4), null);
  const capture = board(['O X . . . . . . .', ...Array(8).fill('. . . . . . . . .')]);
  assert.equal(selfAtariWarning(capture, BLACK, 0, 1), null);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
