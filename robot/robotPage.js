/**
 * robot/robotPage.js
 *
 * Robot sayfasının kabuğu: tahta adaptörü, motor worker'ı ve panel arasında
 * köprü kurar. Kural, handikap, arama ve ipucu kararları core/ içindedir;
 * bu dosya yalnız olayları bağlar ve durumu ekrana yazar.
 */
import { createSceneBoardAdapter } from '../adapters/sceneBoardAdapter.js?v=2026-11-05.robot';
import { BLACK, WHITE, createGame, finishCounting, illegalReason, passTurn, playMove, pointOf, positionOf, resign, scoreGame, suggestDead, toggleDead, xyOf } from '../core/robotGame.js';
import { LADDER_STORAGE_KEY, createLadder, gameSettings, loadLadder, recordResult } from '../core/handicapLadder.js';
import { dangerHint, moveHint, regionHint, selfAtariWarning, territoryEstimate } from '../core/hintTools.js';

const ROBOT_MIN_MS = 900;        // taş bir anda belirmesin, oyuncu kendi hamlesini görsün
const ENGINE_TIMEOUT_MS = 20000;
const CONFIRM_MS = 4000;
const CAMERA = { yaw: 0, pitch: 1.22 };

const $ = id => document.getElementById(id);
const ui = {
  level: $('rb-level'), title: $('rb-title'), dots: $('rb-dots'), lead: $('rb-lead'), status: $('rb-status'),
  estimate: $('rb-estimate'), estimateFill: $('rb-estimate-fill'), estimateText: $('rb-estimate-text'),
  actions: $('rb-actions'), hint: $('rb-hint'), pass: $('rb-pass'), tools: $('rb-tools'), hintText: $('rb-hint-text'),
  result: $('rb-result'), confirm: $('rb-confirm'), next: $('rb-next'), lessons: $('rb-lessons'),
  quiet: $('rb-quiet'), resign: $('rb-resign'), restart: $('rb-new'), reset: $('rb-reset'),
};

const search = new URLSearchParams(location.search);
const touchFirst = matchMedia('(hover: none)').matches;
const isMobile = window.innerWidth <= 640 || ('ontouchstart' in window && window.innerWidth <= 1024);
const board = createSceneBoardAdapter($('rb-canvas'), { isMobile, initialSize: 9, board3d: search.get('tahta') !== '2d', rowLabelsUp: true });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const fmt = n => String(n).replace('.', ',');
const moveName = (x, y) => `${'ABCDEFGHJ'[x]}${9 - y}`;
/* Tahta adaptöründe satır 0 ekranın altındadır; oyun durumunda y=0 üsttür.
   Dönüşüm yalnız burada yapılır. */
const toRowCol = ({ x, y }) => ({ row: 8 - y, col: x });
const toXY = ({ row, col }) => ({ x: col, y: 8 - row });

/* ── Basamak kaydı ─────────────────────────────────────────────────────── */
function readLadder() {
  try { return loadLadder(localStorage.getItem(LADDER_STORAGE_KEY)); } catch { return createLadder(); }
}
function saveLadder() {
  try { localStorage.setItem(LADDER_STORAGE_KEY, JSON.stringify(ladder)); } catch { /* gizli pencere: bu oturumda kalır */ }
}

/* ── Durum ─────────────────────────────────────────────────────────────── */
let ladder = readLadder();
let settings = gameSettings(ladder);
let game = createGame(settings);
let gameId = 0;
let thinking = false;
let cached = null;             // {ply, analysis}: aynı konumda yeniden hesaplanmaz
let armed = null;              // telefonda onay bekleyen nokta
let warned = null;             // kendini atari uyarısı verilen nokta
let estimateOn = false;
let unfinished = false;        // hamle yapıldı mı (yeniden başla onayı için)

/* ── Motor ─────────────────────────────────────────────────────────────── */
const engine = new Worker('./workers/robotEngine.worker.js');
let engineState = 'loading';   // loading | ready | fallback
let nextId = 0;
const pending = new Map();
let resolveReady;
const engineReady = new Promise(resolve => { resolveReady = resolve; });

