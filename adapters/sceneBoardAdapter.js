/**
 * adapters/sceneBoardAdapter.js
 *
 * Sahne modüllerinin gerçek 3D Go tahtasını çizmek için kullandığı TEK
 * temas noktası. `core/` DIŞINDA (canvas/DOM bilir) — `adapters/
 * teacherContentOverrides.js` ile AYNI "saf core + browser adapter"
 * ayrımı deseni.
 *
 * BİLEREK yeniden yazılmadı: izometrik projeksiyon matematiği, ahşap
 * doku üretimi, kamera lerp'i ve taş çizimi `ogren-3d.html`'in kanıtlanmış
 * 3D renderer'ından adapte edildi (aynı `project()`/`drawBoard()`/
 * `drawGrid()`/`animateCamera()` mantığı, yalnızca modül-seviyesi global
 * değişkenler yerine bu factory'nin KAPALI (closure) durumunu kullanacak
 * şekilde). Sahne modülleri SIZE/CELL/HALF/STONE_R gibi iç değişkenlere
 * ASLA doğrudan erişmez — yalnızca aşağıdaki sözleşmeyi kullanır:
 *
 *   const board = createSceneBoardAdapter(canvasEl);
 *   board.setSize(19);       // gerçek tahta boyutunu değiştirir + yeniden çizer
 *   board.reset();           // taşları temizler (bu sahnede hiç taş yok)
 *   board.focus('board19');  // adlandırılmış bir kamera preset'ine geçer
 *   board.getSize();         // 9 | 13 | 19
 *   board.destroy();         // RAF döngüsünü + resize listener'ı durdurur
 *
 * ogren-3d.html'in lesson-specific overlay'leri (liberty/marker/ghost/
 * mini-question/pedagoji vurguları) BİLEREK taşınmadı — Sahne #1'in
 * (ve öngörülebilir gelecekteki "tahtayı tanıt" sahnelerinin) ihtiyacı
 * yalnızca boş bir tahtanın doğru boyut+kamerayla çizilmesi. Büyük/riskli
 * bir tam renderer taşıması yapılmadı (bkz. görev talimatı).
 */

import { CAM } from '../core/curriculum.js';

const CAM_PRESETS = { ...CAM };

function makeWoodPattern(ctx) {
  const woodCv = document.createElement('canvas');
  woodCv.width = woodCv.height = 512;
  const wc = woodCv.getContext('2d');
  const g = wc.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, '#c8a84a'); g.addColorStop(.15, '#d4b050');
  g.addColorStop(.38, '#c2a040'); g.addColorStop(.6, '#caa848');
  g.addColorStop(.82, '#be9c3a'); g.addColorStop(1, '#c8a444');
  wc.fillStyle = g; wc.fillRect(0, 0, 512, 512);
  wc.globalAlpha = 0.055;
  for (let i = 0; i < 120; i++) {
    const y = Math.random() * 512, dk = i % 7 === 0;
    wc.strokeStyle = dk ? '#5a2e00' : '#e8d060';
    wc.lineWidth = dk ? Math.random() * 1.2 + .4 : Math.random() * .8 + .2;
    wc.beginPath(); wc.moveTo(0, y + (Math.random() - .5) * 4);
    wc.bezierCurveTo(128, y + (Math.random() - .5) * 3, 384, y + (Math.random() - .5) * 3, 512, y + (Math.random() - .5) * 4);
    wc.stroke();
  }
  wc.globalAlpha = .10;
  const vig = wc.createLinearGradient(0, 0, 512, 512);
  vig.addColorStop(0, '#3a1c00'); vig.addColorStop(.5, 'transparent'); vig.addColorStop(1, '#3a1c00');
  wc.fillStyle = vig; wc.fillRect(0, 0, 512, 512);
  wc.globalAlpha = 1;
  return ctx.createPattern(woodCv, 'repeat');
}

function easeInOutCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sizeToCell(n) { return n === 9 ? 48 : n === 13 ? 32 : 22; }

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{isMobile?: boolean, initialSize?: 9|13|19}} [options]
 * @returns {{
 *   setSize(n: 9|13|19): void,
 *   reset(): void,
 *   focus(presetName: string): void,
 *   getSize(): number,
 *   destroy(): void,
 * }}
 */
