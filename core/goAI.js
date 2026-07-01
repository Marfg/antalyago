/**
 * core/goAI.js
 *
 * 9×9 Go için Monte Carlo Tree Search (MCTS / UCT) motoru.
 * Saf JS — DOM, canvas, render bağımlılığı yok.
 * Web Worker içinde çalıştırılmak üzere tasarlandı.
 *
 * Dışa: getBestMove(boardData, color, timeMs) → {x,y,iters} | 'pass'
 *       getBestMoveByIterations(boardData, color, iterations, options)
 */

// ── Sabitler ──────────────────────────────────────────────────────────
const C_EXPLORE = 1.4;  // UCT keşif sabiti
export const DEFAULT_KOMI = 6.5;
const MAX_PLY   = 200;  // rollout hamle sınırı (döngü koruması)

export const AI_PROFILES = Object.freeze({
  club:     Object.freeze({ id:'club',     name:'Kulüp Robotu', iterations:600, topK:1, temperature:0.08, thinkingTimeMs:1600 }),
  beginner: Object.freeze({ id:'beginner', name:'Başlangıç', iterations:40,  topK:5, temperature:0.90, thinkingTimeMs:350 }),
  medium:   Object.freeze({ id:'medium',   name:'Orta',      iterations:120, topK:3, temperature:0.35, thinkingTimeMs:750 }),
  strong:   Object.freeze({ id:'strong',   name:'Güçlü',     iterations:300, topK:1, temperature:0,    thinkingTimeMs:1400 }),
});

export function getAIProfile(profileId) {
  const profile = AI_PROFILES[profileId];
  if (!profile) throw new Error(`Bilinmeyen AI profili: ${profileId}`);
  return profile;
}