function engineFailed(error) {
  if (engineState !== 'fallback') console.warn('Robot motoru yedeğe geçti:', error);
  engineState = 'fallback';
  resolveReady();
  for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('motor yok')); }
  pending.clear();
  render();
}
engine.addEventListener('error', event => engineFailed(event.message));
engine.addEventListener('message', ({ data }) => {
  if (data.type === 'READY') {
    if (data.ok) { engineState = 'ready'; resolveReady(); render(); } else engineFailed(data.error);
    return;
  }
  const entry = pending.get(data.id);
  if (!entry) return;
  pending.delete(data.id);
  clearTimeout(entry.timer);
  if (data.ok) entry.resolve(data); else entry.reject(new Error(data.error));
});

function ask(type) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('zaman aşımı')); }, ENGINE_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    engine.postMessage({ type, id, position: positionOf(game) });
  });
}

/* Model yüklenmezse oyun durmasın: tarayıcıdaki MCTS yedeği oynar, daha zayıftır. */
let fallbackWorker = null;
function fallbackMove() {
  fallbackWorker ||= new Worker('./workers/goAI.worker.js', { type: 'module' });
  const position = positionOf(game);
  const last = position.history[position.history.length - 1];
  return new Promise((resolve, reject) => {
    const onMessage = ({ data }) => {
      fallbackWorker.removeEventListener('message', onMessage);
      if (!data.ok) { reject(new Error(data.error)); return; }
      resolve(data.move === 'pass' ? -1 : pointOf(data.move.x, data.move.y));
    };
    fallbackWorker.addEventListener('message', onMessage);
    fallbackWorker.postMessage({
      type: 'MOVE_PROFILE', profile: 'club', color: position.toPlay,
      boardData: { grid: position.grid, ko: position.ko, size: position.size, komi: position.komi, previousPass: Boolean(last && last.point < 0), moveCount: game.history.length },
    });
  });
}

async function robotPoint() {
  await engineReady;
  if (engineState === 'ready') {
    try { return (await ask('MOVE')).point; } catch (error) { console.warn(error); }
  }
  return fallbackMove();
}

