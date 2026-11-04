/**
 * core/kataFeatures.js
 *
 * Tahta konumunu KataGo'nun V7 girdi biçimine çevirir ve ağ çıktılarını
 * okunur hale getirir. Saf: DOM, TensorFlow ve worker bağımlılığı yok.
 *
 * Kurallar: basit ko, tek taş intiharı yasak, alan sayımı, vergi yok.
 * Merdiven (14-17) ve kesin canlı alan (18-19) kanalları hesaplanmaz, sıfır
 * kalır: ağ bunlar olmadan da çalışır, küçük arama bu boşluğu kapatır.
 *
 * position: {
 *   grid: Int8Array (0 boş, 1 siyah, 2 beyaz), size, ko: indeks|-1, komi,
 *   toPlay: 1|2,
 *   history: [{color:1|2, point:indeks|-1}]  // eskiden yeniye, -1 pas
 * }
 */

export const NET_SIZE = 19;
export const NET_POINTS = NET_SIZE * NET_SIZE;
export const NET_PASS = NET_POINTS;
export const NET_CHANNELS = 22;
export const NET_GLOBALS = 19;

function libertyCounts(grid, size) {
  const counts = new Int16Array(size * size);
  const seen = new Uint8Array(size * size);
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || seen[start]) continue;
    const color = grid[start];
    const stones = [], libs = new Set(), stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      stones.push(i);
      const x = i % size, y = (i / size) | 0;
      const around = [];
      if (x > 0) around.push(i - 1);
      if (x < size - 1) around.push(i + 1);
      if (y > 0) around.push(i - size);
      if (y < size - 1) around.push(i + size);
      for (const n of around) {
        if (!grid[n]) libs.add(n);
        else if (grid[n] === color && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    for (const stone of stones) counts[stone] = libs.size;
  }
  return counts;
}

/** Alan sayımında komi paritesini ağa bildiren üçgen dalga (V7, kanal 18). */
export function komiWave(selfKomi, size) {
  const drawableEven = (size * size) % 2 === 0;
  const floor = drawableEven ? Math.floor(selfKomi / 2) * 2 : Math.floor((selfKomi - 1) / 2) * 2 + 1;
  const delta = selfKomi - floor;
  if (delta < 0.5) return delta;
  if (delta < 1.5) return 1 - delta;
  return delta - 2;
}

export function buildInputs(position) {
  const { grid, size, ko = -1, komi, toPlay, history = [] } = position;
  const bin = new Float32Array(NET_POINTS * NET_CHANNELS);
  const global = new Float32Array(NET_GLOBALS);
  const opponent = 3 - toPlay;
  const libs = libertyCounts(grid, size);
  const at = (i, channel) => {
    const x = i % size, y = (i / size) | 0;
    return (y * NET_SIZE + x) * NET_CHANNELS + channel;
  };

  for (let i = 0; i < grid.length; i++) {
    bin[at(i, 0)] = 1;
    if (grid[i] === toPlay) bin[at(i, 1)] = 1;
    else if (grid[i] === opponent) bin[at(i, 2)] = 1;
    if (grid[i] && libs[i] >= 1 && libs[i] <= 3) bin[at(i, 2 + libs[i])] = 1;
  }
  if (ko >= 0) bin[at(ko, 6)] = 1;

  // Son beş hamle; renkler sırayla gelmiyorsa geçmiş orada kesilir.
  for (let back = 1; back <= 5; back++) {
    const entry = history[history.length - back];
    const expected = back % 2 === 1 ? opponent : toPlay;
    if (!entry || entry.color !== expected) break;
    if (entry.point < 0) global[back - 1] = 1;
    else bin[at(entry.point, 8 + back)] = 1;
  }

  const selfKomi = toPlay === 2 ? komi : -komi;
  global[5] = selfKomi / 20;
  const last = history[history.length - 1];
  global[14] = last && last.point < 0 ? 1 : 0;   // alan sayımında ikinci pas oyunu bitirir
  global[18] = komiWave(selfKomi, size);
  return { bin, global };
}

/** Ham politikadan tahta noktalarına normalize dağılım: Float32Array(size²+1), son eleman pas. */
export function readPolicy(raw, size) {
  const logits = new Float32Array(size * size + 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) logits[y * size + x] = raw[y * NET_SIZE + x];
  logits[size * size] = raw[NET_PASS];
  let top = -Infinity;
  for (const value of logits) if (value > top) top = value;
  let sum = 0;
  for (let i = 0; i < logits.length; i++) { logits[i] = Math.exp(logits[i] - top); sum += logits[i]; }
  for (let i = 0; i < logits.length; i++) logits[i] /= sum;
  return logits;
}

/** value_output logit'leri: sıradaki oyuncunun kazanma olasılığı. */
export function readWinrate(value) {
  const [win, loss, noResult] = value;
  const top = Math.max(win, loss, noResult);
  const w = Math.exp(win - top), l = Math.exp(loss - top), n = Math.exp(noResult - top);
  return (w + 0.5 * n) / (w + l + n);
}

/** Sahiplik: -1..1, sıradaki oyuncu açısından gelir; siyah açısına çevrilir. */
export function readOwnership(raw, size, toPlay) {
  const sign = toPlay === 1 ? 1 : -1;
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    out[y * size + x] = Math.tanh(raw[y * NET_SIZE + x]) * sign;
  }
  return out;
}
