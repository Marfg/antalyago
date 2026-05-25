/**
 * core/goAI.js
 *
 * 9×9 Go için Monte Carlo Tree Search (MCTS / UCT) motoru.
 * Saf JS — DOM, canvas, render bağımlılığı yok.
 * Web Worker içinde çalıştırılmak üzere tasarlandı.
 *
 * Dışa: getBestMove(boardData, color, timeMs) → {x,y,iters} | 'pass'
 */

// ── Sabitler ──────────────────────────────────────────────────────────
const C_EXPLORE = 1.4;  // UCT keşif sabiti
const KOMI      = 6.5;  // beyaz komi
const MAX_PLY   = 200;  // rollout hamle sınırı (döngü koruması)

// Generation-tabanlı 'seen' dizisi — her groupAndLibs çağrısında
// yeni dizi oluşturmak yerine tek dizi yeniden kullanılır.
const _seen = new Int32Array(19 * 19); // 19×19 maksimum
let   _gen  = 0;

// ── Komşu tablosu (boyut değişmediği sürece önbelleğe alınır) ────────

function buildNeighborTable(size) {
  const t = [];
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = (i / size) | 0;
    const ns = [];
    if (x > 0)        ns.push(i - 1);
    if (x < size - 1) ns.push(i + 1);
    if (y > 0)        ns.push(i - size);
    if (y < size - 1) ns.push(i + size);
    t.push(ns);
  }
  return t;
}

let _nbrCache = null, _nbrSize = 0;
function getNeighborTable(size) {
  if (size !== _nbrSize) { _nbrCache = buildNeighborTable(size); _nbrSize = size; }
  return _nbrCache;
}

// ── Board işlemleri ───────────────────────────────────────────────────

/**
 * start noktasından flood-fill: grup + libertyler.
 * grid: Int8Array (0=boş, 1=siyah, 2=beyaz)
 */
function groupAndLibs(grid, nbr, start) {
  _gen++;
  const gen   = _gen;
  const color = grid[start];
  if (!color) return { group: [], libs: new Set() };

  const group = [], libs = new Set();
  const stack = [start];

  while (stack.length) {
    const i = stack.pop();
    if (_seen[i] === gen) continue;
    _seen[i] = gen;
    if (grid[i] !== color) continue;
    group.push(i);
    for (const n of nbr[i]) {
      if (!grid[n])           libs.add(n);
      else if (_seen[n] !== gen) stack.push(n);
    }
  }
  return { group, libs };
}

/**
 * Taş yerleştir; geçersizse (dolu/ko/intihar) → null.
 * Geçerliyse → { grid: yeni Int8Array, ko: yeni ko flat-index | -1 }
 */
function placeStone(grid, nbr, size, i, color, ko) {
  if (grid[i] !== 0 || i === ko) return null;

  const opp     = color === 1 ? 2 : 1;
  const ng      = grid.slice();
  ng[i]         = color;

  const captured = [];
  const checked  = new Set();

  for (const n of nbr[i]) {
    if (ng[n] !== opp || checked.has(n)) continue;
    const { group, libs } = groupAndLibs(ng, nbr, n);
    group.forEach(g => checked.add(g));
    if (libs.size === 0) {
      for (const g of group) { ng[g] = 0; captured.push(g); }
    }
  }

  // İntihar kontrolü
  const { libs: myLibs } = groupAndLibs(ng, nbr, i);
  if (myLibs.size === 0) return null;

  // Ko noktası tespiti
  let newKo = -1;
  if (captured.length === 1) {
    const { libs: sl } = groupAndLibs(ng, nbr, i);
    if (sl.size === 1) newKo = captured[0];
  }

  return { grid: ng, ko: newKo };
}

/**
 * Tüm yasal hamleleri flat index dizisi olarak döndür.
 */
function legalMoves(grid, nbr, size, color, ko) {
  const moves = [];
  const total = size * size;
  for (let i = 0; i < total; i++) {
    if (grid[i] !== 0 || i === ko) continue;
    if (placeStone(grid, nbr, size, i, color, ko)) moves.push(i);
  }
  return moves;
}

// ── Puanlama — Tromp-Taylor alan sayımı ──────────────────────────────

