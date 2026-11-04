/**
 * core/robotGame.js
 *
 * Robotla oyunun tek gerçek durumu. Saf: DOM ve worker bilmez, Node'da test
 * edilir. Oyuncu hep siyah, robot hep beyazdır; zorluğu handikap belirler.
 *
 * Aşamalar: play → (iki pas) counting → over; teslimde doğrudan over.
 * Sayımda ölü taşlar önce robotun önerisiyle işaretlenir, oyuncu grup grup
 * düzeltir. Puan alan sayımıdır: taş + bölge, beyaza komi.
 */
import { finalScore, groupAt, playStone } from './goAI.js';

export const BOARD_SIZE = 9;
export const BLACK = 1;
export const WHITE = 2;

/** Sahiplik bu eşiği aşacak kadar rakibe aitse grup ölü sayılır. */
const DEAD_THRESHOLD = 0.5;

export const pointOf = (x, y, size = BOARD_SIZE) => y * size + x;
export const xyOf = (point, size = BOARD_SIZE) => ({ x: point % size, y: (point / size) | 0 });

export function createGame({ stones = [], komi = 6.5 } = {}) {
  const grid = new Int8Array(BOARD_SIZE * BOARD_SIZE);
  for (const { x, y } of stones) grid[pointOf(x, y)] = BLACK;
  return {
    size: BOARD_SIZE,
    grid,
    ko: -1,
    komi,
    toPlay: stones.length ? WHITE : BLACK,   // handikapta ilk hamle beyazın
    handicap: stones.map(s => ({ ...s })),
    history: [],
    captures: { [BLACK]: 0, [WHITE]: 0 },
    passes: 0,
    phase: 'play',
    dead: new Set(),
    result: null,
  };
}

/** Motora gönderilen konum. Grid kopyalanır: worker'a aktarılabilir. */
export function positionOf(game) {
  return {
    grid: game.grid.slice(),
    size: game.size,
    ko: game.ko,
    komi: game.komi,
    toPlay: game.toPlay,
    history: game.history.slice(-5).map(h => ({ color: h.color, point: h.point })),
  };
}

/** Yasadışı hamlenin nedeni; yasalsa null. */
export function illegalReason(game, x, y) {
  const point = pointOf(x, y, game.size);
  if (game.grid[point]) return 'OCCUPIED';
  if (point === game.ko) return 'KO';
  return playStone(game, game.toPlay, x, y) ? null : 'SUICIDE';
}

export function playMove(game, x, y) {
  if (game.phase !== 'play') return { ok: false, reason: 'NOT_PLAYING' };
  const reason = illegalReason(game, x, y);
  if (reason) return { ok: false, reason };
  const color = game.toPlay;
  const result = playStone(game, color, x, y);
  game.grid = result.grid;
  game.ko = result.ko;
  game.captures[color] += result.captured.length;
  game.history.push({ color, point: pointOf(x, y, game.size) });
  game.passes = 0;
  game.toPlay = 3 - color;
  return { ok: true, captured: result.captured.map(point => xyOf(point, game.size)) };
}

export function passTurn(game) {
  if (game.phase !== 'play') return { ok: false, reason: 'NOT_PLAYING' };
  game.history.push({ color: game.toPlay, point: -1 });
  game.ko = -1;              // ko yasağı yalnız bir sonraki hamle içindir
  game.passes += 1;
  game.toPlay = 3 - game.toPlay;
  if (game.passes >= 2) game.phase = 'counting';
  return { ok: true, ended: game.phase === 'counting' };
}

/** Sahiplik haritasından (siyah +) rakip alanında kalmış grupları işaretler. */
export function suggestDead(game, ownership) {
  game.dead = new Set();
  if (!ownership) return game.dead;
  const seen = new Set();
  for (let point = 0; point < game.grid.length; point++) {
    const color = game.grid[point];
    if (!color || seen.has(point)) continue;
    const { group } = groupAt(game, point);
    group.forEach(stone => seen.add(stone));
    const mean = group.reduce((sum, stone) => sum + ownership[stone], 0) / group.length;
    if (color === BLACK ? mean < -DEAD_THRESHOLD : mean > DEAD_THRESHOLD) group.forEach(stone => game.dead.add(stone));
  }
  return game.dead;
}

/** Sayımda dokunulan grubu ölü/canlı arasında değiştirir. */
export function toggleDead(game, x, y) {
  const point = pointOf(x, y, game.size);
  if (game.phase !== 'counting' || !game.grid[point]) return false;
  const { group } = groupAt(game, point);
  const wasDead = game.dead.has(point);
  group.forEach(stone => (wasDead ? game.dead.delete(stone) : game.dead.add(stone)));
  return true;
}

export function scoreGame(game) {
  const grid = game.grid.slice();
  for (const point of game.dead) grid[point] = 0;
  const detail = finalScore({ grid, size: game.size, komi: game.komi });
  const count = color => grid.reduce((sum, cell) => sum + (cell === color), 0);
  const black = count(BLACK) + detail.blackTerritory.length;
  const white = count(WHITE) + detail.whiteTerritory.length;
  return {
    black,
    white,
    komi: game.komi,
    winner: black > white + game.komi ? BLACK : WHITE,
    margin: Math.abs(black - white - game.komi),
    blackTerritory: detail.blackTerritory,
    whiteTerritory: detail.whiteTerritory,
    dead: [...game.dead].map(point => xyOf(point, game.size)),
  };
}

export function finishCounting(game) {
  if (game.phase !== 'counting') return null;
  game.phase = 'over';
  game.result = { ...scoreGame(game), resigned: false };
  return game.result;
}

export function resign(game) {
  if (game.phase === 'over') return game.result;
  game.phase = 'over';
  game.result = { winner: WHITE, resigned: true, komi: game.komi };
  return game.result;
}
