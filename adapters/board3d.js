/**
 * adapters/board3d.js
 *
 * Ders tahtasının 3D katmanı (deneme: learning-scenes.html?tahta=3d).
 * Tahta ve taşlar Blender'da üretilen GLB'lerden (scripts/board/
 * build-lesson-boards.py) Three.js ile çizilir; tahta yüzeyindeki işaretler
 * (nefes, yasak, ko, bölge, imleç, önizleme halkası) de burada, tahtaya
 * yapışık katmanlar olarak çizilir: taşlar onları örter. Harfler, son hamle
 * halkası ve tüm girdi sceneBoardAdapter.js'in 2D tuvalinde kalır. Bu katman
 * yalnız çizer: durum, kamera, taş ve işaret listesi her karede adaptörden gelir.
 *
 * Kamera adaptörün projectAt() izdüşümünün birebir aynısıdır: dünya noktası
 * önce yaw, sonra pitch ile döner; göz döndürülmüş uzayda 700 birim geride,
 * odak uzaklığı 700 * dist / 500 piksel, izdüşüm merkezi (W/2, projCY).
 * Böylece 3D taş, 2D işaret ve tıklama noktası aynı piksele düşer.
 *
 * Eksenler: adaptör dünyası (x sütun, y aşağı, z satır) → Three.js
 * (X, Y, Z) = (x, -y, -z), yani x ekseni etrafında 180° dönüş.
 */
const THREE_DIR = new URL('../vendor/three-r169/', import.meta.url).href;
const RELEASE = new URL(import.meta.url).searchParams.get('v');
const asset = name => new URL('../assets/board/' + name, import.meta.url).href + (RELEASE ? '?v=' + RELEASE : '');

const EYE = 700;          // adaptörün projectAt() sabiti (fov)
const MARGIN = 0.82;      // kenar payı, çizgi aralığı cinsinden (drawBoard: bw = HALF + CELL * .82)
const SIZES = [5, 9, 13, 19];

/* Işık ve renk ayarı: Blender'daki referans çizime göre (bkz. scripts/board/
   render-reference.py). Ton eşleme Blender'ınkiyle aynı (AgX); ahşap,
   referansla sitenin önceki altın sarısı arasında bir ara tonda tutulur
   (referansa birebir: exposure 0.92, wood [1, .65, .31]). */
const LOOK = {
  toneMapping: 'AgXToneMapping', exposure: 1.12,
  wood: [1.0, 0.74, 0.40],   // GLB ahşap rengi bununla çarpılır
  woodCoat: 0.04,
  envIntensity: 0.15,
  sun: 3.2, sunColor: [1.0, 0.82, 0.62], sunElevation: 0.87,
  fill: 0.35, fillColor: [0.62, 0.70, 1.0],
  blackEnv: 0.05, blackCoat: 0.15,
  whiteColor: [1.0, 0.99, 0.96], whiteGlow: 0.32,  // AgX beyazı griye çeker; taş hafifçe kendi ışığıyla açılır
};

/* ── İşaret dokuları ─────────────────────────────────────────────────────
   Her işaret 256 px'lik bir dokuya bir kez çizilir. Açık ahşapta okunması
   için renkli çizginin altında koyu, yumuşak bir kontur vardır; rengin
   çevresinde hafif bir parıltı. `span`: dokunun kapsadığı genişlik
   (çizgi aralığı cinsinden). */