function scoreBoard(grid, nbr, size) {
  const seen = new Uint8Array(size * size);
  let b = 0, w = 0;

  for (let i = 0; i < size * size; i++) {
    if (grid[i] === 1) { b++; continue; }
    if (grid[i] === 2) { w++; continue; }
    if (seen[i]) continue;

    const region = [], stack = [i];
    let tB = false, tW = false;

    while (stack.length) {
      const cur = stack.pop();
      if (seen[cur]) continue;
      seen[cur] = 1;
      if (grid[cur] === 1) { tB = true; continue; }
      if (grid[cur] === 2) { tW = true; continue; }
      region.push(cur);
      for (const n of nbr[cur]) if (!seen[n]) stack.push(n);
    }

    if (tB && !tW) b += region.length;
    else if (tW && !tB) w += region.length;
  }

  return b - w - KOMI; // pozitif → siyah kazanır
}

// scoreBoard'un bölge noktalarını da döndüren versiyonu (finalScore için)
function scoreBoardDetailed(grid, nbr, size) {
  const seen = new Uint8Array(size * size);
  let b = 0, w = 0;
  const bT = [], wT = [];

  for (let i = 0; i < size * size; i++) {
    if (grid[i] === 1) { b++; continue; }
    if (grid[i] === 2) { w++; continue; }
    if (seen[i]) continue;

    const region = [], stack = [i];
    let tB = false, tW = false;

    while (stack.length) {
      const cur = stack.pop();
      if (seen[cur]) continue;
      seen[cur] = 1;
      if (grid[cur] === 1) { tB = true; continue; }
      if (grid[cur] === 2) { tW = true; continue; }
      region.push(cur);
      for (const n of nbr[cur]) if (!seen[n]) stack.push(n);
    }

    if (tB && !tW)      { b += region.length; region.forEach(r => bT.push({ x: r % size, y: (r / size) | 0 })); }
    else if (tW && !tB) { w += region.length; region.forEach(r => wT.push({ x: r % size, y: (r / size) | 0 })); }
  }

  return { score: b - w - KOMI, blackTerritory: bT, whiteTerritory: wT };
}

// ── Rollout hamle seçimi ──────────────────────────────────────────────

function isOwnEye(grid, nbr, i, color) {
  for (const n of nbr[i]) {
    if (grid[n] !== color) return false;
  }
  return true;
}

function isSelfAtari(grid, nbr, size, i, color, ko) {
  const res = placeStone(grid, nbr, size, i, color, ko);
  if (!res) return true;
  const { libs } = groupAndLibs(res.grid, nbr, i);
  return libs.size === 1;
}

function pickMove(grid, nbr, size, moves, color, ko) {
  const opp = color === 1 ? 2 : 1;

  // Öncelik 1: atari'deki rakip grubu yakala
  for (const i of moves) {
    for (const n of nbr[i]) {
      if (grid[n] === opp) {
        const { libs } = groupAndLibs(grid, nbr, n);
        if (libs.size === 1) return i;
      }
    }
  }

  // Öncelik 2: kendi grubunu atariden kurtar
  for (const i of moves) {
    for (const n of nbr[i]) {
      if (grid[n] === color) {
        const { libs } = groupAndLibs(grid, nbr, n);
        if (libs.size === 1) return i;
      }
    }
  }

  // Kendi gözünü doldurmayan hamleleri seç
  let pool = moves.filter(i => !isOwnEye(grid, nbr, i, color));
  if (!pool.length) pool = moves;

  // Self-atari olmayan hamleleri tercih et
  if (pool.length > 1) {
    const nonSA = pool.filter(i => !isSelfAtari(grid, nbr, size, i, color, ko));
    if (nonSA.length) pool = nonSA;
  }

  return pool[(Math.random() * pool.length) | 0];
}

// ── MCTS Düğümü ───────────────────────────────────────────────────────

class Node {
  constructor(grid, ko, color, move, parent) {
    this.grid     = grid;
    this.ko       = ko;
    this.color    = color;   // oynayacak renk: 1|2
    this.move     = move;    // flat index | -1 (pas) | -999 (oyun bitti) | null (kök)
    this.parent   = parent;
    this.children = [];
    this.visits   = 0;
    this.wins     = 0;
    this._untried = null;    // lazy init
  }

