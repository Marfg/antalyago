/**
 * workers/reviewWorker.js
 * Oyun-sonu analiz worker'ı — kataWorker'dan bağımsız.
 *
 * Gelen: { type:'ANALYZE_GAME', moves:[{color,x,y,pass}], size, komi }
 * Giden: { type:'REVIEW_READY', ok, error? }
 *        { type:'PROGRESS', current, total }
 *        { type:'DONE', data: ReviewData }
 *        { type:'ERROR', error }
 */

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js');

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/maksimKorzh/go@main/model/kyu/model.json';
const KOMI = 6.5;
const N19  = 19;
const NC   = 22;
const COL  = 'ABCDEFGHJ';

let model = null;

// ── Go nefes sayımı ─────────────────────────────────────────────
function groupLibs(grid, size, start) {
  const color = grid[start];
  if (!color) return 0;
  const vis  = new Uint8Array(size * size);
  const libs = new Set();
  const stk  = [start];
  while (stk.length) {
    const i = stk.pop();
    if (vis[i]) continue; vis[i] = 1;
    if (grid[i] !== color) continue;
    const x = i % size, y = (i / size) | 0;
    if (x > 0)        { const n=i-1;    grid[n]===0 ? libs.add(n) : (!vis[n]&&stk.push(n)); }
    if (x < size-1)   { const n=i+1;    grid[n]===0 ? libs.add(n) : (!vis[n]&&stk.push(n)); }
    if (y > 0)        { const n=i-size; grid[n]===0 ? libs.add(n) : (!vis[n]&&stk.push(n)); }
    if (y < size-1)   { const n=i+size; grid[n]===0 ? libs.add(n) : (!vis[n]&&stk.push(n)); }
  }
  return libs.size;
}

// ── Hamle uygulama (yakalamalar dahil) ─────────────────────────
function applyMove(grid, size, x, y, color) {
  const ng   = grid.slice();
  const opp  = 3 - color;
  ng[y * size + x] = color;

  const nbrs = [];
  if (x > 0)      nbrs.push(y*size + (x-1));
  if (x < size-1) nbrs.push(y*size + (x+1));
  if (y > 0)      nbrs.push((y-1)*size + x);
  if (y < size-1) nbrs.push((y+1)*size + x);

  for (const n of nbrs) {
    if (ng[n] !== opp || groupLibs(ng, size, n) > 0) continue;
    const stk = [n], vis = new Uint8Array(size*size);
    while (stk.length) {
      const i = stk.pop();
      if (vis[i]) continue; vis[i] = 1;
      if (ng[i] !== opp) continue;
      ng[i] = 0;
      const cx=i%size, cy=(i/size)|0;
      if (cx>0)      stk.push(i-1);
      if (cx<size-1) stk.push(i+1);
      if (cy>0)      stk.push(i-size);
      if (cy<size-1) stk.push(i+size);
    }
  }
  return ng;
}

// ── Bölge sayımı → skor tahmini ────────────────────────────────
function estimateScore(grid, size) {
  let bPts = 0, wPts = 0;
  for (let i = 0; i < size*size; i++) {
    if (grid[i] === 1) bPts++;
    else if (grid[i] === 2) wPts++;
  }

  const visited = new Uint8Array(size*size);
  for (let i = 0; i < size*size; i++) {
    if (grid[i] !== 0 || visited[i]) continue;
    const region = [], borders = new Set();
    const stk = [i], vis = new Uint8Array(size*size);
    while (stk.length) {
      const j = stk.pop();
      if (vis[j]) continue; vis[j] = 1; region.push(j);
      const jx=j%size, jy=(j/size)|0;
      const ns = [];
      if (jx>0) ns.push(j-1); if (jx<size-1) ns.push(j+1);
      if (jy>0) ns.push(j-size); if (jy<size-1) ns.push(j+size);
      for (const n of ns) grid[n]===0 ? (!vis[n]&&stk.push(n)) : borders.add(grid[n]);
    }
    region.forEach(r => { visited[r] = 1; });
    if (borders.size === 1) {
      if ([...borders][0] === 1) bPts += region.length;
      else wPts += region.length;
    }
  }
  return bPts - wPts - KOMI;
}

function scoreToWinrate(score) {
  return 1 / (1 + Math.exp(-score * 0.15));
}

// ── KataGo politika kodlama ─────────────────────────────────────
function buildInputs(grid, ko, size, color) {
  const binInputs    = new Float32Array(N19 * N19 * NC);
  const globalInputs = new Float32Array(19);
  const opp = 3 - color;
  const libCache = new Int16Array(size*size).fill(-1);
  const getLibs = idx => {
    if (libCache[idx] >= 0) return libCache[idx];
    return (libCache[idx] = groupLibs(grid, size, idx));
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = (y*N19+x)*NC;
      binInputs[base] = 1;
      const cell = grid[y*size+x];
      if (cell === color) binInputs[base+1] = 1;
      if (cell === opp)   binInputs[base+2] = 1;
      if (cell !== 0) {
        const lb = getLibs(y*size+x);
        if (lb===1) binInputs[base+3]=1;
        else if (lb===2) binInputs[base+4]=1;
        else if (lb>=3) binInputs[base+5]=1;
      }
    }
  }
  if (ko >= 0) {
    binInputs[((ko/size|0)*N19 + (ko%size)) * NC + 6] = 1;
  }
  globalInputs[5]  = (color===2 ? KOMI+1 : -KOMI) / 20;
  globalInputs[8]  = size/19; globalInputs[9] = size/19;
  globalInputs[10] = Math.log(size*size) / Math.log(361);
  return { binInputs, globalInputs };
}

