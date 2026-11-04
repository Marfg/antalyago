/**
 * scripts/ai/calibrate-robot.mjs
 * node scripts/ai/calibrate-robot.mjs [--games 6] [--visits 8,1]
 *
 * Robot gücünü gerçek modelle kendi içinde karşılaştırır: her ziyaret sayısı
 * bir öncekine karşı iki renkte oynar. Bu Elo ya da kyu ölçümü değildir, yalnız
 * ayarların göreli etkisini gösterir; 1 kyu/1 dan karşılığı insan oyunlarıyla
 * doğrulanmalıdır. TensorFlow.js CDN'den gelir, ağ gerekir.
 */
import { chromium } from 'playwright-core';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const games = Number(arg('--games', 4));
const visits = String(arg('--visits', '8,1')).split(',').map(Number);
const maxPlies = 110;
const tuning = {};
if (arg('--cpuct')) tuning.cpuct = Number(arg('--cpuct'));
if (arg('--area')) tuning.areaWeight = Number(arg('--area'));

const WORKER = `
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js');
const load = Promise.all([import('/core/kataFeatures.js'), import('/core/robotSearch.js'), import('/core/robotGame.js')]);
const OUT = ['swa_model/policy_output','swa_model/value_output','swa_model/ownership_output'];
let model;
async function evaluate(p) {
  const [F] = await load;
  const { bin, global } = F.buildInputs(p);
  const a = tf.tensor(bin, [1, F.NET_POINTS, F.NET_CHANNELS]), b = tf.tensor(global, [1, F.NET_GLOBALS]);
  const out = await model.executeAsync({ 'swa_model/bin_inputs': a, 'swa_model/global_inputs': b }, OUT);
  const [pol, val, own] = await Promise.all(out.map(t => t.data()));
  tf.dispose([a, b, ...out]);
  return { policy: F.readPolicy(pol.subarray(0, 362), p.size), winrate: F.readWinrate(val), ownership: F.readOwnership(own, p.size, p.toPlay) };
}
self.onmessage = async ({ data }) => {
  const [, S, G] = await load;
  if (data.type === 'load') { await tf.setBackend('webgl'); await tf.ready(); model = await tf.loadGraphModel('/model/b10c128-s1141046784-d204142634/model.json'); self.postMessage({ type: 'ok' }); return; }
  const game = G.createGame({ komi: 6.5 });
  let rngState = data.seed;
  const rng = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };
  while (game.phase === 'play' && game.history.length < data.maxPlies) {
    const position = G.positionOf(game);
    const budget = game.toPlay === 1 ? data.black : data.white;
    const analysis = await S.searchPosition(position, evaluate, { visits: budget, ...data.tuning });
    const point = S.chooseRobotMove(analysis, position, rng);
    if (point < 0) G.passTurn(game); else { const { x, y } = G.xyOf(point); G.playMove(game, x, y); }
  }
  const final = await evaluate(G.positionOf(game));
  if (game.phase === 'play') { G.passTurn(game); if (game.phase === 'play') G.passTurn(game); }
  G.suggestDead(game, final.ownership);
  const score = G.scoreGame(game);
  self.postMessage({ type: 'done', winner: score.winner, margin: score.margin, plies: game.history.length });
};`;

const TYPES = { '.js': 'application/javascript', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  const route = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (route === '/blank.html') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html>x'); return; }
  if (route === '/calibrate.worker.js') { response.writeHead(200, { 'content-type': 'application/javascript' }); response.end(WORKER); return; }
  fs.readFile(path.join(ROOT, route), (error, body) => {
    if (error) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': TYPES[path.extname(route)] || 'application/octet-stream' });
    response.end(body);
  });
}).listen(3122);

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', error => console.error('sayfa hatası:', error.message));
await page.goto('http://localhost:3122/blank.html');
await page.evaluate(() => {
  window.worker = new Worker('/calibrate.worker.js');
  window.call = message => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('zaman aşımı')), 900000);
    worker.onmessage = event => { clearTimeout(timer); resolve(event.data); };
    worker.onerror = event => reject(new Error(event.message));
    worker.postMessage(message);
  });
});
await page.evaluate(() => call({ type: 'load' }));

for (let i = 0; i + 1 < visits.length; i++) {
  const [a, b] = [visits[i], visits[i + 1]];
  let winsA = 0, total = 0;
  for (let g = 0; g < games; g++) {
    const aBlack = g % 2 === 0;
    const result = await page.evaluate(m => call(m), { type: 'game', black: aBlack ? a : b, white: aBlack ? b : a, seed: 1000 + g * 77, maxPlies, tuning });
    const aWon = (result.winner === 1) === aBlack;
    winsA += aWon ? 1 : 0;
    total += 1;
    console.log(`${aBlack ? a : b} (S) - ${aBlack ? b : a} (B): ${result.winner === 1 ? 'siyah' : 'beyaz'} +${result.margin} (${result.plies} hamle)`);
  }
  console.log(`=> ${a} ziyaret, ${b} ziyarete karşı ${winsA}/${total}`);
}
await browser.close();
server.close();