  _init(nbr, size) {
    if (this._untried) return;
    if (this.move === -999) { this._untried = []; return; }
    const m = legalMoves(this.grid, nbr, size, this.color, this.ko);
    // Fisher-Yates karıştır
    for (let i = m.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [m[i], m[j]] = [m[j], m[i]];
    }
    m.unshift(-1); // pas en son denenir
    this._untried = m;
  }

  fullyExpanded() { return this._untried?.length === 0; }

  ucb(pv) {
    if (!this.visits) return Infinity;
    return this.wins / this.visits + C_EXPLORE * Math.sqrt(Math.log(pv) / this.visits);
  }
}

// ── MCTS Adımları ─────────────────────────────────────────────────────

function select(node) {
  while (node.fullyExpanded() && node.children.length) {
    node = node.children.reduce((b, c) =>
      c.ucb(node.visits) > b.ucb(node.visits) ? c : b);
  }
  return node;
}

function expand(node, nbr, size) {
  node._init(nbr, size);
  if (!node._untried.length) return node;

  const mi      = node._untried.pop();
  const nextCol = node.color === 1 ? 2 : 1;

  if (mi === -1) {
    const isGameOver = node.move === -1; // iki ardışık pas
    const child = new Node(node.grid.slice(), -1, nextCol,
                           isGameOver ? -999 : -1, node);
    node.children.push(child);
    return child;
  }

  const res = placeStone(node.grid, nbr, size, mi, node.color, node.ko);
  if (!res) return expand(node, nbr, size); // nadir geçersizlik, tekrar dene

  const child = new Node(res.grid, res.ko, nextCol, mi, node);
  node.children.push(child);
  return child;
}

function rollout(node, nbr, size, rootColor) {
  let grid   = node.grid.slice();
  let ko     = node.ko;
  let color  = node.color;
  let passes = node.move === -1 ? 1 : 0;
  let ply    = 0;

  while (passes < 2 && ply < MAX_PLY) {
    const legal = legalMoves(grid, nbr, size, color, ko);

    if (!legal.length) {
      passes++; ko = -1;
    } else {
      passes = 0;
      const mi  = pickMove(grid, nbr, size, legal, color, ko);
      const res = placeStone(grid, nbr, size, mi, color, ko);
      if (res) { grid = res.grid; ko = res.ko; }
      else     { passes++; ko = -1; }
    }

    color = color === 1 ? 2 : 1;
    ply++;
  }

  const s = scoreBoard(grid, nbr, size);
  return rootColor === 1 ? (s > 0 ? 1 : 0) : (s < 0 ? 1 : 0);
}

function backprop(node, win) {
  while (node) {
    node.visits++;
    node.wins += win;
    win  = 1 - win; // alternatif perspektif
    node = node.parent;
  }
}

// ── Dışa Açık API ────────────────────────────────────────────────────

/**
 * En iyi hamleyi hesapla.
 *
 * @param {{ grid: Int8Array, ko: number, size: number }} boardData
 * @param {1|2} color  — 1: siyah, 2: beyaz
 * @param {number} timeMs
 * @returns {{ x: number, y: number, iters: number } | 'pass'}
 */
export function getBestMove(boardData, color, timeMs = 2000) {
  const { grid, ko, size } = boardData;
  const nbr = getNeighborTable(size);

  const root    = new Node(grid.slice(), ko, color, null, null);
  const endTime = Date.now() + timeMs;
  let iters     = 0;

  while (Date.now() < endTime) {
    const sel = select(root);
    const exp = expand(sel, nbr, size);
    const win = rollout(exp, nbr, size, color);
    backprop(exp, win);
    iters++;
  }

  if (!root.children.length) return 'pass';

  const best = root.children.reduce((a, b) => a.visits > b.visits ? a : b);
  if (best.move < 0) return 'pass';

  return { x: best.move % size, y: (best.move / size) | 0, iters };
}

/**
 * Tromp-Taylor puanlama — oyun bitişinde sonucu hesapla.
 * Döndürür: { blackScore, whiteScore, winner: 'black'|'white', margin }
 */
export function finalScore(boardData) {
  const { grid, size } = boardData;
  const nbr = getNeighborTable(size);
  const { score: raw, blackTerritory, whiteTerritory } = scoreBoardDetailed(grid, nbr, size);
  return {
    rawDiff: raw,
    winner:  raw > 0 ? 'black' : 'white',
    margin:  Math.abs(raw),
    komi:    KOMI,
    blackTerritory,
    whiteTerritory,
  };
}