function createRng(seed) {
  if (seed === undefined || seed === null) return Math.random;
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  return { grid: ng, ko: newKo, captured };
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

function scoreBoard(grid, nbr, size, komi=DEFAULT_KOMI) {
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

  return b - w - komi; // pozitif → siyah kazanır
}

// scoreBoard'un bölge noktalarını ve ölü taşları da döndüren versiyonu (finalScore için)
function scoreBoardDetailed(grid, nbr, size, komi=DEFAULT_KOMI) {
  const seen = new Uint8Array(size * size);
  let b = 0, w = 0;
  const bT = [], wT = [];
  const bRegions = [], wRegions = []; // ölü taş tespiti için bölge indisleri

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

    if (tB && !tW)      { b += region.length; region.forEach(r => bT.push({ x: r % size, y: (r / size) | 0 })); bRegions.push(region); }
    else if (tW && !tB) { w += region.length; region.forEach(r => wT.push({ x: r % size, y: (r / size) | 0 })); wRegions.push(region); }
  }

  // Bölge noktalarından komşu düşman taşlara BFS → ölü taş listesi
  function deadFrom(regionList, enemyColor) {
    const dead = [];
    const vis   = new Uint8Array(size * size);
    const queue = [];
    for (const region of regionList)
      for (const i of region) { if (!vis[i]) { vis[i] = 1; queue.push(i); } }
    let qi = 0;
    while (qi < queue.length) {
      const i = queue[qi++];
      for (const n of nbr[i]) {
        if (vis[n]) continue;
        vis[n] = 1;
        if (grid[n] === enemyColor) {
          dead.push({ x: n % size, y: (n / size) | 0 });
          queue.push(n); // bağlı düşman taşlara da yay
        }
      }
    }
    return dead;
  }

  return {
    score:           b - w - komi,
    blackTerritory:  bT,
    whiteTerritory:  wT,
    blackDead:       deadFrom(wRegions, 1), // beyaz bölgedeki siyah taşlar
    whiteDead:       deadFrom(bRegions, 2), // siyah bölgedeki beyaz taşlar
  };
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

function tacticalMove(grid, nbr, moves, color) {
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
  return null;
}

function pickMove(grid, nbr, size, moves, color, ko, rng) {
  const tactical = tacticalMove(grid, nbr, moves, color);
  if (tactical !== null) return tactical;

  // Kendi gözünü doldurmayan hamleleri seç
  let pool = moves.filter(i => !isOwnEye(grid, nbr, i, color));
  if (!pool.length) return -1;

  // Self-atari olmayan hamleleri tercih et
  if (pool.length > 1) {
    const nonSA = pool.filter(i => !isSelfAtari(grid, nbr, size, i, color, ko));
    if (nonSA.length) pool = nonSA;
  }

  // Tahta doldukça doğal pas olasılığı artar. Acil yakalama/kurtarma varsa
  // yukarıdaki taktik seçim pası engeller. İki ardışık pas rollout'u bitirir.
  let occupied = 0;
  for (const point of grid) if (point) occupied++;
  const fill = occupied / (size * size);
  const passChance = fill < 0.55 ? 0 : Math.min(0.55, (fill - 0.55) * 1.4);
  if (rng() < passChance) return -1;

  return pool[(rng() * pool.length) | 0];
}

function pickRolloutMove(grid,nbr,size,color,ko,rng) {
  const opp=color===1?2:1;
  const total=size*size;

  for(const targetColor of [opp,color]){
    const checked=new Set();
    for(let i=0;i<total;i++){
      if(grid[i]!==targetColor||checked.has(i))continue;
      const {group,libs}=groupAndLibs(grid,nbr,i);
      group.forEach(point=>checked.add(point));
      if(libs.size!==1)continue;
      const liberty=[...libs][0];
      if(placeStone(grid,nbr,size,liberty,color,ko))return liberty;
    }
  }

  const candidates=[];
  const start=(rng()*total)|0;
  for(let offset=0;offset<total&&candidates.length<12;offset++){
    const i=(start+offset)%total;
    if(grid[i]||i===ko||isOwnEye(grid,nbr,i,color))continue;
    const result=placeStone(grid,nbr,size,i,color,ko);
    if(!result||(!result.captured.length&&groupAndLibs(result.grid,nbr,i).libs.size===1))continue;
    candidates.push(i);
  }
  if(!candidates.length)return -1;

  let occupied=0;
  for(const point of grid)if(point)occupied++;
  const fill=occupied/total;
  const passChance=fill<0.55?0:Math.min(0.55,(fill-0.55)*1.4);
  if(rng()<passChance)return -1;
  return candidates[(rng()*candidates.length)|0];
}

// ── MCTS Düğümü ───────────────────────────────────────────────────────

class Node {
  constructor(grid, ko, color, move, parent, rng) {
    this.grid     = grid;
    this.ko       = ko;
    this.color    = color;   // oynayacak renk: 1|2
    this.move     = move;    // flat index | -1 (pas) | -999 (oyun bitti) | null (kök)
    this.parent   = parent;
    this.children = [];
    this.visits   = 0;
    this.wins     = 0;
    this._untried = null;    // lazy init
    this.rng      = rng;
  }

  _init(nbr, size) {
    if (this._untried) return;
    if (this.move === -999) { this._untried = []; return; }
    const m = legalMoves(this.grid, nbr, size, this.color, this.ko);
    // Fisher-Yates karıştır
    for (let i = m.length - 1; i > 0; i--) {
      const j = (this.rng() * (i + 1)) | 0;
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
                           isGameOver ? -999 : -1, node, node.rng);
    node.children.push(child);
    return child;
  }

  const res = placeStone(node.grid, nbr, size, mi, node.color, node.ko);
  if (!res) return expand(node, nbr, size); // nadir geçersizlik, tekrar dene

  const child = new Node(res.grid, res.ko, nextCol, mi, node, node.rng);
  node.children.push(child);
  return child;
}

function rollout(node, nbr, size, rng, diagnostics = null, komi=DEFAULT_KOMI) {
  let grid   = node.grid.slice();
  let ko     = node.ko;
  let color  = node.color;
  let passes = node.move === -999 ? 2 : (node.move === -1 ? 1 : 0);
  let ply    = 0;

  while (passes < 2 && ply < MAX_PLY) {
    const mi=pickRolloutMove(grid,nbr,size,color,ko,rng);
    if(mi===-1){
      passes++; ko = -1;
    } else {
      passes = 0;
      const res=placeStone(grid,nbr,size,mi,color,ko);
      if(res){grid=res.grid;ko=res.ko;}
      else{passes++;ko=-1;}
    }

    color = color === 1 ? 2 : 1;
    ply++;
  }

  const s = scoreBoard(grid, nbr, size,komi);
  if (diagnostics) Object.assign(diagnostics, { ply, passes, endedByPasses: passes >= 2, score: s });
  return s > 0 ? 1 : (s < 0 ? 2 : 0);
}

function backprop(node, winner) {
  while (node) {
    node.visits++;
    // Düğümün değeri, bu düğüme gelmek için hamle yapan oyuncuya aittir.
    // Çocuk düğümde bu oyuncu parent.color olduğundan UCT seçimi tutarlıdır.
    const playerJustMoved = node.color === 1 ? 2 : 1;
    if (winner === playerJustMoved) node.wins++;
    else if (winner === 0) node.wins += 0.5;
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
function createSearch(boardData, color, rng) {
  const { grid, ko, size } = boardData;
  const nbr = getNeighborTable(size);
  const root = new Node(grid.slice(), ko, color, null, null, rng);
  return { root, nbr, size, komi:boardData.komi??DEFAULT_KOMI };
}

function runIteration(search, rng) {
  const sel = select(search.root);
  const exp = expand(sel, search.nbr, search.size);
  const winner = rollout(exp, search.nbr, search.size, rng,null,search.komi);
  backprop(exp, winner);
}

function searchResult(root, size, iters) {
  if (!root.children.length) return 'pass';
  const best = root.children.reduce((a, b) => a.visits > b.visits ? a : b);
  if (best.move < 0) return 'pass';
  return { x: best.move % size, y: (best.move / size) | 0, iters };
}

function isReasonableRootMove(root, nbr, size, move) {
  if (move < 0) return false;
  if (isOwnEye(root.grid, nbr, move, root.color)) return false;
  const result = placeStone(root.grid,nbr,size,move,root.color,root.ko);
  if (!result) return false;
  if (result.captured.length) return true;
  return !isSelfAtari(root.grid, nbr, size, move, root.color, root.ko);
}

function profileSearchResult(search, profile, rng, iters) {
  const reasonable = search.root.children
    .filter(child => isReasonableRootMove(search.root, search.nbr, search.size, child.move))
    .sort((a,b) => b.visits-a.visits || b.wins/Math.max(1,b.visits)-a.wins/Math.max(1,a.visits));
  if (!reasonable.length) return 'pass';

  const candidates = reasonable.slice(0, profile.topK);
  let chosen = candidates[0];
  if (profile.temperature > 0 && candidates.length > 1) {
    const weights = candidates.map(child => Math.pow(child.visits + 1, 1 / profile.temperature));
    let cursor = rng() * weights.reduce((sum,value) => sum+value,0);
    for (let i=0;i<candidates.length;i++) {
      cursor -= weights[i];
      if (cursor <= 0) { chosen=candidates[i]; break; }
    }
  }
  return { x:chosen.move%search.size, y:(chosen.move/search.size)|0, iters, profile:profile.id };
}

export function getBestMove(boardData, color, timeMs = 2000) {
  const rng = createRng();
  const search = createSearch(boardData, color, rng);
  const endTime = Date.now() + timeMs;
  let iters = 0;

  while (Date.now() < endTime) {
    runIteration(search, rng);
    iters++;
  }
  return searchResult(search.root, search.size, iters);
}

/** Sabit iterasyonlu, seed edilebilir arama. Süre tabanlı API'yi değiştirmez. */
export function getBestMoveByIterations(boardData, color, iterations, options = {}) {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('iterations pozitif bir tam sayı olmalı');
  const rng = createRng(options.seed);
  const search = createSearch(boardData, color, rng);
  for (let i = 0; i < iterations; i++) runIteration(search, rng);
  return searchResult(search.root, search.size, iterations);
}

/** Merkezi profil bütçesi ve seçim politikasıyla seed edilebilir hamle üretir. */
export function getBestMoveForProfile(boardData, color, profileId, options = {}) {
  const profile = getAIProfile(profileId);
  const rng = createRng(options.seed);
  const search = createSearch(boardData, color, rng);
  for (let i=0;i<profile.iterations;i++) runIteration(search,rng);
  return profileSearchResult(search,profile,rng,profile.iterations);
}

// Kural ve rollout özelliklerini üretim API'sini genişletmeden doğrulayan test yüzeyi.
export const __test = {
  play(boardData, color, x, y) {
    const nbr = getNeighborTable(boardData.size);
    return placeStone(boardData.grid, nbr, boardData.size, y * boardData.size + x, color, boardData.ko);
  },
  legalMoves(boardData, color) {
    const nbr = getNeighborTable(boardData.size);
    return legalMoves(boardData.grid, nbr, boardData.size, color, boardData.ko)
      .map(i => ({ x: i % boardData.size, y: (i / boardData.size) | 0 }));
  },
  pickMove(boardData, color, seed = 1) {
    const nbr = getNeighborTable(boardData.size);
    const moves = legalMoves(boardData.grid, nbr, boardData.size, color, boardData.ko);
    if (!moves.length) return 'pass';
    const move = pickMove(boardData.grid, nbr, boardData.size, moves, color, boardData.ko, createRng(seed));
    return move < 0 ? 'pass' : { x: move % boardData.size, y: (move / boardData.size) | 0 };
  },
  rollout(boardData, color, options = {}) {
    const rng = createRng(options.seed);
    const nbr = getNeighborTable(boardData.size);
    const node = new Node(boardData.grid.slice(), boardData.ko, color, options.previousPass ? -1 : null, null, rng);
    const diagnostics = {};
    const winner = rollout(node, nbr, boardData.size, rng, diagnostics,boardData.komi??DEFAULT_KOMI);
    return { winner, ...diagnostics };
  },
  score(boardData) {
    return scoreBoard(boardData.grid, getNeighborTable(boardData.size), boardData.size,boardData.komi??DEFAULT_KOMI);
  },
  backpropProbe(rootColor, depth, winner) {
    const rng = createRng(1);
    let root = new Node(new Int8Array(1), -1, rootColor, null, null, rng);
    let leaf = root;
    for (let i = 0; i < depth; i++) {
      leaf = new Node(leaf.grid, -1, leaf.color === 1 ? 2 : 1, 0, leaf, rng);
      leaf.parent.children.push(leaf);
    }
    backprop(leaf, winner);
    const values = [];
    for (let node = root; node; node = node.children[0]) values.push(node.wins);
    return values;
  },
};

/**
 * Tromp-Taylor puanlama — oyun bitişinde sonucu hesapla.
 * Döndürür: { blackScore, whiteScore, winner: 'black'|'white', margin }
 */
export function finalScore(boardData) {
  const { grid, size } = boardData;
  const nbr = getNeighborTable(size);
  const komi=boardData.komi??DEFAULT_KOMI;
  const { score: raw, blackTerritory, whiteTerritory, blackDead, whiteDead } = scoreBoardDetailed(grid, nbr, size,komi);
  return {
    rawDiff: raw,
    winner:  raw > 0 ? 'black' : 'white',
    margin:  Math.abs(raw),
    komi,
    blackTerritory,
    whiteTerritory,
    blackDead,
    whiteDead,
  };
}
