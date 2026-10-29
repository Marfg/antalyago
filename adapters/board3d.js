/**
 * adapters/board3d.js
 *
 * Ders tahtasının 3D katmanı (deneme: learning-scenes.html?tahta=3d).
 * Tahta ve taşlar Blender'da üretilen GLB'lerden (scripts/board/
 * build-lesson-boards.py) Three.js ile çizilir; işaretler, harfler, imleç
 * ve tüm girdi sceneBoardAdapter.js'in 2D tuvalinde kalır. Bu katman yalnız
 * çizer: durum, kamera ve taş listesi her karede adaptörden gelir.
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
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lite ? T.PCFShadowMap : T.PCFSoftShadowMap;

  /* ── Sahne ve ışık (Blender karşılaştırma çiziminden) ── */
  const scene = new T.Scene();
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();

  const sun = new T.DirectionalLight(new T.Color().setRGB(1.0, 0.82, 0.62, T.LinearSRGBColorSpace), 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.4;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight(new T.Color().setRGB(0.62, 0.70, 1.0, T.LinearSRGBColorSpace), 0.35);
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
      // Ahşap, ana sayfa gobanının sıcak kaya tonuna çekilir (orada bu tonu
      // alçak açılı turuncu güneş verir; ders ışığı daha yüksek ve beyaz).
      mesh.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        o.material.color.setRGB(1.0, 0.78, 0.48);
        // Yüksek güneşte cila yansıması tahtanın bir köşesini beyazlatıp çizgileri siliyordu.
        o.material.clearcoat = 0.04;
      });
      const box = new T.Box3().setFromObject(mesh);
      const black = group.getObjectByName('TasSiyah');
      const white = group.getObjectByName('TasBeyaz');
      black.removeFromParent();
      white.removeFromParent();
      // Stüdyo ortamının beyaz yansıması siyah taşı griye çekmesin.
      black.material.envMapIntensity = 0.2;
      black.material.clearcoat = 0.2;
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

  const view = new T.Matrix4();
  const proj = new T.Matrix4();
  let current = null;            // en son çizilen boyut
  let lastStones = 0;

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
     *   stones:Array<{gx:number,gz:number,color:string,scale:number,alpha:number,lift:number,dx:number,dz:number}>}} f
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

      // Işık adaptörün ışık yönünden (LIGHT_X, LIGHT_Z), ~50° yükseklikten gelir.
      const el = 0.87, far = width * 2.6;
      sun.position.set(f.light.x * Math.cos(el) * far, Math.sin(el) * far, -f.light.z * Math.cos(el) * far);
      Object.assign(sun.shadow.camera, { left: -width * 0.75, right: width * 0.75, top: width * 0.75, bottom: -width * 0.75, near: far * 0.4, far: far * 1.8 });
      sun.shadow.camera.updateProjectionMatrix();
      fill.position.set(-f.light.x * far, far * 0.6, f.light.z * far);

      // Taşlar
      const used = { black: 0, white: 0 };
      for (const s of f.stones) {
        const color = s.color === 'black' ? 'black' : 'white';
        const p = proto[color];
        const m = stoneAt(color, used[color]++);
        const k = f.stoneR / p.userData.stoneRadius * s.scale;
        const h = p.userData.stoneHeight * k;
        m.visible = s.scale > 0.01 && s.alpha > 0.01;
        m.scale.setScalar(k);
        m.position.set(-f.half + s.gx * f.cell + s.dx, top + h / 2 + s.lift, f.half - s.gz * f.cell - s.dz);
        const translucent = s.alpha < 1;
        m.material.transparent = translucent;
        m.material.opacity = s.alpha;
        m.material.depthWrite = !translucent;
        m.castShadow = !translucent;
      }
      for (const color of ['black', 'white']) {
        for (let i = used[color]; i < pools[color].length; i++) pools[color][i].visible = false;
      }
      lastStones = used.black + used.white;

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
    },

    /** Test/gözlem: hangi boyut çiziliyor, kaç taş var. */
    state() {
      return { size: current, stones: lastStones, lost };
    },

    destroy() {
      renderer.dispose();
      canvas.remove();
    },
  };
}