export function createSceneBoardAdapter(canvas, { isMobile = false, initialSize = 19 } = {}) {
  const ctx = canvas.getContext('2d');
  const woodPat = makeWoodPattern(ctx);

  let W = 0, H = 0, projCY = 0;
  let SIZE = initialSize, CELL = sizeToCell(initialSize), HALF = (SIZE - 1) * CELL / 2;
  const BOARD_H = 14;

  let camYaw = .50, camPitch = isMobile ? 1.25 : .88, camDist = 500;
  let camStart = null, camTarget = null, camLerpT = 1;
  const CAM_DUR = 0.65;

  function updateProjCenter() { projCY = H * 0.5; }
  function resize() {
    W = canvas.width = canvas.clientWidth || canvas.parentElement?.clientWidth || innerWidth;
    H = canvas.height = canvas.clientHeight || canvas.parentElement?.clientHeight || innerHeight;
    updateProjCenter();
  }
  resize();
  window.addEventListener('resize', resize);

  function project(x, y, z) {
    const rx = x * Math.cos(camYaw) + z * Math.sin(camYaw);
    const rz = -x * Math.sin(camYaw) + z * Math.cos(camYaw);
    const ry2 = y * Math.cos(camPitch) - rz * Math.sin(camPitch);
    const rz2 = y * Math.sin(camPitch) + rz * Math.cos(camPitch);
    const fov = 700, sc = fov / Math.max(fov + rz2, 1) * (camDist / 500);
    return { sx: W / 2 + rx * sc, sy: projCY + ry2 * sc, scale: sc, z: rz2 };
  }

  function drawFace(corners, fill, stroke) {
    const pts = corners.map(([x, y, z]) => project(x, y, z));
    ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke || fill; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawBoard() {
    const bh = BOARD_H / 2, bw = HALF + CELL * .82;
    drawFace([[-bw, -bh, -bw], [-bw, -bh, bw], [-bw, bh, bw], [-bw, bh, -bw]], '#7a4e0e', '#5e3a08');
    drawFace([[-bw, -bh, bw], [bw, -bh, bw], [bw, bh, bw], [-bw, bh, bw]], '#8a5a12', '#6a4408');
    drawFace([[bw, -bh, -bw], [bw, -bh, bw], [bw, bh, bw], [bw, bh, -bw]], '#966014', '#724808');
    const top = [[-bw, -bh, -bw], [bw, -bh, -bw], [bw, -bh, bw], [-bw, -bh, bw]];
    const tpts = top.map(([x, y, z]) => project(x, y, z));
    ctx.save(); ctx.beginPath();
    tpts.forEach((p, i) => i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy));
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = woodPat; ctx.globalAlpha = .96; ctx.fill();
    ctx.globalAlpha = .06; ctx.fillStyle = '#2a1200'; ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#6a4008'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
  }

  function drawGrid() {
    const Y = -BOARD_H / 2 - .4;
    const corners = [[-HALF, Y, -HALF], [HALF, Y, -HALF], [HALF, Y, HALF], [-HALF, Y, HALF]];
    ctx.strokeStyle = 'rgba(55,24,0,.92)'; ctx.lineWidth = 1.9;
    for (let i = 0; i < 4; i++) {
      const a = project(...corners[i]), b = project(...corners[(i + 1) % 4]);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(55,24,0,.68)'; ctx.lineWidth = .8;
    for (let i = 1; i < SIZE - 1; i++) {
      const p = -HALF + i * CELL;
      const a = project(p, Y, -HALF), b = project(p, Y, HALF);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      const c = project(-HALF, Y, p), d = project(HALF, Y, p);
      ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.stroke();
    }
    const HOSHI = SIZE === 19
      ? [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]]
      : SIZE === 13
        ? [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]]
        : [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    const hoshiR = SIZE === 9 ? 3.8 : SIZE === 13 ? 2.6 : 2.0;
    HOSHI.forEach(([sx, sz]) => {
      const p = project(-HALF + sx * CELL, Y, -HALF + sz * CELL);
      ctx.beginPath(); ctx.arc(p.sx, p.sy, hoshiR * p.scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(48,20,0,.88)'; ctx.fill();
    });
    const LTRS_ALL = 'ABCDEFGHJKLMNOPQRST';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < SIZE; i++) {
      const pos = -HALF + i * CELL;
      const lb = project(pos, Y, HALF + CELL * .72), nl = project(-HALF - CELL * .72, Y, pos);
      const fs = Math.round(9 * lb.scale); if (fs < 6) continue;
      ctx.font = `bold ${fs}px monospace`; ctx.fillStyle = 'rgba(75,36,6,.78)';
      ctx.fillText(LTRS_ALL[i], lb.sx, lb.sy); ctx.fillText(String(SIZE - i), nl.sx, nl.sy);
    }
  }

  function render() {
    const bg = ctx.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .5, Math.max(W, H) * .75);
    bg.addColorStop(0, '#141420'); bg.addColorStop(1, '#060608');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    drawBoard();
    drawGrid();
  }

  let rafId = null;
  function loop() {
    if (camLerpT < 1 && camTarget) {
      camLerpT = Math.min(1, camLerpT + (1 / 60) / CAM_DUR);
      const t = easeInOutCubic(camLerpT);
      camYaw = lerp(camStart.yaw, camTarget.yaw, t);
      camPitch = lerp(camStart.pitch, camTarget.pitch, t);
      camDist = lerp(camStart.dist, camTarget.dist, t);
    }
    render();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  return {
    setSize(n) {
      if (![9, 13, 19].includes(n)) return;
      SIZE = n; CELL = sizeToCell(n); HALF = (SIZE - 1) * CELL / 2;
    },
    reset() {
      // Bu sahnede hiç taş yok — geri getirilecek bir game-state'i şimdilik
      // yok, ama sözleşme gelecekteki sahneler için burada duruyor.
    },
    focus(presetName) {
      const preset = CAM_PRESETS[presetName] || CAM_PRESETS.overview;
      const target = isMobile ? { ...preset, yaw: .50, pitch: Math.max(preset.pitch, 1.2) } : preset;
      camStart = { yaw: camYaw, pitch: camPitch, dist: camDist };
      camTarget = { ...target };
      camLerpT = 0;
    },
    getSize() { return SIZE; },
    destroy() {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    },
  };
}