// ── Tek pozisyon analizi ────────────────────────────────────────
async function analyzePos(grid, ko, size, color) {
  const { binInputs, globalInputs } = buildInputs(grid, ko, size, color);
  const binT = tf.tensor(binInputs,    [1, N19*N19, NC]);
  const glbT = tf.tensor(globalInputs, [1, 19]);
  let poly;
  try {
    poly = await model.executeAsync(
      { 'swa_model/bin_inputs': binT, 'swa_model/global_inputs': glbT },
      'swa_model/policy_output'
    );
  } finally { tf.dispose([binT, glbT]); }
  const raw = await poly.data();
  tf.dispose(poly);

  let maxV = -Infinity;
  for (let i = 0; i < 362; i++) if (raw[i] > maxV) maxV = raw[i];
  const exp = new Float32Array(362); let sum = 0;
  for (let i = 0; i < 362; i++) { exp[i] = Math.exp(raw[i]-maxV); sum += exp[i]; }
  for (let i = 0; i < 362; i++) exp[i] /= sum;

  const cands = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y*size+x] !== 0) continue;
      cands.push({ x, y, prior: exp[y*N19+x] });
    }
  }
  cands.sort((a,b) => b.prior - a.prior);

  const score = estimateScore(grid, size);
  // winrate from BLACK's perspective
  const wr = scoreToWinrate(score);

  return {
    cands: cands.slice(0, 25),
    winrateBlack: wr,
    scoreMean: score,
  };
}

// ── Tam oyun analizi ────────────────────────────────────────────
async function analyzeGame(moves, size) {
  let grid = new Int8Array(size * size);
  const results = [];

  for (let i = 0; i < moves.length; i++) {
    const m     = moves[i];
    const color = m.color === 'black' ? 1 : 2;

    if (m.pass) {
      results.push({ moveNumber: i+1, color: m.color==='black'?'B':'W', pass: true,
                     winrateBlack: null, scoreMean: null, rank: 0, prior: 1 });
      self.postMessage({ type: 'PROGRESS', current: i+1, total: moves.length });
      continue;
    }

    const pos = await analyzePos(grid.slice(), -1, size, color);
    const rank = pos.cands.findIndex(c => c.x===m.x && c.y===m.y);
    const prior = rank >= 0 ? pos.cands[rank].prior : 0;

    results.push({
      moveNumber: i+1,
      color:  color===1 ? 'B' : 'W',
      x: m.x, y: m.y,
      move: (COL[m.x] ?? '?') + (size - m.y),
      winrateBlack: pos.winrateBlack,
      scoreMean:    pos.scoreMean,
      rank:  rank < 0 ? pos.cands.length : rank,
      prior,
      bestX: pos.cands[0]?.x,
      bestY: pos.cands[0]?.y,
      bestMove: pos.cands[0] ? (COL[pos.cands[0].x] ?? '?') + (size - pos.cands[0].y) : '?',
      moveInfos: pos.cands.slice(0, 5).map((c, idx) => ({
        ...c, order: idx,
        move: (COL[c.x] ?? '?') + (size - c.y),
      })),
    });

    grid = applyMove(grid, size, m.x, m.y, color);
    self.postMessage({ type: 'PROGRESS', current: i+1, total: moves.length });
    await new Promise(r => setTimeout(r, 0)); // yield
  }

  return results;
}

function rankToQuality(rank) {
  if (rank <= 0)  return 'best';
  if (rank <= 2)  return 'good';
  if (rank <= 9)  return 'inaccuracy';
  if (rank <= 29) return 'mistake';
  return 'blunder';
}

function buildReviewData(results) {
  const win_rates = [], scores = [], moves = {};
  let prev = 0.5;

  results.forEach(r => {
    const wr = r.winrateBlack ?? prev;
    const sc = r.scoreMean ?? 0;
    win_rates.push(wr);
    scores.push(sc);

    const delta = r.color === 'B' ? wr - prev : prev - (1 - wr);
    const quality = rankToQuality(r.rank);

    moves[r.moveNumber] = {
      color: r.color, pass: r.pass,
      x: r.x, y: r.y, move: r.move,
      winrateBlack: wr, scoreMean: sc,
      prior: r.prior, order: r.rank,
      quality, delta,
      bestMove: r.bestMove ?? r.move,
      bestX: r.bestX, bestY: r.bestY,
      moveInfos: r.moveInfos ?? [],
    };
    prev = wr;
  });

  return { win_rates, scores, moves };
}

// ── Mesaj dinleyici ──────────────────────────────────────────────
self.addEventListener('message', async ({ data }) => {
  if (data.type !== 'ANALYZE_GAME') return;
  if (!model) { self.postMessage({ type: 'ERROR', error: 'Model yüklenmedi.' }); return; }
  try {
    const results = await analyzeGame(data.moves, data.size || 9);
    self.postMessage({ type: 'DONE', data: buildReviewData(results) });
  } catch (e) {
    self.postMessage({ type: 'ERROR', error: e.message });
  }
});

async function loadModel() {
  try {
    try { await tf.setBackend('webgl'); } catch (_) { await tf.setBackend('cpu'); }
    model = await tf.loadGraphModel(MODEL_URL);
    self.postMessage({ type: 'REVIEW_READY', ok: true });
  } catch (e) {
    self.postMessage({ type: 'REVIEW_READY', ok: false, error: e.message });
  }
}
loadModel();