/** Bu konumun analizi; motor yoksa null. */
async function analysis() {
  const ply = game.history.length;
  if (cached?.ply === ply) return cached.analysis;
  await engineReady;
  if (engineState !== 'ready') return null;
  try {
    const result = (await ask('ANALYZE')).analysis;
    cached = { ply, analysis: result };
    return result;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

/* ── Oyun akışı ────────────────────────────────────────────────────────── */
function newGame() {
  gameId += 1;
  settings = gameSettings(ladder);
  game = createGame(settings);
  cached = null; armed = null; warned = null; thinking = false; unfinished = false;
  board.reset();
  board.setInputEnabled(true);
  for (const stone of settings.stones) board.playMove({ ...toRowCol(stone), color: 'black' });
  board.clearRegionMarks();
  board.clearLiberties();
  board.clearMovePreview();
  board.setDimmedStones([]);
  setHint(null);
  closeTools();
  setStatus(settings.stones.length ? 'Taşların yerinde. İlk hamle robotun.' : 'İlk hamle senin.');
  render();
  if (game.toPlay === WHITE) robotTurn();
  else if (estimateOn) refreshEstimate();
}

async function robotTurn() {
  const id = gameId;
  thinking = true;
  board.setInputEnabled(false);
  render();
  const [point] = await Promise.all([robotPoint().catch(() => -1), delay(ROBOT_MIN_MS)]);
  if (id !== gameId || game.phase !== 'play') return;
  thinking = false;
  board.setInputEnabled(true);
  if (point < 0) {
    passTurn(game);
    board.notePass();
    if (game.phase === 'counting') { startCounting(); return; }
    setStatus('Robot pas geçti. Sen de geçersen sayıma geçilir.');
  } else {
    const { x, y } = xyOf(point);
    const { captured } = playMove(game, x, y);
    board.playMove({ ...toRowCol({ x, y }), color: 'white', animateCapture: true });
    setStatus(captured.length ? `Robot ${moveName(x, y)} oynadı, ${captured.length} taş aldı.` : `Robot ${moveName(x, y)} oynadı. Sıra sende.`);
  }
  render();
  if (estimateOn) refreshEstimate();
}

function commitMove(x, y) {
  armed = null; warned = null; unfinished = true;
  clearMarks();
  const { ok, captured } = playMove(game, x, y);
  if (!ok) return;
  board.playMove({ ...toRowCol({ x, y }), color: 'black', animateCapture: true });
  if (captured.length) setStatus(`${captured.length} taş aldın.`);
  robotTurn();
}

function onTap(hit) {
  const { x, y } = toXY(hit);
  if (game.phase === 'counting') {
    if (toggleDead(game, x, y)) renderCounting();
    return;
  }
  if (game.phase !== 'play' || thinking || game.toPlay !== BLACK) return;
  const reason = illegalReason(game, x, y);
  if (reason === 'OCCUPIED') return;
  if (reason === 'KO') { setStatus('Ko: bu taşı hemen geri alamazsın, önce başka bir yere oyna.'); return; }
  if (reason) { setStatus('Burada taşın hiç nefesi olmaz, oynanamaz.'); return; }

  const point = pointOf(x, y);
  if (touchFirst && armed !== point) {
    armed = point;
    board.setMovePreview({ ...hit, color: 'black' });
    setStatus('Onaylamak için aynı noktaya yeniden dokun.');
    return;
  }
  const warning = selfAtariWarning(game, BLACK, x, y);
  if (warning && warned !== point) {
    warned = point;
    setStatus(`${warning} Yine de oynamak için tekrar dokun.`);
    return;
  }
  commitMove(x, y);
}

function onHover(hit) {
  if (touchFirst || game.phase !== 'play' || thinking) return;
  if (hit && !illegalReason(game, ...Object.values(toXY(hit)))) board.setMovePreview({ ...hit, color: 'black' });
  else board.clearMovePreview();
}

function playerPass() {
  if (game.phase !== 'play' || thinking || game.toPlay !== BLACK) return;
  unfinished = true;
  clearMarks();
  passTurn(game);
  board.notePass();
  setStatus('Pas geçtin. Robot da geçerse sayıma geçilir.');
  robotTurn();
}

/* ── Sayım ve sonuç ────────────────────────────────────────────────────── */
async function startCounting() {
  const id = gameId;
  closeTools();
  setHint(null);
  board.clearLiberties();
  board.clearMovePreview();
  setStatus('Sayım hazırlanıyor…');
  render();
  const result = await analysis();
  if (id !== gameId) return;
  suggestDead(game, result?.ownership ?? null);
  setStatus('Ölü sayılan taşlar soluk görünür. Yanlışsa gruba dokun, sonra onayla.');
  renderCounting();
}

function renderCounting() {
  const score = scoreGame(game);
  board.setDimmedStones(score.dead.map(toRowCol));
  board.showRegionMarks([
    ...score.blackTerritory.map(p => ({ ...toRowCol(p), color: 'black' })),
    ...score.whiteTerritory.map(p => ({ ...toRowCol(p), color: 'white' })),
  ]);
  showScoreBar(score.black, score.white, `Siyah ${score.black} · Beyaz ${score.white} + ${fmt(score.komi)} komi`);
  render();
}

function showScoreBar(black, white, text) {
  ui.estimate.hidden = false;
  ui.estimateFill.style.setProperty('--share', `${(black / Math.max(1, black + white)) * 100}%`);
  ui.estimateText.textContent = text;
}

function finishGame(result) {
  const won = result.winner === BLACK;
  const record = recordResult(ladder, won);
  ladder = record.ladder;
  saveLadder();
  const upcoming = gameSettings(ladder);
  ui.title.textContent = won ? 'Kazandın.' : 'Robot kazandı.';
  ui.lead.textContent = result.resigned
    ? 'Teslim oldun. Aynı basamakta yeniden deneyebilirsin.'
    : `${won ? 'Siyah' : 'Beyaz'} ${fmt(result.margin)} puan farkla kazandı.`;
  if (record.advanced) setStatus(`Bir basamak çıktın. Sonraki oyun: ${upcoming.title.toLocaleLowerCase('tr')}.`);
  else if (won) setStatus('En üst basamaktasın: robotla eşit oynuyorsun.');
  else setStatus(`Bu basamakta kaldın: ${upcoming.title.toLocaleLowerCase('tr')}.`);
  render();
}

/* ── İpuçları ──────────────────────────────────────────────────────────── */
function setHint(text) {
  ui.hintText.hidden = !text;
  ui.hintText.textContent = text || '';
}

function clearMarks() {
  board.clearLiberties();
  board.clearMovePreview();
  setHint(null);
}

function closeTools() {
  ui.tools.hidden = true;
  ui.hint.setAttribute('aria-expanded', 'false');
}

function showMarks(hint) {
  board.clearLiberties();
  board.clearMovePreview();
  if (hint.marks.length) board.showLiberties(hint.marks.map(toRowCol));
  if (hint.ghost) board.setMovePreview({ ...toRowCol(hint.ghost), color: 'black' });
  setHint(hint.text);
}

async function useTool(tool) {
  if (game.phase !== 'play' || thinking || game.toPlay !== BLACK) { setHint('Sıra sende olduğunda ipucu alabilirsin.'); return; }
  if (tool === 'estimate') { toggleEstimate(); return; }
  if (tool === 'danger') { showMarks(dangerHint(game, BLACK)); return; }
  setHint('Robot konumu inceliyor…');
  const id = gameId, ply = game.history.length;
  const result = await analysis();
  if (id !== gameId || ply !== game.history.length) return;
  if (!result) { setHint('Bu ipucu için robot modeli gerekli; şu an yüklenemedi.'); return; }
  showMarks(tool === 'region' ? regionHint(game, result) : moveHint(game, result));
}

function toggleEstimate() {
  estimateOn = !estimateOn;
  ui.tools.querySelector('[data-tool="estimate"]').setAttribute('aria-pressed', String(estimateOn));
  if (estimateOn) { refreshEstimate(); return; }
  ui.estimate.hidden = true;
  board.clearRegionMarks();
}

async function refreshEstimate() {
  if (game.phase !== 'play' || thinking) return;
  const id = gameId, ply = game.history.length;
  const result = await analysis();
  if (id !== gameId || ply !== game.history.length || !estimateOn || thinking) return;
  if (!result) {
    ui.estimate.hidden = false;
    ui.estimateText.textContent = 'Tahmini alan için robot modeli gerekli; şu an yüklenemedi.';
    return;
  }
  const estimate = territoryEstimate(game, result.ownership);
  board.showRegionMarks(estimate.marks.map(mark => ({ ...toRowCol(mark), color: mark.color })));
  const leader = estimate.leader === BLACK ? 'Sen öndesin' : 'Robot önde';
  const note = estimate.early ? 'Henüz erken, kaba bir tahmin.' : `${leader}, yaklaşık ${fmt(Math.abs(estimate.lead).toFixed(1))} puan.`;
  showScoreBar(estimate.black, estimate.white, `Siyah ≈ ${estimate.black} · Beyaz ≈ ${estimate.white} + ${fmt(estimate.komi)} komi. ${note}`);
}

/* ── Çizim ─────────────────────────────────────────────────────────────── */
function setStatus(text) { ui.status.textContent = text; }

function render() {
  const over = game.phase === 'over', counting = game.phase === 'counting';
  if (!over) {
    ui.title.textContent = counting ? 'Sayım.' : `${settings.title}.`;
    ui.lead.textContent = counting
      ? 'Alanını, yani taşlarını ve çevrelediğin boş noktaları sayıyoruz.'
      : 'Robotun gücü sabit. Kazandıkça önündeki taşlar azalır.';
  }
  ui.level.textContent = `Basamak ${settings.index + 1} / ${settings.total}`;
  ui.dots.replaceChildren(...Array.from({ length: settings.total }, (_, i) => {
    const dot = document.createElement('i');
    if (i <= ladder.level) dot.className = 'is-done';
    return dot;
  }));
  const myTurn = game.phase === 'play' && !thinking && game.toPlay === BLACK;
  ui.actions.hidden = counting || over;
  ui.hint.disabled = !myTurn;
  ui.pass.disabled = !myTurn;
  ui.quiet.hidden = counting;
  ui.resign.hidden = over;
  ui.restart.hidden = over;
  ui.reset.hidden = ladder.level === 0 || !over;
  ui.result.hidden = !(counting || over);
  ui.confirm.hidden = !counting;
  ui.next.hidden = !over;
  ui.lessons.hidden = !over;
  if (over) ui.tools.hidden = true;
  if (thinking) setStatus(engineState === 'loading' ? 'Robot hazırlanıyor…' : 'Robot düşünüyor…');
  else if (engineState === 'fallback' && game.phase === 'play' && !game.history.length) {
    setStatus('Robot modeli yüklenemedi; bu oyunda daha zayıf yedek motor oynuyor.');
  }
}

/* İki aşamalı onay: yanlışlıkla basılan düğme oyunu silmesin. */
function confirmTwice(button, label, armedLabel, action, needed = () => true) {
  let until = 0;
  button.addEventListener('click', () => {
    if (needed() && Date.now() > until) {
      until = Date.now() + CONFIRM_MS;
      button.textContent = armedLabel;
      button.classList.add('is-armed');
      setTimeout(() => { button.textContent = label; button.classList.remove('is-armed'); }, CONFIRM_MS);
      return;
    }
    until = 0;
    button.textContent = label;
    button.classList.remove('is-armed');
    action();
  });
}

/* ── Olaylar ───────────────────────────────────────────────────────────── */
board.onIntersectionTap(onTap);
board.onIntersectionHover(onHover);
ui.pass.addEventListener('click', playerPass);
ui.hint.addEventListener('click', () => {
  const open = ui.tools.hidden;
  ui.tools.hidden = !open;
  ui.hint.setAttribute('aria-expanded', String(open));
});
ui.tools.addEventListener('click', event => {
  const tool = event.target.closest('[data-tool]');
  if (tool) useTool(tool.dataset.tool);
});
ui.confirm.addEventListener('click', () => {
  const result = finishCounting(game);
  if (result) { thinking = false; finishGame(result); }
});
ui.next.addEventListener('click', newGame);
confirmTwice(ui.resign, 'Teslim ol', 'Emin misin? Tekrar bas', () => {
  gameId += 1;
  thinking = false;
  board.setInputEnabled(true);
  clearMarks();
  finishGame(resign(game));
});
confirmTwice(ui.restart, 'Yeniden başla', 'Oyun silinecek, tekrar bas', newGame, () => unfinished);
confirmTwice(ui.reset, 'Basamakları sıfırla', 'Dört taşa dönülecek, tekrar bas', () => {
  ladder = createLadder();
  saveLadder();
  newGame();
});

const frame = duration => board.frameBoard({ ...CAMERA, duration });
board.setSize(9);
frame(0);
new ResizeObserver(() => frame(0)).observe($('rb-canvas'));
newGame();

if (search.has('e2e')) {
  window.__robotTest = {
    state: () => ({
      phase: game.phase, toPlay: game.toPlay, komi: game.komi, thinking, engineState, estimateOn,
      stones: [...game.grid].reduce((n, cell) => n + (cell !== 0), 0),
      history: game.history.length, dead: game.dead.size, level: ladder.level, result: game.result,
    }),
    board: () => ({ stones: [...game.grid], marks: board.getRegionMarks(), liberties: board.getLibertyPoints(), preview: board.getMovePreviewState(), three: board.getBoard3dState() }),
    screenOf: (x, y) => board.getPointScreen(toRowCol({ x, y })),
    play: (x, y) => commitMove(x, y),
    forceResult: won => { game.phase = 'over'; finishGame({ winner: won ? BLACK : WHITE, margin: 3.5, komi: game.komi, resigned: false }); },
    setPosition: rows => {
      rows.forEach((row, y) => [...row.replace(/ /g, '')].forEach((cell, x) => {
        const color = cell === 'X' ? BLACK : cell === 'O' ? WHITE : 0;
        game.grid[pointOf(x, y)] = color;
      }));
      cached = null;
    },
  };
}
