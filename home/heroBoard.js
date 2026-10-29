/**
 * home/heroBoard.js
 *
 * Ana sayfa açılış sahnesi. Goban, taşlar ve kase Blender'da üretilir
 * (scripts/hero/build-hero-goban.py → assets/hero/goban.glb). İlk kare,
 * Blender posteriyle (assets/hero/poster-*.webp) aynı kameradan başlar:
 * siyah taş atari durumunda, son nefes noktasında kırmızı halka.
 *
 * Sayfa kaydıkça kamera tahta yüzeyinden yükselip gobanın tamamını gösterir.
 * Panel mini dersi sürdürür (son nefesi kapat → taş alınır; istenirse ders
 * baştan), ardından tahta serbest 9×9 oyuna açılır: ziyaretçi siyahla oynar,
 * beyaz basit bir puanlamayla cevap verir. Hamle kuralları derslerin kural
 * motorundan gelir.
 *
 * Three.js yalnız sayfa yüklendikten sonra ve <html> üzerinde `hero-3d`
 * sınıfı varsa (WebGL var, "hareketi azalt" kapalı) yüklenir. Bir şey
 * başarısız olursa poster olduğu gibi kalır. Telefonda hafif GLB, düşük
 * çözünürlük ve ~30 fps kullanılır; sahne ekran dışındayken çizim durur.
 *
 * Birimler metredir (Blender ile aynı); eksenler Three.js düzeninde (y yukarı).
 */
import { BoardState } from '../core/boardState.js?v=2026-10-29.modlar';
import { isValidMove, applyMove, getGroup, getLiberties } from '../core/ruleEngine.js?v=2026-10-29.modlar';

const RELEASE = new URL(import.meta.url).searchParams.get('v');
const asset = name => new URL('../assets/hero/' + name, import.meta.url).href + (RELEASE ? '?v=' + RELEASE : '');
const THREE_DIR = '../vendor/three-r169/';

const N = 9;
const SX = 0.022, SY = 0.0237;          // çizgi aralığı (Blender betiğiyle aynı)
const TOP = 0.06, LEG_H = 0.035;        // tahta üst yüzü, ayak yüksekliği
// <picture> içindeki telefon posteriyle aynı sorgu: kamera hangi posterle başlıyorsa onu izler.
const PHONE = '(max-width: 1024px) and (orientation: portrait)';
const LITE = '(max-width: 700px), (pointer: coarse)';

export function mountHeroBoard(root) {
  if (!root || !document.documentElement.classList.contains('hero-3d')) return;
  const start = () => load(root).catch(() => {});
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

async function load(root) {
  const lite = matchMedia(LITE).matches;
  const [T, { GLTFLoader }, { RoomEnvironment }, cfg] = await Promise.all([
    import(THREE_DIR + 'three.module.min.js'),
    import(THREE_DIR + 'addons/GLTFLoader.js'),
    import(THREE_DIR + 'addons/RoomEnvironment.js'),
    fetch(asset('sahne.json')).then(r => r.json()),
  ]);
  const gltf = await new GLTFLoader().loadAsync(asset(lite ? 'goban-hafif.glb' : 'goban.glb'));
  init(T, RoomEnvironment, root, gltf.scene, cfg, lite);
}

const clamp01 = v => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeInOut = p => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** Düşüş: ivmeli iniş, sonda küçük bir sekme. */
function fall(p, y0, rest) {
  if (p < .8) { const q = p / .8; return y0 + (rest - y0) * q * q; }
  return rest + .0018 * Math.sin(((p - .8) / .2) * Math.PI);
}
const key = (x, y) => x + ',' + y;
const libsAt = (b, x, y) => getLiberties(b, getGroup(b, x, y)).size;
const wx = i => (i - 4) * SX;           // sütun → x
const wz = j => (j - 4) * SY;           // satır → z (Blender'da y = (4 - j)·SY, z = −y)

/** Tohumlu, küçük rastgele sayı üreteci (mulberry32): aynı tohum, aynı dizi. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Beyazın hamlesi: alma, kendi atarisinden kaçma, siyahı sıkıştırma. */
function whiteMove(state, random = Math.random) {
  let best = null, bestScore = -Infinity;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!isValidMove(state, x, y, 'white').valid) continue;
    const r = applyMove(state, x, y, 'white');
    const libs = libsAt(r.newState, x, y);
    let s = r.captured.length * 100 + Math.min(libs, 4) * 6;
    if (libs === 1) s -= 60;
    for (const n of state.neighbors(x, y)) {
      const c = state.colorAt(n.x, n.y);
      if (c === 'black' && r.newState.colorAt(n.x, n.y) === 'black') s += (4 - Math.min(libsAt(r.newState, n.x, n.y), 4)) * 8;
      if (c === 'white' && libsAt(state, n.x, n.y) === 1) s += 50;
    }
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) s -= 6;
    s += random() * 6;
    if (s > bestScore) { bestScore = s; best = { x, y, r }; }
  }
  return best;
}

/**
 * Serbest oyunda beyaz cevap verdikten sonraki açıklama. Tahtadaki ilk taş
 * alındığında (kim alırsa alsın) yeni bir oyun için tahtayı temizlemeyi önerir.
 */
