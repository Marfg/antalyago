/**
 * core/robotSearch.js
 *
 * Ağ destekli küçük PUCT araması. Ziyaret sayısı sabittir, cihaz hızına göre
 * artmaz: robotun gücü hedeflenen seviyede kalsın diye bilinçli olarak azdır.
 * Saf: `evaluate(position)` dışarıdan gelir, Node'da sahte ağla test edilir.
 *
 * evaluate → { policy: Float32Array(n+1, son eleman pas),
 *              winrate: sıradaki oyuncu için 0..1,
 *              ownership: Float32Array(n), siyah + }
 */
import { isOwnEyePoint, playStone } from './goAI.js';

/** Robotun sabit gücü. Tek ayar yeri burasıdır; bkz. tests/robotSearch.test.js */
export const ROBOT_STRENGTH = Object.freeze({
  visits: 8,          // hamle başına ağ değerlendirmesi
  hintVisits: 6,      // ipucu ve tahmini alan için
  openingPlies: 6,    // bu kadar hamle boyunca ilk adaylar arasından seçer
  openingTemperature: 0.7,
});

/* Ölçümle seçildi (scripts/ai/calibrate-robot.mjs): bu ağın kazanma oranı küçük
   tahtada oynak, sahipliği tutarlı. Değere dayanan arama (c 1,1, alan %30) saf
   politikaya 1/4 kaybetti; politikaya güvenip alana bakan ayar 4/6 kazandı. */
const C_PUCT = 2.5;
const FPU_PENALTY = 0.2;
const AREA_WEIGHT = 0.85;
const AREA_SCALE = 12;

export function estimateLead(ownership, komi) {
  let sum = 0;
  for (const value of ownership) sum += value;
  return sum - komi;     // siyah alanı − beyaz alanı − komi
}

function nextPosition(pos, point) {
  const color = pos.toPlay;
  const history = [...pos.history, { color, point }].slice(-5);
  if (point < 0) return { ...pos, ko: -1, toPlay: 3 - color, history };
  const result = playStone(pos, color, point % pos.size, (point / pos.size) | 0);
  return result && { ...pos, grid: result.grid, ko: result.ko, toPlay: 3 - color, history };
}

/** Değer, sıradaki oyuncu açısından -1..1. */
function nodeValue(pos, ev, areaWeight) {
  const lead = estimateLead(ev.ownership, pos.komi) * (pos.toPlay === 1 ? 1 : -1);
  return (2 * ev.winrate - 1) * (1 - areaWeight) + Math.tanh(lead / AREA_SCALE) * areaWeight;
}

async function expand(node, evaluate, tuning) {
  const { pos } = node;
  const ev = await evaluate(pos);
  const total = pos.size * pos.size;
  const edges = [];
  let sum = 0;
  for (let point = 0; point < total; point++) {
    if (pos.grid[point] || point === pos.ko) continue;
    if (isOwnEyePoint(pos, point, pos.toPlay)) continue;
    if (!playStone(pos, pos.toPlay, point % pos.size, (point / pos.size) | 0)) continue;
    edges.push({ point, prior: ev.policy[point], visits: 0, value: 0, child: null });
    sum += ev.policy[point];
  }
  edges.push({ point: -1, prior: ev.policy[total], visits: 0, value: 0, child: null });
  sum += ev.policy[total];
  for (const edge of edges) edge.prior /= sum || 1;
  node.edges = edges;
  node.ev = ev;
  node.value = nodeValue(pos, ev, tuning.areaWeight);
  return node.value;
}

function selectEdge(node, tuning) {
  const root = Math.sqrt(Math.max(1, node.visits));
  const fpu = node.value - FPU_PENALTY;
  let best = null, bestScore = -Infinity;
  for (const edge of node.edges) {
    const q = edge.visits ? edge.value / edge.visits : fpu;
    const score = q + tuning.cpuct * edge.prior * root / (1 + edge.visits);
    if (score > bestScore) { bestScore = score; best = edge; }
  }
  return best;
}

/** Bir yol iner, yaprağı değerlendirir; değer `node`un oyuncusu açısından döner. */
async function descend(node, evaluate, tuning) {
  if (!node.edges) return expand(node, evaluate, tuning);
  const edge = selectEdge(node, tuning);
  if (!edge.child) edge.child = { pos: nextPosition(node.pos, edge.point), edges: null, visits: 0, value: 0, ev: null };
  const value = -await descend(edge.child, evaluate, tuning);
  edge.visits += 1;
  edge.value += value;
  node.visits += 1;
  return value;
}

/**
 * @param {object} position  bkz. core/kataFeatures.js
 * @param {(p:object)=>Promise<object>} evaluate
 * @param {{visits?:number, deadline?:number}} [options]  deadline: yavaş cihazda erken durma (ms, Date.now)
 * @returns {Promise<{moves:Array, winrate:number, ownership:Float32Array}>}
 *   moves ziyarete göre sıralı: {point, x, y, visits, prior, q}; pas point=-1
 */
export async function searchPosition(position, evaluate, { visits = ROBOT_STRENGTH.visits, deadline = Infinity, cpuct = C_PUCT, areaWeight = AREA_WEIGHT } = {}) {
  const tuning = { cpuct, areaWeight };
  const root = { pos: position, edges: null, visits: 0, value: 0, ev: null };
  await expand(root, evaluate, tuning);
  for (let i = 1; i < visits; i++) {
    if (Date.now() > deadline) break;
    await descend(root, evaluate, tuning);
  }
  const size = position.size;
  const moves = root.edges
    .filter(edge => edge.visits > 0 || edge.prior > 0)
    .map(edge => ({
      point: edge.point,
      x: edge.point < 0 ? -1 : edge.point % size,
      y: edge.point < 0 ? -1 : (edge.point / size) | 0,
      visits: edge.visits,
      prior: edge.prior,
      q: edge.visits ? edge.value / edge.visits : null,
    }))
    .sort((a, b) => b.visits - a.visits || b.prior - a.prior);
  return { moves, winrate: root.ev.winrate, ownership: root.ev.ownership };
}

/**
 * Aramadan hamle seçer: açılışta çeşitlilik, oyun sonunda dürüst pas.
 * Oyuncu pas geçtiyse ve robot alan tahmininde öndeyse oyunu uzatmaz.
 * @returns {number} nokta indeksi, -1 pas
 */
export function chooseRobotMove(analysis, position, rng = Math.random) {
  const { moves, ownership } = analysis;
  const color = position.toPlay;
  const last = position.history[position.history.length - 1];
  const playerPassed = Boolean(last && last.point < 0);
  const ahead = estimateLead(ownership, position.komi) * (color === 1 ? 1 : -1) > 0;
  if (playerPassed && ahead) return -1;

  const stones = position.grid.reduce((sum, cell) => sum + (cell !== 0), 0);
  const placing = moves.filter(move => move.point >= 0);
  if (!placing.length) return -1;
  if (stones < position.size) {           // erken oyunda pas yok
    if (stones <= ROBOT_STRENGTH.openingPlies) return sampleOpening(placing, rng);
    return placing[0].point;
  }
  return moves[0].point;
}

function sampleOpening(moves, rng) {
  const pool = moves.slice(0, 4);
  const weights = pool.map(move => Math.pow(move.visits + move.prior * 8, 1 / ROBOT_STRENGTH.openingTemperature));
  let cursor = rng() * weights.reduce((sum, value) => sum + value, 0);
  for (let i = 0; i < pool.length; i++) {
    cursor -= weights[i];
    if (cursor <= 0) return pool[i].point;
  }
  return pool[0].point;
}
