/**
 * home/heroBoard.js
 *
 * Ana sayfa açılış tahtası. Önce on saniyelik "ilk taş" mini dersi oynar
 * (taşı bırak → 4 nefes → kuşat/atari → taş alınır), ardından tahta serbest
 * 9×9 oyuna açılır: ziyaretçi siyahla oynar, beyaz basit bir puanlamayla
 * cevap verir. Hamle kuralları derslerin kural motorundan gelir.
 *
 * Three.js yalnız sayfa yüklendikten sonra ve <html> üzerinde `hero-3d`
 * sınıfı varsa (WebGL var, "hareketi azalt" kapalı) yüklenir. Yükleme ya da
 * WebGL başarısız olursa bugünkü hero-board.png görseli olduğu gibi kalır.
 * Telefonda hafif sürüm: gölge yok, düşük çözünürlük, ~30 fps.
 */
import { BoardState } from '../core/boardState.js?v=2026-10-28.harita';
import { isValidMove, applyMove, getGroup, getLiberties } from '../core/ruleEngine.js?v=2026-10-28.harita';

const THREE_URL = new URL('../vendor/three-r128.min.js', import.meta.url).href;
const N = 9;

export function mountHeroBoard(root) {
  if (!root || !document.documentElement.classList.contains('hero-3d')) return;
  const start = () => loadThree().then(T => init(T, root)).catch(() => {});
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = THREE_URL;
    s.async = true;
    s.onload = () => (window.THREE ? resolve(window.THREE) : reject(new Error('THREE yüklenmedi')));
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeInOut = p => (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
/** Düşüş: ivmeli iniş, sonda küçük bir sekme. */
function fall(p, y0, rest) {
  if (p < .8) { const q = p / .8; return y0 + (rest - y0) * q * q; }
  return rest + .08 * Math.sin(((p - .8) / .2) * Math.PI);
}
const key = (x, y) => x + ',' + y;
const libsAt = (b, x, y) => getLiberties(b, getGroup(b, x, y)).size;

/** Beyazın hamlesi: alma, kendi atarisinden kaçma, siyahı sıkıştırma. */
function whiteMove(state) {
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
    s += Math.random() * 6;
    if (s > bestScore) { bestScore = s; best = { x, y, r }; }
  }
  return best;
}

const LESSON = [
  { btn: 'Taşı bırak', cap: 'Bir taşla başlayalım. Taşı tahtaya bırak.' },
  { btn: 'Kuşat', cap: 'Bu taşın 4 nefesi var: hemen yanındaki boş noktalar.' },
  { btn: 'Son nefesi kapat', cap: 'Beyaz üç nefesi kapattı. Tek nefes kaldı; buna atari denir.' },
  { btn: 'Şimdi sen oyna', cap: 'Nefesi kalmayan taş tahtadan alınır. Go\'nun ilk kuralı bu.' },
];
// Kamera: mini derste merkeze yakın, serbest oyunda tüm tahta.
const VIEW = {
  lesson: { tx: 0, ty: .1, tz: .3, pitch: 1.0, half: 3.9 },
  play: { tx: 0, ty: -.2, tz: .25, pitch: .92, half: 5.1 },
};

function init(T, root) {
  const stageEl = root.querySelector('.hero-stage');
  const panel = root.querySelector('.hero-panel');
  const caption = root.querySelector('[data-hero-caption]');
  const stepBtn = root.querySelector('[data-hero-step]');
  const altBtn = root.querySelector('[data-hero-alt]');
  const dotsEl = root.querySelector('.hero-dots');
  const dots = [...dotsEl.children];
  const lite = matchMedia('(max-width: 700px), (pointer: coarse)').matches;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  stageEl.appendChild(canvas);
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { canvas.remove(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  canvas.addEventListener('webglcontextlost', () => { root.classList.remove('is-live'); panel.hidden = true; });

  const col = hex => new T.Color(hex).convertSRGBToLinear();
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(34, 1, .1, 120);
  scene.add(new T.HemisphereLight(0xfff3df, 0x2b2033, .85));
  const sun = new T.DirectionalLight(0xffe6c4, 1.3);
  sun.position.set(-5, 11, 6);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -.0006;
  sun.shadow.radius = 4;
  scene.add(sun);
  const tilt = new T.Group();
  scene.add(tilt);

  /* ── Malzemeler ── */
  function woodTexture(px, grid, dark) {
    const c = document.createElement('canvas'); c.width = c.height = px;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, px, px);
    gr.addColorStop(0, dark ? '#8a5a2b' : '#d39f5a'); gr.addColorStop(1, dark ? '#6c4520' : '#b47b3c');
    g.fillStyle = gr; g.fillRect(0, 0, px, px);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < px * .16; i++) {
      const y = rnd() * px, amp = 2 + rnd() * 7, f = .003 + rnd() * .009, ph = rnd() * 6;
      g.strokeStyle = `rgba(${dark ? '50,28,10' : '118,70,28'},${.035 + rnd() * .075})`;
      g.lineWidth = .6 + rnd() * 1.8; g.beginPath();
      for (let x = 0; x <= px; x += 8) { const yy = y + Math.sin(x * f + ph) * amp; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      g.stroke();
    }
    if (grid) {
      const m = px * grid.margin, step = (px - 2 * m) / (N - 1);
      g.strokeStyle = 'rgba(38,22,8,.8)'; g.lineWidth = Math.max(1.2, px / 520);
      for (let i = 0; i < N; i++) {
        const v = m + i * step;
        g.beginPath(); g.moveTo(m, v); g.lineTo(px - m, v); g.stroke();
        g.beginPath(); g.moveTo(v, m); g.lineTo(v, px - m); g.stroke();
      }
      g.fillStyle = 'rgba(38,22,8,.9)';
      for (const [x, y] of [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]]) { g.beginPath(); g.arc(m + x * step, m + y * step, px / 150, 0, 7); g.fill(); }
    }
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }
  const BW = 9.6, BH = .55;
  const mTop = new T.MeshStandardMaterial({ map: woodTexture(lite ? 768 : 1280, { margin: (BW - 8) / 2 / BW }), roughness: .62 });
  const mSide = new T.MeshStandardMaterial({ map: woodTexture(256, null, true), roughness: .75 });
  const boardMesh = new T.Mesh(new T.BoxGeometry(BW, BH, BW), [mSide, mSide, mTop, mSide, mSide, mSide]);
  boardMesh.position.y = -BH / 2; boardMesh.receiveShadow = true; boardMesh.castShadow = !lite;
  tilt.add(boardMesh);

  const SR = .47, SQ = .46, REST = SR * SQ;
  const stoneGeo = new T.SphereGeometry(SR, lite ? 24 : 40, lite ? 12 : 20);
  const stoneMat = {
    black: new T.MeshPhysicalMaterial({ color: col('#18171c'), roughness: .3, clearcoat: lite ? 0 : .6, clearcoatRoughness: .35 }),
    white: new T.MeshPhysicalMaterial({ color: col('#f0ece3'), roughness: .42, clearcoat: lite ? 0 : .25 }),
  };
  const makeStone = c => { const m = new T.Mesh(stoneGeo, stoneMat[c]); m.scale.y = SQ; m.castShadow = !lite; return m; };
  const fadeable = mesh => { mesh.material = mesh.material.clone(); mesh.material.transparent = true; return mesh.material; };
  const wx = i => i - (N - 1) / 2;
  const ringGeo = new T.TorusGeometry(.3, .045, 12, 48);
  const ringMat = { gold: new T.MeshBasicMaterial({ color: col('#e3b450') }), red: new T.MeshBasicMaterial({ color: col('#ed756f') }) };
  function makeRing(x, y, kind) {
    const r = new T.Mesh(ringGeo, ringMat[kind]);
    r.rotation.x = -Math.PI / 2; r.position.set(wx(x), .03, wx(y));
    r.scale.setScalar(.001); r.userData = { s: .001, on: false, kind };
    tilt.add(r); return r;
  }

  const pickPlane = new T.Mesh(new T.PlaneGeometry(BW, BW), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  pickPlane.rotation.x = -Math.PI / 2; pickPlane.position.y = .01; tilt.add(pickPlane);
  const ghost = makeStone('black'); fadeable(ghost).opacity = .38; ghost.castShadow = false;
  ghost.position.y = REST; ghost.visible = false; tilt.add(ghost);

  /* ── Zamanlayıcılar ── */
  let tweens = [], t = 0, dirty = true;
  function tween(dur, fn, done) { tweens.push({ t: 0, dur, fn, done }); }
  const wait = (dur, fn) => tween(dur, () => {}, fn);

  /* ── Kamera ── */
  let zoom = 0, shownZoom = -1, w = 1, h = 1;
  function applyCamera() {
    const k = easeInOut(zoom), a = VIEW.lesson, b = VIEW.play;
    const pitch = lerp(a.pitch, b.pitch, k), half = lerp(a.half, b.half, k), pad = 1.08;
    const v = T.MathUtils.degToRad(cam.fov) / 2, hz = Math.atan(Math.tan(v) * cam.aspect);
    const dW = half * pad / Math.tan(hz) + half * Math.cos(pitch) * .6;
    const dH = (half * Math.sin(pitch) + .35) * pad / Math.tan(v) + half * Math.cos(pitch);
    const d = Math.max(dW, dH);
    const target = new T.Vector3(lerp(a.tx, b.tx, k), lerp(a.ty, b.ty, k), lerp(a.tz, b.tz, k));
    cam.position.set(target.x, target.y + d * Math.sin(pitch), target.z + d * Math.cos(pitch));
    cam.lookAt(target);
    shownZoom = zoom;
  }
  function zoomTo(z, dur, done) { const z0 = zoom; tween(dur, p => { zoom = lerp(z0, z, p); }, done); }
  new ResizeObserver(() => {
    const r = stageEl.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    applyCamera(); renderer.render(scene, cam);
  }).observe(stageEl);

  /* ── Fare: tahta hafifçe eğilir ── */
  const pointer = { x: 0, y: 0, active: false };
  root.addEventListener('pointermove', ev => {
    const r = root.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = ((ev.clientY - r.top) / r.height) * 2 - 1;
    pointer.active = ev.pointerType !== 'touch';
  });
  root.addEventListener('pointerleave', () => { pointer.active = false; });

  /* ── Panel ── */
  let mode = 'lesson', phase = 0, busy = false;
  function setBusy(v) { busy = v; stepBtn.disabled = v; altBtn.disabled = v; }
  function say(text) {
    caption.textContent = text;
    caption.classList.remove('is-new'); void caption.offsetWidth; caption.classList.add('is-new');
  }
  function sync() {
    root.dataset.heroMode = mode;
    root.dataset.heroPhase = String(phase);
    root.dataset.heroStones = String(state.stones.length);
  }
  function showLesson(i) {
    say(LESSON[i].cap);
    stepBtn.textContent = LESSON[i].btn;
    altBtn.textContent = 'Serbest oyna';
    altBtn.hidden = i === LESSON.length - 1;
    dotsEl.hidden = false;
    dots.forEach((d, k) => d.classList.toggle('on', k <= i));
    sync();
  }
  function showFree(text) {
    say(text);
    stepBtn.textContent = 'Tahtayı temizle';
    altBtn.textContent = 'Mini dersi baştan izle';
    altBtn.hidden = false;
    dotsEl.hidden = true;
    sync();
  }

  /* ── Mini ders: ilk taş ── */
  const C = (N - 1) / 2;
  const LIBS = [[C, C - 1], [C + 1, C], [C, C + 1], [C - 1, C]];
  const lessonStone = makeStone('black');
  lessonStone.position.set(0, 3.4, 0); tilt.add(lessonStone);
  const lessonRings = LIBS.map(([x, y]) => makeRing(x, y, 'gold'));
  let whites = [], hovering = true;

  function ringTo(r, s, d, done) {
    const s0 = r.userData.s; r.userData.on = true;
    tween(d || .3, p => { r.userData.s = lerp(s0, s, easeOut(p)); r.scale.setScalar(r.userData.s); }, () => {
      if (s < .01) r.userData.on = false;
      if (done) done();
    });
  }
  const dropRing = r => ringTo(r, .001, .25, () => tilt.remove(r));
  function dropWhite(i, delay, done) {
    wait(delay, () => {
      const [x, y] = LIBS[i], m = makeStone('white');
      m.position.set(wx(x), 2.6, wx(y)); tilt.add(m); whites.push(m);
      tween(.5, p => { m.position.y = fall(p, 2.6, REST); }, () => { ringTo(lessonRings[i], .001, .2); if (done) done(); });
    });
  }
  function nextLesson() {
    if (busy) return;
    setBusy(true);
    const finish = () => setBusy(false);
    if (phase === 0) {
      hovering = false; const y0 = lessonStone.position.y; lessonStone.rotation.z = 0;
      tween(.55, p => { lessonStone.position.y = fall(p, y0, REST); }, () => {
        lessonRings.forEach((r, i) => wait(.15 + i * .16, () => ringTo(r, 1)));
        wait(.9, () => { phase = 1; showLesson(1); finish(); });
      });
    } else if (phase === 1) {
      dropWhite(0, 0); dropWhite(1, .35); dropWhite(2, .7, () => {
        lessonRings[3].material = ringMat.red; lessonRings[3].userData.kind = 'red';
        wait(.3, () => { phase = 2; showLesson(2); finish(); });
      });
    } else if (phase === 2) {
      dropWhite(3, 0, () => {
        const mat = fadeable(lessonStone);
        tween(.7, p => { lessonStone.position.y = REST + easeOut(p) * 1.3; mat.opacity = 1 - p; }, () => {
          lessonStone.visible = false; phase = 3; showLesson(3); finish();
        });
      });
    } else {
      toFree();
    }
  }
  function clearLesson() {
    whites.forEach(m => { const mat = fadeable(m); tween(.4, p => { mat.opacity = 1 - p; }, () => { tilt.remove(m); mat.dispose(); }); });
    whites = [];
    lessonRings.forEach(r => { if (r.userData.on) ringTo(r, .001, .25); });
    if (lessonStone.visible && !hovering && phase < 3) {
      const mat = fadeable(lessonStone);
      tween(.4, p => { mat.opacity = 1 - p; }, () => { lessonStone.visible = false; });
    } else if (hovering) {
      const y0 = lessonStone.position.y, mat = fadeable(lessonStone);
      hovering = false;
      tween(.4, p => { lessonStone.position.y = y0 + p; mat.opacity = 1 - p; }, () => { lessonStone.visible = false; });
    }
  }
  function startLesson() {
    lessonRings.forEach(r => {
      r.material = ringMat.gold; r.userData.kind = 'gold';
      r.userData.s = .001; r.scale.setScalar(.001); r.userData.on = false;
    });
    lessonStone.material = stoneMat.black; lessonStone.visible = true;
    lessonStone.position.y = 3.4; lessonStone.rotation.z = 0;
    phase = 0; mode = 'lesson';
    tween(.7, p => { lessonStone.position.y = lerp(3.4, 2.3, easeOut(p)); }, () => { hovering = true; });
    showLesson(0);
  }

  /* ── Serbest oyun ── */
  let state = new BoardState(N), meshes = new Map(), atari = new Map(), caps = { black: 0, white: 0 };
  function drop(color, x, y, from, dur) {
    const m = makeStone(color); m.position.set(wx(x), from, wx(y)); tilt.add(m); meshes.set(key(x, y), m);
    tween(dur, p => { m.position.y = fall(p, from, REST); });
  }
  function lift(k) {
    const m = meshes.get(k); if (!m) return; meshes.delete(k);
    const mat = fadeable(m), y0 = m.position.y;
    tween(.55, p => { m.position.y = y0 + easeOut(p) * 1.2; mat.opacity = 1 - p; }, () => { tilt.remove(m); mat.dispose(); });
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
    for (const [k, r] of atari) {
      if (want.get(k) === r.userData.kind) continue;
      atari.delete(k);
      dropRing(r);
    }
    for (const [k, kind] of want) {
      if (atari.has(k)) continue;
      const [x, y] = k.split(',').map(Number), r = makeRing(x, y, kind);
      atari.set(k, r); ringTo(r, 1, .3);
    }
    const kinds = [...want.values()];
    return { danger: kinds.filter(v => v === 'red').length, chance: kinds.filter(v => v === 'gold').length };
  }
  function clearFree() {
    [...meshes.keys()].forEach(lift);
    for (const r of atari.values()) dropRing(r);
    atari.clear();
    state = new BoardState(N); caps = { black: 0, white: 0 };
  }
  function toFree() {
    setBusy(true);
    clearLesson();
    zoomTo(1, 1.1, () => {
      mode = 'free'; phase = 0;
      showFree('Sıra sende: bir noktaya dokun, siyah taş koy. Beyaz cevap verecek.');
      setBusy(false);
    });
  }
  function restartLesson() {
    setBusy(true);
    ghost.visible = false;
    clearFree();
    zoomTo(0, 1.1, () => { startLesson(); setBusy(false); });
  }
  function clearBoard() {
    setBusy(true);
    clearFree();
    wait(.6, () => { showFree('Tahta temiz. Sıra sende: bir noktaya dokun, siyah taş koy.'); setBusy(false); });
  }
  function apply(color, x, y, r) {
    state = r.newState;
    drop(color, x, y, 2.4, .45);
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
    const r = applyMove(state, q.x, q.y, 'black');
    apply('black', q.x, q.y, r);
    say(r.captured.length ? `${r.captured.length} beyaz taş aldın! Beyaz düşünüyor…` : 'Beyaz düşünüyor…');
    wait(.5, () => updateAtari());
    wait(.8, () => {
      const m = whiteMove(state);
      if (!m) { say('Beyazın oynayacak yeri kalmadı. Tahtayı temizleyebilirsin.'); setBusy(false); sync(); return; }
      apply('white', m.x, m.y, m.r);
      wait(.5, () => {
        const a = updateAtari();
        setBusy(false); sync();
        if (m.r.captured.length) say(`Beyaz ${m.r.captured.length} taş aldı. Sıra sende.`);
        else if (a.danger) say('Kırmızı halka: taşlarının tek nefesi kaldı, buna atari denir. Sıra sende.');
        else if (a.chance) say('Altın halka: beyazın tek nefesi kaldı. Oraya oynarsan taşı alırsın.');
        else say(`Esir: sen ${caps.black}, beyaz ${caps.white}. Sıra sende.`);
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
    const p = tilt.worldToLocal(hit.point.clone());
    const x = Math.round(p.x + C), y = Math.round(p.z + C);
    return state.isInBounds(x, y) ? { x, y } : null;
  }
  canvas.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;
    const q = mode === 'free' && !busy ? pick(ev) : null;
    const show = !!q && state.isEmpty(q.x, q.y);
    if (show) ghost.position.set(wx(q.x), REST, wx(q.y));
    if (show !== ghost.visible || show) dirty = true;
    ghost.visible = show;
    canvas.style.cursor = mode === 'lesson' || show ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { ghost.visible = false; dirty = true; });
  canvas.addEventListener('click', ev => {
    if (mode === 'lesson') { nextLesson(); return; }
    if (busy) return;
    const q = pick(ev); if (q) playAt(q);
  });
  stepBtn.addEventListener('click', () => { if (busy) return; mode === 'lesson' ? nextLesson() : clearBoard(); });
  altBtn.addEventListener('click', () => { if (busy) return; mode === 'lesson' ? toFree() : restartLesson(); });
  canvas.style.cursor = 'pointer';

  /* ── Döngü: yalnız görünürken çalışır ── */
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
    const sway = !lite && !pointer.active;
    const rx = pointer.active ? pointer.y * .07 : sway ? Math.sin(t * .4) * .02 : 0;
    const rz = pointer.active ? -pointer.x * .07 : sway ? Math.sin(t * .3) * .02 : 0;
    const settled = Math.abs(tilt.rotation.x - rx) < 1e-4 && Math.abs(tilt.rotation.z - rz) < 1e-4;
    tilt.rotation.x = lerp(tilt.rotation.x, rx, .08);
    tilt.rotation.z = lerp(tilt.rotation.z, rz, .08);
    if (hovering) {
      lessonStone.position.y = 2.3 + Math.sin(t * 1.7) * .14;
      lessonStone.rotation.z = Math.sin(t * .9) * .12;
    }
    let pulsing = false;
    for (const r of [...lessonRings, ...atari.values()]) {
      if (!r.userData.on) continue;
      pulsing = true;
      const s = r.userData.s * (1 + Math.sin(t * (r.userData.kind === 'red' ? 6 : 2.6) + r.position.x) * .09);
      r.scale.setScalar(s);
    }
    if (zoom !== shownZoom) applyCamera();
    if (dirty || tweens.length || hovering || pulsing || sway || !settled) {
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

  // Canlıya geç: panel açılır, tahta resmin üstünde belirir.
  panel.hidden = false;
  startLesson();
  requestAnimationFrame(() => { root.classList.add('is-live'); });
}