export function freePlayCaption({ blackTook, whiteTook, firstCapture, danger, chance, caps }) {
  if (firstCapture) {
    return blackTook
      ? 'İlk taşı sen aldın! Yeni bir oyun için tahtayı temizleyebilir ya da devam edebilirsin.'
      : 'Beyaz ilk taşı aldı. Tahtayı temizleyip yeniden deneyebilir ya da devam edebilirsin.';
  }
  if (whiteTook) return `Beyaz ${whiteTook} taş aldı. Sıra sende.`;
  if (danger) return 'Kırmızı halka: taşlarının tek nefesi kaldı, buna atari denir. Sıra sende.';
  if (chance) return 'Altın halka: beyazın tek nefesi kaldı. Oraya oynarsan taşı alırsın.';
  return `Esir: sen ${caps.black}, beyaz ${caps.white}. Sıra sende.`;
}

const LESSON = [
  { btn: 'Taşı bırak', cap: 'Bir taşla başlayalım. Taşı tahtaya bırak.' },
  { btn: 'Kuşat', cap: 'Bu taşın 4 nefesi var: hemen yanındaki boş noktalar.' },
  { btn: 'Son nefesi kapat', cap: 'Beyaz üç nefesi kapattı. Tek nefes kaldı; buna atari denir.' },
  { btn: 'Şimdi sen oyna', cap: 'Nefesi kalmayan taş tahtadan alınır. Go\'nun ilk kuralı bu.' },
];
const C = 4;
const LIBS = [[C, C - 1], [C + 1, C], [C - 1, C], [C, C + 1]];   // üst, sağ, sol, alt: son nefes öndeki nokta (poster)
// Açılış karesi posterdeki dizilim: atari (ders 3. adım) ve iki uzak taş.
const OPENING_EXTRA = [['black', 2, 6], ['white', 6, 2]];

/**
 * Kameralar. `yakin` posterin kamerasıdır (sahne.json); diğerleri buradan
 * ayarlanır. Değerler Blender kamerası gibi okunur: lens (mm, 36 mm sensör),
 * kaydırma (shift) çerçevenin uzun kenarına göre.
 */
const VIEWS = {
  masaustu: {
    genis: { position: [-0.30, 0.34, 0.62], target: [0.03, 0.02, -0.04], lens: 50, shiftX: -0.16, shiftY: 0 },
    oyun: { position: [-0.10, 0.50, 0.44], target: [0.035, 0.045, 0.005], lens: 42, shiftX: -0.12, shiftY: -0.045 },
  },
  telefon: {
    genis: { position: [-0.03, 0.40, 0.37], target: [-0.006, 0.03, 0.0], lens: 28, shiftX: 0, shiftY: -0.11 },
    oyun: { position: [0.0, 0.40, 0.17], target: [0.0, 0.055, 0.008], lens: 30, shiftX: 0, shiftY: -0.13 },
  },
};