const TEAL = ['#0f9f91', 'rgba(91,210,195,.85)'];
const RED = ['#d4421c', 'rgba(255,128,84,.8)'];
const GREEN = ['#16a35a', 'rgba(62,207,128,.85)'];
const MARKS = {
  liberty: { span: 0.9, draw: (g, u) => { pool(g, u, 0.42, 'rgba(60,200,185,.30)'); cross(g, u, 0.22, TEAL); dot(g, u, 0.07, TEAL); } },
  hint: { span: 0.9, draw: (g, u) => { pool(g, u, 0.42, 'rgba(240,110,60,.26)'); cross(g, u, 0.20, RED); dot(g, u, 0.065, RED); } },
  illegal: { span: 0.9, draw: (g, u) => { ring(g, u, 0.26, RED, 0.06); xmark(g, u, 0.16, RED); } },
  ko: { span: 0.9, draw: (g, u) => { ring(g, u, 0.26, GREEN, 0.06); check(g, u, GREEN); } },
  hover: { span: 0.9, draw: (g, u) => { pool(g, u, 0.34, 'rgba(60,200,185,.22)'); ring(g, u, 0.15, TEAL, 0.045); } },
  preview: { span: 1.3, draw: (g, u) => { ring(g, u, 0.5, TEAL, 0.05); } },
  touch: { span: 1.5, draw: (g, u) => { ring(g, u, 0.6, ['#f4efe6', 'rgba(255,255,255,.6)'], 0.06); } },
  contact: { span: 1.0, draw: (g, u) => { pool(g, u, 0.5, 'rgba(0,0,0,.62)'); } },
};

function stroke(g, u, [core, glow], width, path) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.save(); g.strokeStyle = 'rgba(28,18,8,.34)'; g.lineWidth = width * u + 6; g.filter = 'blur(2px)'; path(); g.stroke(); g.restore();
  g.save(); g.strokeStyle = core; g.lineWidth = width * u; g.shadowColor = glow; g.shadowBlur = 14; path(); g.stroke(); g.restore();
}
function cross(g, u, arm, c) {
  stroke(g, u, c, 0.055, () => { g.beginPath(); g.moveTo(-arm * u, 0); g.lineTo(arm * u, 0); g.moveTo(0, -arm * u); g.lineTo(0, arm * u); });
}
function xmark(g, u, arm, c) {
  stroke(g, u, c, 0.055, () => { g.beginPath(); g.moveTo(-arm * u, -arm * u); g.lineTo(arm * u, arm * u); g.moveTo(arm * u, -arm * u); g.lineTo(-arm * u, arm * u); });
}
function ring(g, u, r, c, w) {
  stroke(g, u, c, w, () => { g.beginPath(); g.arc(0, 0, r * u, 0, Math.PI * 2); });
}
function check(g, u, c) {
  stroke(g, u, c, 0.055, () => { g.beginPath(); g.moveTo(-0.11 * u, 0.02 * u); g.lineTo(-0.02 * u, 0.11 * u); g.lineTo(0.13 * u, -0.1 * u); });
}
function dot(g, u, r, [core]) {
  g.save(); g.fillStyle = 'rgba(28,18,8,.4)'; g.beginPath(); g.arc(0, 0, r * u + 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, r * u, 0, Math.PI * 2); g.fill(); g.restore();
}
function pool(g, u, r, color) {
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r * u);
  grad.addColorStop(0, color); grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, r * u, 0, Math.PI * 2); g.fill();
}

/**
 * @param {HTMLCanvasElement} canvas2d  adaptörün tuvali; 3D tuval hemen arkasına eklenir
 * @param {{lite?: boolean, onReady?: () => void}} [options]
 * @returns {Promise<object|null>} WebGL yoksa null (adaptör 2D çizime devam eder)
 */
