/**
 * workers/robotEngine.worker.js
 *
 * KataGo ağı + küçük arama. Klasik worker: TensorFlow.js importScripts ister,
 * saf çekirdek dinamik import ile gelir. Model repodan yüklenir.
 *
 * Gelen: { type:'MOVE'|'ANALYZE', id, position }
 * Giden: { type:'PROGRESS', fraction } model inerken
 *        { type:'READY', ok, backend?, error? }
 *        { type:'RESULT', id, ok, kind, point?, analysis?, error? }
 */
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js');

const MODEL_URL = new URL('../model/b10c128-s1141046784-d204142634/model.json', self.location.href).href;
const OUTPUTS = ['swa_model/policy_output', 'swa_model/value_output', 'swa_model/ownership_output'];
const SLOW_DEVICE_MS = 3500;   // bu süreyi aşan aramayı erken bitirir

const tools = Promise.all([import('../core/kataFeatures.js?v=2026-11-05.robot'), import('../core/robotSearch.js?v=2026-11-05.robot')]);
let model = null;
let queue = Promise.resolve();

async function evaluate(position) {
  const [features] = await tools;
  const { bin, global } = features.buildInputs(position);
  const binT = tf.tensor(bin, [1, features.NET_POINTS, features.NET_CHANNELS]);
  const globalT = tf.tensor(global, [1, features.NET_GLOBALS]);
  let outputs;
  try {
    outputs = await model.executeAsync({ 'swa_model/bin_inputs': binT, 'swa_model/global_inputs': globalT }, OUTPUTS);
    const [policy, value, ownership] = await Promise.all(outputs.map(t => t.data()));
    return {
      policy: features.readPolicy(policy.subarray(0, features.NET_POINTS + 1), position.size),
      winrate: features.readWinrate(value),
      ownership: features.readOwnership(ownership, position.size, position.toPlay),
    };
  } finally {
    tf.dispose([binT, globalT, ...(outputs || [])]);
  }
}

async function run({ type, id, position }) {
  const [, search] = await tools;
  const { ROBOT_STRENGTH, chooseRobotMove, searchPosition } = search;
  const visits = type === 'MOVE' ? ROBOT_STRENGTH.visits : ROBOT_STRENGTH.hintVisits;
  const analysis = await searchPosition(position, evaluate, { visits, deadline: Date.now() + SLOW_DEVICE_MS });
  const reply = { type: 'RESULT', id, ok: true, kind: type, analysis };
  if (type === 'MOVE') reply.point = chooseRobotMove(analysis, position);
  self.postMessage(reply, [analysis.ownership.buffer]);
}

/* İlk değerlendirme ekran kartı programlarını derler; asıl bekleme budur (Iris Xe:
   ilk değerlendirme 1,6 sn, sonrakiler 30 ms). Isınma bunu ilk hamleden önceye alır. */
async function warmUp() {
  const [features] = await tools;
  const inputs = {
    'swa_model/bin_inputs': tf.zeros([1, features.NET_POINTS, features.NET_CHANNELS]),
    'swa_model/global_inputs': tf.zeros([1, features.NET_GLOBALS]),
  };
  const outputs = await model.executeAsync(inputs, OUTPUTS);
  await Promise.all(outputs.map(tensor => tensor.data()));
  tf.dispose([...Object.values(inputs), ...outputs]);
}

async function load() {
  try {
    tf.env().set('WEBGL_USE_SHAPES_UNIFORMS', true);   // derlenen programı azaltır (ölçüm: 2,7 → 1,6 sn)
    try { await tf.setBackend('webgl'); await tf.ready(); } catch { await tf.setBackend('cpu'); await tf.ready(); }
    model = await tf.loadGraphModel(MODEL_URL, {
      onProgress: fraction => self.postMessage({ type: 'PROGRESS', fraction }),
    });
    await warmUp();
    self.postMessage({ type: 'READY', ok: true, backend: tf.getBackend() });
  } catch (error) {
    self.postMessage({ type: 'READY', ok: false, error: error.message });
  }
}

self.addEventListener('message', ({ data }) => {
  queue = queue.then(() => {
    if (!model) throw new Error('Model hazır değil');
    return run(data);
  }).catch(error => {
    self.postMessage({ type: 'RESULT', id: data.id, ok: false, kind: data.type, error: error.message });
  });
});

load();