function init(T, RoomEnvironment, root, model, cfg, lite) {
  const pin = root.querySelector('.hero-pin');
  const stageEl = root.querySelector('.hero-stage');
  const panel = root.querySelector('.hero-panel');
  const caption = root.querySelector('[data-hero-caption]');
  const stepBtn = root.querySelector('[data-hero-step]');
  const altBtn = root.querySelector('[data-hero-alt]');
  const dotsEl = root.querySelector('.hero-dots');
  const modesEl = root.querySelector('[data-hero-modes]');
  const chips = [...modesEl.querySelectorAll('[data-mode]')];
  const phoneMq = matchMedia(PHONE);

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  stageEl.appendChild(canvas);
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { canvas.remove(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 2));
  renderer.toneMapping = T.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lite ? T.PCFShadowMap : T.PCFSoftShadowMap;
  canvas.addEventListener('webglcontextlost', () => { root.classList.remove('is-moving', 'is-live', 'is-panel'); panel.hidden = true; });

  /* ── Sahne ve ışık (değerler Blender poster düzeninden) ── */
  const L = cfg.isik;
  const lin = rgb => new T.Color().setRGB(rgb[0], rgb[1], rgb[2], T.LinearSRGBColorSpace);
  const scene = new T.Scene();
  scene.background = lin(L.arkaPlan);
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.06;
  pmrem.dispose();

  const sun = new T.DirectionalLight(lin(L.gunesRenk), 3.4);
  sun.position.fromArray(L.gunesYon).multiplyScalar(1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.0015;
  sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -0.32, right: 0.32, top: 0.32, bottom: -0.32, near: 0.2, far: 2.6 });
  scene.add(sun, sun.target);
  const fill = new T.PointLight(lin(L.dolguRenk), 0.55, 0, 2);
  fill.position.fromArray(L.dolguKonum);
  scene.add(fill);

  const floor = new T.Mesh(new T.PlaneGeometry(8, 8), new T.MeshStandardMaterial({ color: lin([0.03, 0.018, 0.012]), roughness: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = L.zeminY;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(model);
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const proto = { black: model.getObjectByName('TasSiyah'), white: model.getObjectByName('TasBeyaz') };
  const rest = { black: TOP + proto.black.userData.stoneHeight / 2, white: TOP + proto.white.userData.stoneHeight / 2 };
  proto.black.visible = proto.white.visible = false;
  const stones = new T.Group();
  scene.add(stones);
  function makeStone(color) {
    const m = proto[color].clone();
    m.visible = true;
    m.rotation.set(0, Math.random() * Math.PI * 2, 0);
    stones.add(m);
    return m;
  }
  function fadeable(mesh) {
    if (!mesh.userData.ownMat) { mesh.material = mesh.material.clone(); mesh.userData.ownMat = true; }
    mesh.material.transparent = true;
    return mesh.material;
  }
  function removeStone(m) {
    stones.remove(m);
    if (m.userData.ownMat) m.material.dispose();
  }

  /* ── Halkalar: çizgi + yumuşak parıltı (posterdeki ışıma) ── */
  const RING = { red: lin(L.halka.renk), gold: lin([0.95, 0.62, 0.20]) };
  const ringGeo = new T.TorusGeometry(L.halka.r, lite ? 0.0008 : 0.0007, 10, 72);
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 26, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const glowGeo = new T.PlaneGeometry(L.halka.r * 3.4, L.halka.r * 3.4);
  function makeRing(x, y, kind) {
    const g = new T.Group();
    const line = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: RING[kind].clone().multiplyScalar(2.2), toneMapped: false, transparent: true }));
    line.rotation.x = -Math.PI / 2;
    const glow = new T.Mesh(glowGeo, new T.MeshBasicMaterial({ map: glowTex, color: RING[kind], transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.0002;
    g.add(glow, line);
    g.position.set(wx(x), TOP + 0.0006, wz(y));
    g.scale.setScalar(0.001);
    g.userData = { s: 0.001, on: false, kind, line, glow };
    scene.add(g);
    return g;
  }
  function setRingKind(r, kind) {
    r.userData.kind = kind;
    r.userData.line.material.color.copy(RING[kind]).multiplyScalar(2.2);
    r.userData.glow.material.color.copy(RING[kind]);
  }

  const pickPlane = new T.Mesh(new T.PlaneGeometry(9 * SX, 9 * SY), new T.MeshBasicMaterial({ visible: false }));
  pickPlane.rotation.x = -Math.PI / 2;
  pickPlane.position.y = TOP;
  scene.add(pickPlane);
  const ghost = makeStone('black');
  fadeable(ghost).opacity = 0.4;
  ghost.castShadow = false;
  ghost.visible = false;

  /* ── Zamanlayıcılar ── */
  let tweens = [], t = 0, dirty = true;
  function tween(dur, fn, done) { tweens.push({ t: 0, dur, fn, done }); }
  const wait = (dur, fn) => tween(dur, () => {}, fn);

  /* ── Kamera ── */
  const cam = new T.PerspectiveCamera(30, 1, 0.003, 20);
  const V = (v, aspect) => ({
    position: new T.Vector3().fromArray(v.position), target: new T.Vector3().fromArray(v.target),
    lens: v.lens, shiftX: v.shiftX, shiftY: v.shiftY, aspect,
  });
  let views;
  function pickViews() {
    const phone = phoneMq.matches, c = phone ? cfg.telefon : cfg.masaustu, set = VIEWS[phone ? 'telefon' : 'masaustu'];
    const aspect = c.width / c.height;
    views = { yakin: V(c, aspect), genis: V(set.genis, aspect), oyun: V(set.oyun, aspect) };
  }
  pickViews();
  let w = 1, h = 1, scrollP = 0, lessonP = 0, playP = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, active: false };
  const tmp = { pos: new T.Vector3() };
  function blend(a, b, k, out) {
    out.position.lerpVectors(a.position, b.position, k);
    out.target.lerpVectors(a.target, b.target, k);
    out.lens = lerp(a.lens, b.lens, k); out.shiftX = lerp(a.shiftX, b.shiftX, k); out.shiftY = lerp(a.shiftY, b.shiftY, k);
    out.aspect = a.aspect;
    return out;
  }
  const cur = { position: new T.Vector3(), target: new T.Vector3() }, mid = { position: new T.Vector3(), target: new T.Vector3() };
  /**
   * Görünümü uygular. Poster `object-fit: cover` ile kırpıldığı için kamera da
   * aynı kırpmayı yapar: tam çerçeve kanvası örter, görünen parça ortadan alınır
   * (setViewOffset). Blender'ın kaydırması da aynı ofsete eklenir.
   */
  function applyCamera() {
    const k = easeInOut(Math.max(scrollP, lessonP));
    blend(views.yakin, views.genis, k, mid);
    blend(mid, views.oyun, easeInOut(playP), cur);
    const lift = Math.sin(Math.PI * k) * 0.04;                      // yükselirken hafif yay
    tmp.pos.copy(cur.position); tmp.pos.y += lift;
    const par = k * 0.012;                                          // fareyle küçük paralaks
    tmp.pos.x += pointer.sx * par; tmp.pos.y -= pointer.sy * par * 0.6;
    cam.position.copy(tmp.pos);
    cam.lookAt(cur.target);
    const A = cur.aspect;
    let FW, FH;
    if (w / h > A) { FW = w; FH = w / A; } else { FH = h; FW = h * A; }
    const big = Math.max(FW, FH), tanHalf = 18 / cur.lens;
    const tanV = FW >= FH ? tanHalf * FH / FW : tanHalf;
    cam.fov = T.MathUtils.radToDeg(2 * Math.atan(tanV));
    cam.aspect = FW / FH;
    cam.setViewOffset(FW, FH, (FW - w) / 2 + cur.shiftX * big, (FH - h) / 2 - cur.shiftY * big, w, h);
    cam.updateProjectionMatrix();
  }
  function lessonTo(v, dur) { const v0 = lessonP; tween(dur, p => { lessonP = lerp(v0, v, p); dirty = true; }); }
  function playTo(v, dur, done) { const v0 = playP; tween(dur, p => { playP = lerp(v0, v, p); dirty = true; }, done); }

  function resize() {
    const r = stageEl.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    dirty = true;
  }
  new ResizeObserver(resize).observe(stageEl);
  phoneMq.addEventListener('change', () => { pickViews(); dirty = true; });

  /** Kaydırma ilerlemesi: sabitlenmiş açılışın kaydırma payında 0 → 1. */
  function readScroll() {
    const r = root.getBoundingClientRect();
    const stick = parseFloat(getComputedStyle(pin).top) || 0;      // sabit başlığın altı
    const span = r.height - pin.getBoundingClientRect().height;
    const p = span > 1 ? clamp01((stick - r.top) / span) : 0;
    if (Math.abs(p - scrollP) > 1e-4) { scrollP = p; dirty = true; live(); }
    root.dataset.heroProgress = scrollP.toFixed(2);
  }
  addEventListener('scroll', readScroll, { passive: true });

  root.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;
    const r = root.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((ev.clientY - r.top) / r.height) * 2 - 1;
    pointer.active = true;
  });
  root.addEventListener('pointerleave', () => { pointer.active = false; });

  /** Kanvas, kamera ilk kez kıpırdadığında posterin üstüne gelir. */
  function live() {
    if (root.classList.contains('is-moving')) return;
    root.classList.add('is-moving');
  }
  function syncPanelMode() {
    root.classList.toggle('is-panel', scrollP > 0.45 || lessonP > 0.5 || mode !== 'lesson');
  }

  /* ── Panel ── */
  // mode: 'lesson' (Taş alma), 'modul' (diğer yedi mod), 'free' (serbest oyun)
  let mode = 'lesson', phase = 2, busy = false;
  function setBusy(v) {
    busy = v; stepBtn.disabled = v; altBtn.disabled = v;
    chips.forEach(c => { c.disabled = v; });
  }
  function say(text) {
    caption.textContent = text;
    caption.classList.remove('is-new'); void caption.offsetWidth; caption.classList.add('is-new');
  }
  function sync() {
    root.dataset.heroMode = mode;
    root.dataset.heroPhase = String(phase);
    root.dataset.heroStones = String(state.stones.length);
  }
  function setDots(count, on) {
    dotsEl.hidden = !count;
    while (dotsEl.children.length > count) dotsEl.lastChild.remove();
    while (dotsEl.children.length < count) dotsEl.appendChild(document.createElement('i'));
    [...dotsEl.children].forEach((d, k) => d.classList.toggle('on', k <= on));
  }
  function pressChip(id) {
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.mode === id)));
    root.dataset.heroModeId = id || '';
  }
  function showLesson(i) {
    say(LESSON[i].cap);
    stepBtn.hidden = false;
    stepBtn.textContent = LESSON[i].btn;
    altBtn.textContent = i === LESSON.length - 1 ? 'Mini dersi baştan izle' : 'Serbest oyna';
    setDots(LESSON.length, i);
    pressChip('tas-alma');
    sync();
  }
  function showFree(text) {
    say(text);
    stepBtn.hidden = false;
    stepBtn.textContent = 'Tahtayı temizle';
    altBtn.textContent = 'Mini dersi baştan izle';
    setDots(0, 0);
    pressChip('');
    sync();
  }
  /** İlk taş alındığında "Tahtayı temizle" düğmesi öne çıkar; sonraki hamlede söner. */
  function suggestClear(on) {
    stepBtn.classList.toggle('is-suggested', on);
    root.dataset.heroSuggest = on ? 'temizle' : '';
  }

  /* ── Tahta durumu: derste de serbest oyunda da kural motoru izlenir ── */
  let state = new BoardState(N), meshes = new Map(), rings = new Map(), caps = { black: 0, white: 0 };
  function put(color, x, y, from, dur, done) {
    const m = makeStone(color);
    m.position.set(wx(x) + (Math.random() - .5) * .0008, from ?? rest[color], wz(y) + (Math.random() - .5) * .0008);
    meshes.set(key(x, y), m);
    if (from != null) tween(dur, p => { m.position.y = fall(p, from, rest[color]); }, done);
    return m;
  }
  function lift(k, dur = .55) {
    const m = meshes.get(k); if (!m) return;
    meshes.delete(k);
    const mat = fadeable(m), y0 = m.position.y;
    tween(dur, p => { m.position.y = y0 + easeOut(p) * 0.035; mat.opacity = 1 - p; }, () => removeStone(m));
  }
  function place(color, x, y, from, dur, done) {
    const r = applyMove(state, x, y, color);
    state = r.newState;
    put(color, x, y, from, dur, done);
    return r;
  }
  function ringTo(r, s, d, done) {
    const s0 = r.userData.s; r.userData.on = true;
    tween(d || .3, p => { r.userData.s = lerp(s0, s, easeOut(p)); r.scale.setScalar(r.userData.s); }, () => {
      if (s < .01) r.userData.on = false;
      if (done) done();
    });
  }
  const dropRing = r => ringTo(r, .001, .25, () => scene.remove(r));
  function clearRings() { for (const r of rings.values()) dropRing(r); rings.clear(); }
  function clearBoardState() {
    [...meshes.keys()].forEach(k => lift(k, .45));
    clearRings();
    clearMarks();
    state = new BoardState(N); caps = { black: 0, white: 0 };
    suggestClear(false);
  }

  /* ── İşaretler: yasak noktası (X), A/B harfi, alan karesi, mod halkası ── */
  const marks = new T.Group(), markRings = new Map();
  scene.add(marks);
  const MARK = {
    x: new T.MeshBasicMaterial({ color: RING.red.clone().multiplyScalar(1.6), toneMapped: false }),
    black: new T.MeshStandardMaterial({ color: lin([0.02, 0.02, 0.025]), roughness: 0.5 }),
    white: new T.MeshStandardMaterial({ color: lin([0.92, 0.9, 0.86]), roughness: 0.5 }),
  };
  const barGeo = new T.BoxGeometry(SX * 0.62, 0.0006, 0.0016), squareGeo = new T.BoxGeometry(SX * 0.38, 0.0008, SY * 0.38);
  const letterGeo = new T.PlaneGeometry(SX * 0.8, SX * 0.8), letters = {};
  function letterMat(text) {
    if (letters[text]) return letters[text];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '700 92px "Noto Serif", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3a2412'; g.fillText(text, 64, 70);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    return (letters[text] = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  }
  function addMark(m) {
    if (m.type === 'ring-red' || m.type === 'ring-gold') {
      const r = makeRing(m.x, m.y, m.type === 'ring-red' ? 'red' : 'gold');
      markRings.set(key(m.x, m.y), r); ringTo(r, 1, .3);
      return;
    }
    const g = new T.Group();
    g.position.set(wx(m.x), TOP + 0.0005, wz(m.y));
    if (m.type === 'x') {
      for (const a of [Math.PI / 4, -Math.PI / 4]) { const b = new T.Mesh(barGeo, MARK.x); b.rotation.y = a; g.add(b); }
    } else if (m.type === 'label') {
      const p = new T.Mesh(letterGeo, letterMat(m.text)); p.rotation.x = -Math.PI / 2; g.add(p);
    } else {
      const s = new T.Mesh(squareGeo, MARK[m.type]); s.castShadow = true; g.add(s);
    }
    g.scale.setScalar(0.001);
    tween(.25, p => g.scale.setScalar(Math.max(.001, easeOut(p))));
    marks.add(g);
  }
  function clearMarks() {
    marks.clear();
    for (const r of markRings.values()) dropRing(r);
    markRings.clear();
  }
  /** Tek nefesi kalan gruplar: siyahınki kırmızı (tehlike), beyazınki altın (fırsat). */
  function updateAtari() {
    const want = new Map(), seen = new Set();
    for (const s of state.stones) {
      const k = key(s.x, s.y); if (seen.has(k)) continue;
      const g = getGroup(state, s.x, s.y); g.forEach(gk => seen.add(gk));
      const libs = getLiberties(state, g);
      if (libs.size !== 1) continue;
      const lk = [...libs][0], kind = s.color === 'black' ? 'red' : 'gold';
      if (want.get(lk) !== 'red') want.set(lk, kind);
    }
    for (const [k, r] of rings) {
      if (want.get(k) === r.userData.kind) continue;
      rings.delete(k); dropRing(r);
    }
    for (const [k, kind] of want) {
      if (rings.has(k)) continue;
      const [x, y] = k.split(',').map(Number), r = makeRing(x, y, kind);
      rings.set(k, r); ringTo(r, 1, .3);
    }
    const kinds = [...want.values()];
    return { danger: kinds.filter(v => v === 'red').length, chance: kinds.filter(v => v === 'gold').length };
  }

  /* ── Mini ders ── */
  let hover = null;                     // 0. adımda tahtanın üstünde süzülen taş
  function opening() {
    // Posterdeki kare: atari + iki uzak taş, son nefeste kırmızı halka.
    place('black', C, C); for (let i = 0; i < 3; i++) place('white', ...LIBS[i]);
    for (const [c, x, y] of OPENING_EXTRA) place(c, x, y);
    const [lx, ly] = LIBS[3], r = makeRing(lx, ly, 'red');
    r.userData.s = 1; r.scale.setScalar(1); r.userData.on = true;
    rings.set(key(lx, ly), r);
    phase = 2; mode = 'lesson';
    showLesson(2);
  }
  function startLesson() {
    phase = 0; mode = 'lesson';
    const m = hover = makeStone('black');
    m.position.set(0, TOP + 0.09, 0);
    m.userData.settling = true;
    tween(.7, p => { if (m.userData.settling) m.position.y = lerp(TOP + 0.09, TOP + 0.05, easeOut(p)); }, () => { m.userData.settling = false; });
    showLesson(0);
  }
  function nextLesson() {
    if (busy) return;
    setBusy(true);
    live();
    if (lessonP < 1) lessonTo(1, 1.4);
    const finish = () => { setBusy(false); syncPanelMode(); };
    if (phase === 0) {
      const m = hover;
      hover = null;
      m.userData.settling = false;       // iniş tween'i yarıda kalsa da artık taşı oynatmaz
      const y0 = m.position.y;
      tween(.55, p => { m.position.y = fall(p, y0, rest.black); }, () => {
        state = applyMove(state, C, C, 'black').newState;
        meshes.set(key(C, C), m);
        LIBS.forEach(([x, y], i) => wait(.15 + i * .16, () => { const r = makeRing(x, y, 'gold'); rings.set(key(x, y), r); ringTo(r, 1); }));
        wait(.9, () => { phase = 1; showLesson(1); finish(); });
      });
    } else if (phase === 1) {
      LIBS.slice(0, 3).forEach(([x, y], i) => wait(i * .35, () => {
        place('white', x, y, TOP + 0.07, .5, () => {
          const r = rings.get(key(x, y)); if (r) { rings.delete(key(x, y)); dropRing(r); }
          if (i === 2) {
            setRingKind(rings.get(key(...LIBS[3])), 'red');
            wait(.3, () => { phase = 2; showLesson(2); finish(); });
          }
        });
      }));
    } else if (phase === 2) {
      const [x, y] = LIBS[3];
      const r = place('white', x, y, TOP + 0.07, .5, () => {
        const ring = rings.get(key(x, y)); if (ring) { rings.delete(key(x, y)); dropRing(ring); }
        r.captured.forEach(c => lift(key(c.x, c.y), .7));
        wait(.75, () => { phase = 3; showLesson(3); sync(); finish(); });
      });
    } else {
      toFree();
    }
  }
  function restartLesson() {
    setBusy(true);
    live();
    ghost.visible = false;
    clearBoardState();
    if (hover) { removeStone(hover); hover = null; }
    playTo(0, 1.1);
    lessonTo(1, .8);
    wait(.6, () => { startLesson(); setBusy(false); syncPanelMode(); });
  }

  /* ── Modlar: yasak hamle, ko, oyun sonu, iki göz, bağlantı, merdiven, ağ · snapback ── */
  let modes = null, modesLoad = null, curMode = null, stepIdx = 0, taskDone = false, found = new Set(), regionIdx = 0;
  /** Mod verisi (home/heroModes.js) ziyaretçi seçiciye ilk yaklaştığında yüklenir. */
  function loadModes() {
    modesLoad ||= import(new URL('./heroModes.js', import.meta.url).href + (RELEASE ? '?v=' + RELEASE : ''))
      .then(m => { modes = m.buildModes(); return modes; });
    return modesLoad;
  }
  const same = (a, b) => a.x === b.x && a.y === b.y;
  /** Tahtayı temizleyip bir dizilimi taş taş kurar. */
  function setBoard(list, done) {
    clearBoardState();
    wait(.35, () => {
      for (const s of list) state.placeStone(s.x, s.y, s.color);
      list.forEach((s, i) => wait(i * .018, () => put(s.color, s.x, s.y, TOP + 0.03, .3)));
      wait(list.length * .018 + .35, () => { sync(); done(); });
    });
  }
  /** Hamleleri sırayla oynar; alınan taşlar kalkar, atari halkaları güncellenir. */
  function playMoves(list, gap, done) {
    if (!list.length) { done(); return; }
    const [m, ...rest] = list;
    const r = place(m.color, m.x, m.y, TOP + 0.05, .38);
    if (r.captured.length) wait(.36, () => r.captured.forEach(c => lift(key(c.x, c.y))));
    wait(gap, () => { updateAtari(); sync(); playMoves(rest, gap, done); });
  }
  function startMode(id) {
    const m = modes.find(x => x.id === id);
    setBusy(true);
    live();
    ghost.visible = false;
    if (hover) { removeStone(hover); hover = null; }
    mode = 'modul'; phase = 0; curMode = m;
    pressChip(id);
    playTo(0, 1.1);
    lessonTo(1, .8);
    syncPanelMode();
    runStep(0);
  }
  function runStep(i) {
    stepIdx = i; taskDone = false; found = new Set(); regionIdx = 0;
    const st = curMode.steps[i];
    root.dataset.heroModeStep = String(i);
    root.dataset.heroTask = '';
    setBusy(true);
    const go = () => {
      clearMarks();
      (st.marks || []).forEach(addMark);
      say(st.cap);
      setDots(curMode.steps.length, i);
      stepBtn.hidden = !!st.task;
      stepBtn.textContent = st.btn || 'Devam';
      altBtn.textContent = 'Serbest oyna';
      setBusy(false);
      sync();
    };
    if (st.setup) setBoard(st.setup, go); else go();
  }
  function nextModeId() {
    const ids = chips.map(c => c.dataset.mode);
    return ids[(ids.indexOf(curMode.id) + 1) % ids.length];
  }
  function finishTask(text) {
    taskDone = true;
    root.dataset.heroTask = 'tamam';
    say(text);
    const last = stepIdx === curMode.steps.length - 1;
    const next = chips.find(c => c.dataset.mode === nextModeId());
    stepBtn.textContent = last ? 'Sonraki: ' + next.textContent : 'Devam';
    stepBtn.hidden = false;
    setBusy(false);
    sync();
  }
  function stepModule() {
    const st = curMode.steps[stepIdx];
    if (!st.task) {                         // gösterim adımı: düğme hamleyi oynatır, sonra ilerler
      setBusy(true);
      playMoves(st.after || [], .55, () => runStep(stepIdx + 1));
    } else if (taskDone) {
      if (stepIdx < curMode.steps.length - 1) runStep(stepIdx + 1);
      else chooseMode(nextModeId());
    }
  }
  function tapModule(q) {
    const t = curMode.steps[stepIdx].task;
    if (!t || taskDone || busy) return;
    if (t.kind === 'rule') {
      const v = isValidMove(state, q.x, q.y, t.color), hit = t.targets.find(p => same(p, q));
      if (v.reason === 'OCCUPIED') return;
      if (!hit || v.reason !== t.reason) { say(t.err); return; }
      if (found.has(key(q.x, q.y))) return;
      found.add(key(q.x, q.y));
      if (t.reason === 'KO') (t.marks || []).forEach(addMark); else addMark({ ...hit, type: 'x' });
      const total = t.all ? t.targets.length : 1;
      if (found.size >= total) finishTask(t.ok);
      else say(t.found(hit, found.size, total));
    } else if (t.kind === 'answer') {
      const hit = t.targets.find(p => same(p, q));
      if (!hit) { if (state.isEmpty(q.x, q.y)) say(t.err); return; }
      setBusy(true);
      clearMarks();
      playMoves([{ x: hit.x, y: hit.y, color: t.color }, ...(t.after || [])], t.after?.length > 4 ? .34 : .6, () => finishTask(t.ok));
    } else if (t.kind === 'region') {
      const r = t.regions[regionIdx];
      if (!r.points.some(p => same(p, q))) { say(t.err); return; }
      setBusy(true);
      r.points.forEach((p, i) => wait(i * .025, () => addMark({ ...p, type: r.color })));
      wait(r.points.length * .025 + .2, () => {
        regionIdx += 1;
        if (regionIdx >= t.regions.length) finishTask(r.ok);
        else { say(r.ok); setBusy(false); }
      });
    }
  }
  function chooseMode(id) {
    if (busy) return;
    if (id === 'tas-alma') { restartLesson(); return; }
    setBusy(true);
    say('Mod hazırlanıyor…');
    loadModes().then(() => { setBusy(false); startMode(id); }, () => { setBusy(false); say('Mod yüklenemedi. Sayfayı yenileyip tekrar dene.'); });
  }
  chips.forEach(c => c.addEventListener('click', () => chooseMode(c.dataset.mode)));
  // Mod verisini, ziyaretçi seçiciye yaklaşınca önceden yükle.
  modesEl.addEventListener('pointerenter', () => { loadModes().catch(() => {}); }, { once: true });
  modesEl.addEventListener('focusin', () => { loadModes().catch(() => {}); }, { once: true });

  /* ── Serbest oyun ── */
  function toFree() {
    setBusy(true);
    live();                              // kaydırmadan serbest oyuna geçilse de tahta görünsün
    clearBoardState();
    if (hover) { removeStone(hover); hover = null; }
    mode = 'free'; phase = 0;
    syncPanelMode();
    playTo(1, 1.2, () => {
      showFree('Sıra sende: bir noktaya dokun, siyah taş koy. Beyaz cevap verecek.');
      setBusy(false);
    });
  }
  function clearBoard() {
    setBusy(true);
    clearBoardState();
    wait(.6, () => { showFree('Tahta temiz. Sıra sende: bir noktaya dokun, siyah taş koy.'); setBusy(false); });
  }
  function apply(color, x, y, r) {
    state = r.newState;
    put(color, x, y, TOP + 0.06, .45);
    if (r.captured.length) wait(.42, () => r.captured.forEach(c => lift(key(c.x, c.y))));
    caps[color] += r.captured.length;
    sync();
  }
  function playAt(q) {
    const v = isValidMove(state, q.x, q.y, 'black');
    if (v.reason === 'OCCUPIED') return;
    if (v.reason === 'SUICIDE') { say('Bu nokta yasak: taşın hiç nefesi kalmaz.'); return; }
    if (v.reason === 'KO') { say('Ko: bu taşı hemen geri alamazsın, önce başka yere oyna.'); return; }
    if (!v.valid) return;
    ghost.visible = false; setBusy(true);
    suggestClear(false);
    const takenBefore = caps.black + caps.white;
    const r = applyMove(state, q.x, q.y, 'black');
    apply('black', q.x, q.y, r);
    say(r.captured.length ? `${r.captured.length} beyaz taş aldın! Beyaz düşünüyor…` : 'Beyaz düşünüyor…');
    wait(.5, () => updateAtari());
    wait(.8, () => {
      // Testler tahtaya data-hero-seed koyarak beyazın cevaplarını sabitleyebilir.
      const seed = root.dataset.heroSeed;
      const m = whiteMove(state, seed ? seeded(Number(seed) + state.stones.length) : Math.random);
      if (!m) { say('Beyazın oynayacak yeri kalmadı. Tahtayı temizleyebilirsin.'); setBusy(false); sync(); return; }
      apply('white', m.x, m.y, m.r);
      wait(.5, () => {
        const a = updateAtari();
        const firstCapture = takenBefore === 0 && caps.black + caps.white > 0;
        setBusy(false); sync();
        say(freePlayCaption({ blackTook: r.captured.length, whiteTook: m.r.captured.length, firstCapture, ...a, caps }));
        suggestClear(firstCapture);
      });
    });
  }

  /* ── Tıklama ve hayalet taş ── */
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObject(pickPlane)[0]; if (!hit) return null;
    const x = Math.round(hit.point.x / SX + 4), y = Math.round(hit.point.z / SY + 4);
    return state.isInBounds(x, y) ? { x, y } : null;
  }
  canvas.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;
    const q = mode === 'free' && !busy ? pick(ev) : null;
    const show = !!q && state.isEmpty(q.x, q.y);
    if (show) ghost.position.set(wx(q.x), rest.black, wz(q.y));
    if (show !== ghost.visible || show) dirty = true;
    ghost.visible = show;
    canvas.style.cursor = mode === 'free' ? (show ? 'pointer' : 'default') : 'pointer';
  });
  canvas.addEventListener('pointerleave', () => { ghost.visible = false; dirty = true; });
  canvas.addEventListener('click', ev => {
    if (mode === 'lesson') { nextLesson(); return; }
    if (busy) return;
    const q = pick(ev); if (!q) return;
    if (mode === 'modul') tapModule(q); else playAt(q);
  });
  stepBtn.addEventListener('click', () => {
    if (busy) return;
    if (mode === 'lesson') nextLesson();
    else if (mode === 'modul') stepModule();
    else clearBoard();
  });
  altBtn.addEventListener('click', () => {
    if (busy) return;
    if (mode === 'free' || (mode === 'lesson' && phase === LESSON.length - 1)) restartLesson();
    else toFree();
  });
  canvas.style.cursor = 'pointer';

  /** Testler için: bir kesişimin ekran konumu (CSS pikseli). */
  root.heroPointFor = (x, y) => {
    const v = new T.Vector3(wx(x), TOP, wz(y)).project(cam), r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  };

  /* ── Döngü: yalnız görünürken ve bir şey değişirken çizer ── */
  let raf = 0, last = 0, running = false, skip = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (lite) { skip = !skip; if (skip) return; }
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    t += dt;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur); tw.fn(p);
      if (p >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
    const tx = pointer.active ? pointer.x : 0, ty = pointer.active ? pointer.y : 0;
    const settled = Math.abs(pointer.sx - tx) < 1e-3 && Math.abs(pointer.sy - ty) < 1e-3;
    pointer.sx = lerp(pointer.sx, tx, .06); pointer.sy = lerp(pointer.sy, ty, .06);
    if (hover && !hover.userData.settling) {
      hover.position.y = TOP + 0.05 + Math.sin(t * 1.7) * 0.004;
      hover.rotation.z = Math.sin(t * .9) * .08;
    }
    let pulsing = false;
    for (const r of [...rings.values(), ...markRings.values()]) {
      if (!r.userData.on) continue;
      pulsing = true;
      const s = r.userData.s * (1 + Math.sin(t * (r.userData.kind === 'red' ? 5 : 2.6) + r.position.x * 90) * .05);
      r.scale.setScalar(s);
      r.userData.glow.material.opacity = 0.45 + Math.sin(t * 2.2) * 0.12;
    }
    syncPanelMode();
    const moving = root.classList.contains('is-moving');
    if (dirty || tweens.length || hover || (pulsing && moving) || !settled) {
      applyCamera();
      renderer.render(scene, cam);
      dirty = false;
    }
  }
  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { last = performance.now(); raf = requestAnimationFrame(frame); }
    else cancelAnimationFrame(raf);
  }
  let inView = false;
  const update = () => setRunning(inView && !document.hidden);
  new IntersectionObserver(es => { inView = es[0].isIntersecting; update(); }, { rootMargin: '80px' }).observe(root);
  document.addEventListener('visibilitychange', update);

  opening();
  resize();
  readScroll();
  applyCamera();
  renderer.render(scene, cam);
  panel.hidden = false;
  root.classList.add('is-live');
  syncPanelMode();
}
