/**
 * core/hintTools.js
 *
 * İpucu havuzu: Hamle ve Tahmini Alan.
 * Saf: tahta ve motor çıktısından metin ve işaret üretir, çizimi sayfa yapar.
 */
import { groupAt, playStone } from './goAI.js?v=2026-11-05.robot';
import { BLACK, xyOf } from './robotGame.js?v=2026-11-05.robot';

const OWN_MARK = 0.6;          // tahtada pul gösterilecek güven
const SETTLED_RATIO = 0.25;    // tahtanın bu kadarı belli değilse "henüz erken"

const placing = analysis => analysis.moves.filter(move => move.point >= 0);

/** Hamlenin kısa nedeni. Yalnız kesin olan söylenir, gerisi genel kalır. */
export function moveReason(game, color, move) {
  const result = playStone(game, color, move.x, move.y);
  if (!result) return 'Bu noktayı düşünebilirsin.';
  if (result.captured.length) return `Burası ${result.captured.length} taş yakalar.`;
  const after = { ...game, grid: result.grid, ko: result.ko };
  const own = groupAt(after, move.point);
  const neighbours = [move.point - game.size, move.point + game.size, move.x > 0 ? move.point - 1 : -1, move.x < game.size - 1 ? move.point + 1 : -1]
    .filter(n => n >= 0 && n < game.grid.length);
  const rescued = neighbours.some(n => game.grid[n] === color && groupAt(game, n).libs.length === 1);
  if (rescued && own.libs.length > 1) return 'Atari altındaki taşlarını kurtarır.';
  const allies = new Set();
  for (const n of neighbours) if (game.grid[n] === color) allies.add(Math.min(...groupAt(game, n).group));
  if (allies.size > 1) return 'Ayrı duran taşlarını birbirine bağlar.';
  const attacks = neighbours.some(n => result.grid[n] === 3 - color && groupAt(after, n).libs.length === 1);
  if (attacks) return 'Robotun taşlarına atari yapar.';
  return 'Robotun bu bölgede alan kurmasını zorlaştırır, kendi alanını genişletir.';
}

/** En fazla iki aday ve nedeni. */
export function moveHint(game, analysis) {
  const moves = placing(analysis).slice(0, 2);
  if (!moves.length) return { kind: 'move', text: 'Yararlı hamle görünmüyor; pas geçebilirsin.', marks: [] };
  const [first, second] = moves;
  const name = move => `${'ABCDEFGHJ'[move.x]}${game.size - move.y}`;
  const close = second && second.visits + second.prior * 8 >= (first.visits + first.prior * 8) * 0.5;
  const shown = close ? moves : [first];
  return {
    kind: 'move',
    text: `${shown.map(name).join(' veya ')}: ${moveReason(game, game.toPlay, first)}`,
    marks: shown.map(({ x, y }) => ({ x, y })),
    ghost: { x: first.x, y: first.y },
  };
}

/**
 * Tahmini alan: siyah/beyaz toplamı, fark ve tahta pulları.
 * Toplamlar sahiplikten gelir, kesin sayım değildir.
 */
export function territoryEstimate(game, ownership) {
  let black = 0, unsure = 0;
  const marks = [];
  for (let point = 0; point < ownership.length; point++) {
    const value = ownership[point];
    black += (value + 1) / 2;
    if (Math.abs(value) < OWN_MARK) { unsure += 1; continue; }
    if (!game.grid[point]) marks.push({ ...xyOf(point, game.size), color: value > 0 ? 'black' : 'white' });
  }
  const total = ownership.length;
  const white = total - black;
  const lead = black - white - game.komi;
  return {
    black: Math.round(black),
    white: Math.round(white),
    komi: game.komi,
    lead,
    leader: lead > 0 ? BLACK : 3 - BLACK,
    blackShare: black / total,
    early: unsure / total > 1 - SETTLED_RATIO,
    marks,
  };
}

/** Kendini atariye sokan hamle: taş alınabilir mi? Uyarı metni ya da null. */
export function selfAtariWarning(game, color, x, y) {
  const result = playStone(game, color, x, y);
  if (!result || result.captured.length) return null;
  const point = y * game.size + x;
  const own = groupAt({ ...game, grid: result.grid }, point);
  if (own.libs.length !== 1) return null;
  const n = own.group.length;
  return n === 1
    ? 'Bu taşın tek nefesi olacak, robot hemen alabilir.'
    : `Bu ${n} taşlık grubun tek nefesi kalacak, robot hepsini alabilir.`;
}
