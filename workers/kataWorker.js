/**
 * workers/kataWorker.js
 *
 * KataGo (kyu model) tabanlı Go AI — TensorFlow.js ile tarayıcıda çalışır.
 * Klasik worker (importScripts); model CDN'den yüklenir.
 *
 * Mesaj protokolü goAI.worker.js ile uyumlu:
 *   Gelen: { type:'MOVE', boardData:{grid,ko,size}, color:1|2 }
 *   Giden: { ok:true,  type:'MOVE', move:{x,y} | 'pass' }
 *         { ok:false, error:string }
 *   Ek:   { type:'READY', ok:bool, backend?, error? }
 */

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js');

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/maksimKorzh/go@main/model/kyu/model.json';
const KOMI  = 6.5;
const N19   = 19;
const NB19  = N19 * N19;  // 361
const NC    = 22;

let model = null;
const policyTools = import('../core/goAI.js');

// ── Liberty flood-fill ──────────────────────────────────────────────

function groupLibs(grid, size, start) {
  const color = grid[start];
  if (!color) return 0;
  const vis  = new Uint8Array(size * size);
  const libs = new Set();
  const stk  = [start];

  while (stk.length) {
    const i = stk.pop();
    if (vis[i]) continue;
    vis[i] = 1;
    if (grid[i] !== color) continue;
    const x = i % size, y = (i / size) | 0;
    if (x > 0)        { const n = i - 1;    grid[n] === 0 ? libs.add(n) : (!vis[n] && stk.push(n)); }
    if (x < size - 1) { const n = i + 1;    grid[n] === 0 ? libs.add(n) : (!vis[n] && stk.push(n)); }
    if (y > 0)        { const n = i - size; grid[n] === 0 ? libs.add(n) : (!vis[n] && stk.push(n)); }
    if (y < size - 1) { const n = i + size; grid[n] === 0 ? libs.add(n) : (!vis[n] && stk.push(n)); }
  }
  return libs.size;
}

// ── Yasal hamle kontrolü ────────────────────────────────────────────

function isLegal(grid, size, idx, color, ko) {
  if (grid[idx] !== 0 || idx === ko) return false;
  const x = idx % size, y = (idx / size) | 0;
  const opp = 3 - color;
  let hasLiberty = false, hasCapture = false, hasAlly = false;

  const nbrs = [];
  if (x > 0)        nbrs.push(idx - 1);
  if (x < size - 1) nbrs.push(idx + 1);
  if (y > 0)        nbrs.push(idx - size);
  if (y < size - 1) nbrs.push(idx + size);

  for (const n of nbrs) {
    if (grid[n] === 0) { hasLiberty = true; break; }
    if (grid[n] === opp   && groupLibs(grid, size, n) === 1) hasCapture = true;
    if (grid[n] === color  && groupLibs(grid, size, n) > 1)  hasAlly    = true;
  }

  return hasLiberty || hasCapture || hasAlly;
}

// ── Board → KataGo tensor encoding ──────────────────────────────────

function buildInputs(boardData, color) {
  const { grid, ko, size } = boardData;
  const komi = boardData.komi ?? KOMI;
  const binInputs    = new Float32Array(NB19 * NC);
  const globalInputs = new Float32Array(19);

  const aiColor  = color;
  const oppColor = 3 - color;

  const libCache = new Int16Array(size * size).fill(-1);
  function getLibs(idx) {
    if (libCache[idx] >= 0) return libCache[idx];
    return (libCache[idx] = groupLibs(grid, size, idx));
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const base = (y * N19 + x) * NC;
      binInputs[base] = 1.0;  // kanal 0: tahta üzerinde

      const idxB = y * size + x;
      const cell = grid[idxB];
      if (cell === aiColor)  binInputs[base + 1] = 1.0;
      if (cell === oppColor) binInputs[base + 2] = 1.0;

      if (cell !== 0) {
        const libs = getLibs(idxB);
        if (libs === 1)      binInputs[base + 3] = 1.0;
        else if (libs === 2) binInputs[base + 4] = 1.0;
        else if (libs >= 3)  binInputs[base + 5] = 1.0;
      }
    }
  }

  // Ko noktası
  if (ko >= 0) {
    const kx = ko % size, ky = (ko / size) | 0;
    binInputs[(ky * N19 + kx) * NC + 6] = 1.0;
  }

  // Komi (kanal 5)
  globalInputs[5] = (aiColor === 2 ? komi + 1 : -komi) / 20.0;

  // Tahta boyutu — KataGo variable-size desteği
  globalInputs[8]  = size / 19.0;
  globalInputs[9]  = size / 19.0;
  globalInputs[10] = Math.log(size * size) / Math.log(361);

  return { binInputs, globalInputs };
}

// ── Hamle seçimi ─────────────────────────────────────────────────────

async function getBestMove(boardData, color) {
  const { grid, ko, size } = boardData;
  const { binInputs, globalInputs } = buildInputs(boardData, color);

  const binT = tf.tensor(binInputs,    [1, NB19, NC]);
  const glbT = tf.tensor(globalInputs, [1, 19]);

  let policyTensor;
  try {
    policyTensor = await model.executeAsync(
      { 'swa_model/bin_inputs': binT, 'swa_model/global_inputs': glbT },
      'swa_model/policy_output'
    );
  } finally {
    tf.dispose([binT, glbT]);
  }

  // policy_output: [1, 2, 362] — kanal 0 = current player politikası
  const raw = await policyTensor.data();
  tf.dispose(policyTensor);

  // Softmax (ilk 362 değer = kanal 0)
  let maxVal = -Infinity;
  for (let i = 0; i < 362; i++) if (raw[i] > maxVal) maxVal = raw[i];
  const exp = new Float32Array(362);
  let expSum = 0;
  for (let i = 0; i < 362; i++) { exp[i] = Math.exp(raw[i] - maxVal); expSum += exp[i]; }
  for (let i = 0; i < 362; i++) exp[i] /= expSum;

  const { choosePolicyMove } = await policyTools;
  return choosePolicyMove(boardData,color,exp,{policyStride:N19});
}

// ── Model yükleme ────────────────────────────────────────────────────

async function loadModel() {
  try {
    try { await tf.setBackend('webgl'); } catch (_) { await tf.setBackend('cpu'); }
    model = await tf.loadGraphModel(MODEL_URL);
    self.postMessage({ ok: true, type: 'READY', backend: tf.getBackend() });
  } catch (e) {
    self.postMessage({ ok: false, type: 'READY', error: e.message });
  }
}

// ── Mesaj dinleyici ───────────────────────────────────────────────────

self.addEventListener('message', async ({ data }) => {
  const { type, boardData, color, gameId, requestId } = data;

  if (type === 'LOAD') { await loadModel(); return; }

  if (!model) {
    self.postMessage({ ok: false, error: 'Model henüz yüklenmedi.', gameId, requestId });
    return;
  }

  if (type === 'MOVE') {
    try {
      const move = await getBestMove(boardData, color);
      self.postMessage({ ok: true, type: 'MOVE', move, gameId, requestId });
    } catch (e) {
      self.postMessage({ ok: false, error: e.message, gameId, requestId });
    }
  }
});

loadModel();