export async function createBoard3D(canvas2d, { lite = false, onReady = () => {} } = {}) {
  const [T, { GLTFLoader }, { RoomEnvironment }] = await Promise.all([
    import(THREE_DIR + 'three.module.min.js'),
    import(THREE_DIR + 'addons/GLTFLoader.js'),
    import(THREE_DIR + 'addons/RoomEnvironment.js'),
  ]);

  const canvas = document.createElement('canvas');
  canvas.className = 'ls-canvas-3d';
  canvas.setAttribute('aria-hidden', 'true');
  canvas2d.parentElement.insertBefore(canvas, canvas2d);
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    canvas.remove();
    return null;
  }
  let lost = false;
  canvas.addEventListener('webglcontextlost', () => { lost = true; onReady(); });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = T[LOOK.toneMapping];
  renderer.toneMappingExposure = LOOK.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lite ? T.PCFShadowMap : T.PCFSoftShadowMap;
  const lin = ([r, g, b]) => new T.Color().setRGB(r, g, b, T.LinearSRGBColorSpace);

  /* ── Sahne ve ışık (Blender referans çiziminden) ── */
  const scene = new T.Scene();
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = LOOK.envIntensity;
  pmrem.dispose();

  const sun = new T.DirectionalLight(lin(LOOK.sunColor), LOOK.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.4;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(lin(LOOK.fillColor), LOOK.fill);
  scene.add(fill);

  // Tahtanın masaya düşen gölgesi: yalnız gölgeyi çizen görünmez zemin.
  const floor = new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const camera = new T.PerspectiveCamera();
  camera.matrixAutoUpdate = false;
  camera.matrixWorldAutoUpdate = false;

  /* ── Tahtalar: boyut başına bir GLB, gerektiğinde yüklenir ── */
  const loader = new GLTFLoader();
  const boards = new Map();      // n → {group, thick} | 'loading' | 'failed'
  let proto = null;              // {black, white}: taş örnekleri (ilk yüklenen GLB'den)
  function request(n) {
    if (boards.has(n) || !SIZES.includes(n)) return;
    boards.set(n, 'loading');
    loader.loadAsync(asset(`ders-${n}${lite ? '-hafif' : ''}.glb`)).then(gltf => {
      const group = gltf.scene;
      // İki malzemeli tahta GLB'de bir grup olarak gelir (üst yüz + yanlar).
      const mesh = group.getObjectByName('Tahta');
      // Ahşap, ana sayfa gobanının sıcak kaya tonuna çekilir.
      mesh.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        o.material.color.setRGB(...LOOK.wood);
        // Yüksek güneşte cila yansıması tahtanın bir köşesini beyazlatıp çizgileri siliyordu.
        o.material.clearcoat = LOOK.woodCoat;
      });
      const box = new T.Box3().setFromObject(mesh);
      const black = group.getObjectByName('TasSiyah');
      const white = group.getObjectByName('TasBeyaz');
      black.removeFromParent();
      white.removeFromParent();
      // Stüdyo ortamının beyaz yansıması siyah taşı griye çekmesin.
      black.material.envMapIntensity = LOOK.blackEnv;
      black.material.clearcoat = LOOK.blackCoat;
      white.material.color.setRGB(...LOOK.whiteColor);
      white.material.emissive.setRGB(LOOK.whiteGlow, LOOK.whiteGlow, LOOK.whiteGlow * 0.97);
      if (!proto) proto = { black, white };
      group.visible = false;
      scene.add(group);
      boards.set(n, { group, thick: -box.min.y });
      onReady();
    }, () => { boards.set(n, 'failed'); });
  }

  /* ── Taş havuzu: renk başına, kare başına yeniden kullanılır ── */
  const pools = { black: [], white: [] };
  const stoneGroup = new T.Group();
  scene.add(stoneGroup);
  function stoneAt(color, i) {
    const pool = pools[color];
    if (!pool[i]) {
      const m = proto[color].clone();
      m.material = m.material.clone();
      m.castShadow = true;
      m.receiveShadow = true;
      m.rotation.set(0, (i * 2.399963) % (Math.PI * 2), 0);   // altın açı: komşu taşların parlaması farklı düşer
      stoneGroup.add(m);
      pool[i] = m;
    }
    return pool[i];
  }

  /* ── Tahta yüzeyi işaretleri: tür başına doku, örnek başına malzeme ── */
  const markTex = {};
  for (const [kind, spec] of Object.entries(MARKS)) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.translate(128, 128);
    spec.draw(g, 256 / spec.span);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    markTex[kind] = tex;
  }
  const flat = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const markGroup = new T.Group();
  scene.add(markGroup);
  const markPools = {};
  function markAt(kind, i) {
    const pool = markPools[kind] || (markPools[kind] = []);
    if (!pool[i]) {
      const m = new T.Mesh(flat, new T.MeshBasicMaterial({
        map: markTex[kind], transparent: true, depthWrite: false, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      // Temas gölgesi taşlardan önce, öteki işaretler taşlardan ve hayalet taştan önce çizilir.
      m.renderOrder = kind === 'contact' ? -1 : 0;
      markGroup.add(m);
      pool[i] = m;
    }
    return pool[i];
  }
  // Sayım bölgesi: elmas duruşlu küçük düz pullar (gerçek sayımdaki işaret pulları gibi).
  const chipGeo = new T.BoxGeometry(1, 1, 1);
  const chipMat = {
    'region-black': new T.MeshStandardMaterial({ color: lin([0.03, 0.035, 0.045]), roughness: 0.45 }),
    'region-white': new T.MeshStandardMaterial({ color: lin([0.92, 0.90, 0.86]), roughness: 0.5 }),
  };
  const chipPools = { 'region-black': [], 'region-white': [] };
  function chipAt(kind, i) {
    const pool = chipPools[kind];
    if (!pool[i]) {
      const m = new T.Mesh(chipGeo, chipMat[kind].clone());
      m.castShadow = true;
      m.receiveShadow = true;
      m.rotation.y = Math.PI / 4;
      markGroup.add(m);
      pool[i] = m;
    }
    return pool[i];
  }

  const view = new T.Matrix4();
  const proj = new T.Matrix4();
  let current = null;            // en son çizilen boyut
  let last = { stones: 0, marks: {}, cam: null };

  return {
    /** `n` boyutlu tahta yüklendi mi (değilse yüklemeyi başlatır). */
    ready(n) {
      if (lost) return false;
      request(n);
      const b = boards.get(n);
      return !!(b && typeof b === 'object' && proto);
    },

    resize(W, H, dpr) {
      renderer.setPixelRatio(Math.min(dpr, lite ? 1.5 : 2));
      renderer.setSize(W, H, false);
    },

    /**
     * @param {{W:number,H:number,projCY:number,yaw:number,pitch:number,dist:number,
     *   size:number,cell:number,half:number,boardH:number,stoneR:number,
     *   light:{x:number,z:number},
     *   stones:Array<{gx:number,gz:number,color:string,scale:number,alpha:number,lift:number,dx:number,dz:number,ghost?:boolean}>,
     *   marks?:Array<{kind:string,gx:number,gz:number,a:number}>}} f
     */
    frame(f) {
      const b = boards.get(f.size);
      if (!b || typeof b !== 'object' || !proto) return;
      if (current !== f.size) {
        for (const [n, other] of boards) if (typeof other === 'object') other.group.visible = n === f.size;
        current = f.size;
      }

      // Tahta: model genişliği 1, üst yüzü y = 0.
      const top = f.boardH / 2;
      const width = 2 * (f.half + f.cell * MARGIN);
      b.group.scale.setScalar(width);
      b.group.position.set(0, top, 0);
      floor.scale.setScalar(width * 4);
      floor.position.y = top - b.thick * width - 0.5;

      // Işık adaptörün ışık yönünden (LIGHT_X, LIGHT_Z) gelir.
      const el = LOOK.sunElevation, far = width * 2.6;
      sun.position.set(f.light.x * Math.cos(el) * far, Math.sin(el) * far, -f.light.z * Math.cos(el) * far);
      Object.assign(sun.shadow.camera, { left: -width * 0.75, right: width * 0.75, top: width * 0.75, bottom: -width * 0.75, near: far * 0.4, far: far * 1.8 });
      sun.shadow.camera.updateProjectionMatrix();
      fill.position.set(-f.light.x * far, far * 0.6, f.light.z * far);

      const X = (gx, dx = 0) => -f.half + gx * f.cell + dx;
      const Z = (gz, dz = 0) => f.half - gz * f.cell - dz;
      const used = { black: 0, white: 0 };
      const usedMarks = {};
      const place = (kind, gx, gz, a, scale, dx = 0, dz = 0, y = 0.15) => {
        const i = usedMarks[kind] = (usedMarks[kind] || 0) + 1;
        const m = markAt(kind, i - 1);
        m.visible = a > 0.01;
        m.material.opacity = Math.min(1, a);
        m.scale.set(scale, 1, scale);
        m.position.set(X(gx, dx), top + y, Z(gz, dz));
      };

      // Taşlar ve temas gölgeleri
      for (const s of f.stones) {
        const color = s.color === 'black' ? 'black' : 'white';
        const p = proto[color];
        const m = stoneAt(color, used[color]++);
        const k = f.stoneR / p.userData.stoneRadius * s.scale;
        const h = p.userData.stoneHeight * k;
        m.visible = s.scale > 0.01 && s.alpha > 0.01;
        m.scale.setScalar(k);
        m.position.set(X(s.gx, s.dx), top + h / 2 + s.lift, Z(s.gz, s.dz));
        const translucent = s.alpha < 1;
        m.material.transparent = translucent;
        m.material.opacity = s.alpha;
        m.material.depthWrite = !translucent;
        m.castShadow = !translucent;
        m.renderOrder = s.ghost ? 1 : 0;
        if (!s.ghost && s.alpha > 0.5) {
          // Taşın altına, ışığın tersine hafif kaymış yumuşak temas gölgesi.
          const rise = Math.min(1, s.lift / (f.stoneR * 2));
          place('contact', s.gx, s.gz, s.alpha * (1 - rise) * 0.9, f.stoneR * 2.3 * s.scale * (1 + rise * 0.4),
            s.dx - f.light.x * f.stoneR * 0.12, s.dz - f.light.z * f.stoneR * 0.12, 0.05);
        }
      }
      for (const color of ['black', 'white']) {
        for (let i = used[color]; i < pools[color].length; i++) pools[color][i].visible = false;
      }

      // Tahta yüzeyi işaretleri
      const usedChips = { 'region-black': 0, 'region-white': 0 };
      for (const mk of f.marks || []) {
        if (chipPools[mk.kind]) {
          const c = chipAt(mk.kind, usedChips[mk.kind]++);
          const side = f.cell * 0.3, tall = Math.max(1, f.cell * 0.035);
          c.visible = mk.a > 0.01;
          c.scale.set(side, tall, side);
          c.position.set(X(mk.gx), top + tall / 2, Z(mk.gz));
          c.material.transparent = mk.a < 1;
          c.material.opacity = mk.a;
          continue;
        }
        if (!MARKS[mk.kind]) continue;
        place(mk.kind, mk.gx, mk.gz, mk.a, f.cell * MARKS[mk.kind].span);
      }
      for (const [kind, pool] of Object.entries(markPools)) {
        for (let i = usedMarks[kind] || 0; i < pool.length; i++) pool[i].visible = false;
      }
      for (const [kind, pool] of Object.entries(chipPools)) {
        for (let i = usedChips[kind]; i < pool.length; i++) pool[i].visible = false;
      }
      const markCount = { ...usedMarks };
      for (const [kind, n] of Object.entries(usedChips)) if (n) markCount[kind] = n;
      delete markCount.contact;

      // Kamera: adaptörün izdüşümü (bkz. dosya başı).
      const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw), cp = Math.cos(f.pitch), sp = Math.sin(f.pitch);
      view.set(
        cy, 0, -sy, 0,
        -sy * sp, cp, -cy * sp, 0,
        sy * cp, sp, cy * cp, -EYE,
        0, 0, 0, 1,
      );
      camera.matrixWorldInverse.copy(view);
      camera.matrixWorld.copy(view).invert();
      camera.matrix.copy(camera.matrixWorld);
      const fpx = EYE * f.dist / 500, N = 60, F = EYE * 6;
      proj.set(
        2 * fpx / f.W, 0, 0, 0,
        0, 2 * fpx / f.H, (2 * f.projCY - f.H) / f.H, 0,
        0, 0, -(F + N) / (F - N), -2 * F * N / (F - N),
        0, 0, -1, 0,
      );
      camera.projectionMatrix.copy(proj);
      camera.projectionMatrixInverse.copy(proj).invert();
      renderer.render(scene, camera);
      last = {
        stones: used.black + used.white, marks: markCount,
        cam: { W: f.W, H: f.H, projCY: f.projCY, yaw: f.yaw, pitch: f.pitch, dist: f.dist, width, boardH: f.boardH },
      };
    },

    /** Test/gözlem: hangi boyut çiziliyor, kaç taş ve işaret var, kamera. */
    state() {
      return { size: current, stones: last.stones, marks: last.marks, cam: last.cam, lost };
    },

    destroy() {
      for (const t of Object.values(markTex)) t.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
