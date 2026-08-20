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
 * `drawGrid()`/`drawStone()`/`animateCamera()`/`screenToGrid()` mantığı,
 * yalnızca modül-seviyesi global değişkenler yerine bu factory'nin KAPALI
 * (closure) durumunu kullanacak şekilde). Sahne modülleri SIZE/CELL/HALF/
 * STONE_R gibi iç değişkenlere veya canvas koordinat dönüşümüne ASLA
 * doğrudan erişmez — yalnızca aşağıdaki sözleşmeyi kullanır:
 *
 *   const board = createSceneBoardAdapter(canvasEl);
 *   board.setSize(19);                 // gerçek tahta boyutunu değiştirir + yeniden çizer
 *   board.reset();                     // taşları/rehberleri temizler, deterministik BoardState'i sıfırlar
 *   board.focus('board19');            // adlandırılmış bir kamera preset'ine geçer
 *   board.getSize();                   // 9 | 13 | 19
 *   board.isLegalMove({row,col,color});// core/ruleEngine.js ÜZERİNDEN gerçek yasallık
 *   board.playMove({row,col,color});   // yasalsa gerçek BoardState + görsel taşı günceller
 *   board.getEmptyIntersections();     // [{row,col}] — o an boş noktalar
 *   board.setIntersectionGuides(pts);  // küçük yeşil noktaları çizer
 *   board.clearIntersectionGuides();
 *   board.setInputEnabled(bool);       // false iken onIntersectionTap ASLA tetiklenmez
 *   const off = board.onIntersectionTap(({row,col}) => {...}); // off() ile abone iptali
 *   board.destroy();                   // RAF/resize/click listener'ı + tüm durumu temizler
 *
 * ogren-3d.html'in lesson-specific overlay'leri (liberty/marker/ghost/
 * mini-question/pedagoji vurguları) BİLEREK taşınmadı — yalnız Sahne
 * #1/#2'nin ihtiyacı olan asgari, genel amaçlı çizim ilkelleri (boş
 * tahta, taş, kesişim rehberi) eklendi. Büyük/riskli bir tam renderer
 * taşıması yapılmadı (bkz. görev talimatı).
 */

import { CAM } from '../core/curriculum.js';
import { BoardState } from '../core/boardState.js';
import { isValidMove, applyMove } from '../core/ruleEngine.js';

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
 * @returns {object} bkz. dosya başı sözleşme listesi
 */
export function createSceneBoardAdapter(canvas, { isMobile = false, initialSize = 19 } = {}) {
  const ctx = canvas.getContext('2d');
  const woodPat = makeWoodPattern(ctx);

  let W = 0, H = 0, projCY = 0;
  let SIZE = initialSize, CELL = sizeToCell(initialSize), HALF = (SIZE - 1) * CELL / 2;
  const BOARD_H = 14;
  const ASPECT_3D = 0.36;
  let STONE_R = CELL * (20 / 48);

  // Deterministik hamle/yasallık için GERÇEK BoardState — Sahne #2'nin
  // "playMove/isLegalMove" ihtiyacı BURADA, core/ruleEngine.js üzerinden
  // karşılanır. Sahne modülü bu nesneye asla doğrudan erişmez.
  let boardSt = new BoardState(SIZE);
  // Görsel taş listesi — [{gx,gz,color,t,removing:false}] (basit giriş
  // animasyonu için `t` 0→1 ilerler; ogren-3d.html'deki particle/ghost
  // sistemleri BİLEREK taşınmadı, yalnız sade bir ölçek-içi geçiş var).
  let visualStones = [];
  let guidePoints = []; // [{gx,gz}]
  let inputEnabled = false;
  const tapHandlers = new Set();
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

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

  function stoneRadii(p, mul) {
    mul = mul || 1;
    const rx = STONE_R * p.scale * mul;
    const sp = Math.sin(camPitch), cp = Math.cos(camPitch);
    return { rx, ry: rx * Math.sqrt(sp * sp + ASPECT_3D * ASPECT_3D * cp * cp) };
  }

  /** Taş yüzeyinin oturduğu dünya-Y (board üstü) — ogren-3d.html'deki AYNI sabit. */
  function stoneSurfaceY() { return -(BOARD_H / 2) - STONE_R * ASPECT_3D - 1; }

  // Sade, boyut-agnostik taş çizimi — ogren-3d.html'in tam gradient/gölge
  // detayları (particle, ghost, highlight) BİLEREK taşınmadı; Sahne #1/#2
  // yalnız "burada bir taş var" göstermeye ihtiyaç duyuyor.
  function drawStone(gx, gz, color, scale) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const p = project(wx, stoneSurfaceY(), wz);
    const { rx, ry } = stoneRadii(p, scale ?? 1);
    if (rx < 2) return;
    const isB = color === 'black';
    ctx.save();
    const ps = project(wx, -BOARD_H / 2 - .5, wz);
    const sg = ctx.createRadialGradient(ps.sx + rx * .1, ps.sy + ry * .12, 0, ps.sx + rx * .1, ps.sy + ry * .12, rx);
    sg.addColorStop(0, 'rgba(0,0,0,.38)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.ellipse(ps.sx + rx * .1, ps.sy + ry * .12, rx, ry * .48, 0, 0, Math.PI * 2);
    ctx.fillStyle = sg; ctx.fill();

    ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(p.sx - rx * .2, p.sy - ry * .25, rx * .03, p.sx, p.sy, rx * 1.05);
    if (isB) {
      g.addColorStop(0, '#4e5c70'); g.addColorStop(.4, '#171b28'); g.addColorStop(1, '#050508');
    } else {
      g.addColorStop(0, '#fbf8f2'); g.addColorStop(.6, '#efe8da'); g.addColorStop(1, '#d8d0c2');
    }
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = isB ? '#181c28' : 'rgba(90,72,45,.5)';
    ctx.lineWidth = rx * .045; ctx.stroke();
    ctx.restore();
  }

  /** Kesişim rehberi — küçük yeşil neon nokta. Taş DEĞİL, çok düşük opacity. */
  function drawGuide(gx, gz, hovered) {
    const wx = -HALF + gx * CELL, wz = -HALF + gz * CELL;
    const Y = -BOARD_H / 2 - .3;
    const p = project(wx, Y, wz);
    const r = Math.max(1.6, 2.4 * p.scale) * (hovered ? 1.35 : 1);
    ctx.save();
    ctx.shadowColor = 'rgba(62,207,128,.85)';
    ctx.shadowBlur = hovered ? 6 : 3.5;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(62,207,128,${hovered ? .95 : .68})`;
    ctx.fill();
    ctx.restore();
  }

  function render() {
    const bg = ctx.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .5, Math.max(W, H) * .75);
    bg.addColorStop(0, '#141420'); bg.addColorStop(1, '#060608');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    drawBoard();
    drawGrid();
    for (const g of guidePoints) drawGuide(g.gx, g.gz, g.gx === hoverGuide?.gx && g.gz === hoverGuide?.gz);
    const sorted = [...visualStones].sort((a, b) => project(-HALF + a.gx * CELL, 0, -HALF + a.gz * CELL).z - project(-HALF + b.gx * CELL, 0, -HALF + b.gz * CELL).z);
    for (const s of sorted) {
      const scale = reduceMotion ? 1 : easeInOutCubic(Math.min(1, s.t));
      drawStone(s.gx, s.gz, s.color, scale);
    }
  }

  let rafId = null;
  let lastFrameMs = 0;
  const STONE_ANIM_DUR = 0.16;
  function loop(nowMs) {
    const dt = lastFrameMs ? Math.min(0.05, (nowMs - lastFrameMs) / 1000) : 1 / 60;
    lastFrameMs = nowMs;
    if (camLerpT < 1 && camTarget) {
      camLerpT = Math.min(1, camLerpT + (1 / 60) / CAM_DUR);
      const t = easeInOutCubic(camLerpT);
      camYaw = lerp(camStart.yaw, camTarget.yaw, t);
      camPitch = lerp(camStart.pitch, camTarget.pitch, t);
      camDist = lerp(camStart.dist, camTarget.dist, t);
    }
    if (!reduceMotion) {
      for (const s of visualStones) if (s.t < 1) s.t = Math.min(1, s.t + dt / STONE_ANIM_DUR);
    }
    render();
    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  // ── Kesişim tıklaması → hit-test → abone edilen handler'lara ilet ────
  // Sahne modülleri canvas/koordinat matematiğine HİÇ dokunmaz; yalnız
  // onIntersectionTap(handler) ile abone olur.
  function screenToGrid(mx, my) {
    const BY = -BOARD_H / 2;
    let best = null, bestD = Infinity, bestSc = 1;
    for (let gz = 0; gz < SIZE; gz++) {
      for (let gx = 0; gx < SIZE; gx++) {
        const p = project(-HALF + gx * CELL, BY, -HALF + gz * CELL);
        const d = Math.hypot(mx - p.sx, my - p.sy);
        if (d < bestD) { bestD = d; best = { gx, gz }; bestSc = p.scale; }
      }
    }
    const hitMult = isMobile ? 0.72 : 0.55;
    return bestD < CELL * hitMult * bestSc ? best : null;
  }
  let hoverGuide = null;
  function pointerXY(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches?.[0]?.clientX ?? evt.clientX;
    const clientY = evt.touches?.[0]?.clientY ?? evt.clientY;
    return { mx: clientX - rect.left, my: clientY - rect.top };
  }
  function handleMove(evt) {
    if (!guidePoints.length) { hoverGuide = null; return; }
    const { mx, my } = pointerXY(evt);
    const hit = screenToGrid(mx, my);
    hoverGuide = hit && guidePoints.some(g => g.gx === hit.gx && g.gz === hit.gz) ? hit : null;
  }
  function handleClick(evt) {
    if (!inputEnabled) return;
    const { mx, my } = pointerXY(evt);
    const hit = screenToGrid(mx, my);
    if (!hit) return; // tahta dışı/boş tıklama — hamle sayılmaz
    for (const handler of tapHandlers) handler({ row: hit.gz, col: hit.gx });
  }
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('pointermove', handleMove);

  return {
    setSize(n) {
      if (![9, 13, 19].includes(n)) return;
      SIZE = n; CELL = sizeToCell(n); HALF = (SIZE - 1) * CELL / 2; STONE_R = CELL * (20 / 48);
      boardSt = new BoardState(SIZE);
      visualStones = [];
      guidePoints = [];
      hoverGuide = null;
    },
    reset() {
      boardSt.reset(SIZE);
      visualStones = [];
      guidePoints = [];
      hoverGuide = null;
    },
    focus(presetName) {
      const preset = CAM_PRESETS[presetName] || CAM_PRESETS.overview;
      const target = isMobile ? { ...preset, yaw: .50, pitch: Math.max(preset.pitch, 1.2) } : preset;
      camStart = { yaw: camYaw, pitch: camPitch, dist: camDist };
      camTarget = { ...target };
      camLerpT = 0;
    },
    getSize() { return SIZE; },

    /**
     * @param {{row:number,col:number,color:'black'|'white'}} move
     * @returns {boolean}
     */
    isLegalMove({ row, col, color }) {
      return isValidMove(boardSt, col, row, color).valid;
    },

    /**
     * Yasalsa GERÇEK BoardState'i (core/ruleEngine.js applyMove) ve
     * görsel taş listesini günceller. Yasal DEĞİLSE hiçbir şeyi
     * değiştirmez — sahne modülü `.ok` alanına bakarak karar verir.
     * @param {{row:number,col:number,color:'black'|'white'}} move
     * @returns {{ok:boolean, reason?:string, captured?:Array<{row:number,col:number}>}}
     */
    playMove({ row, col, color }) {
      const check = isValidMove(boardSt, col, row, color);
      if (!check.valid) return { ok: false, reason: check.reason };
      const { newState, captured } = applyMove(boardSt, col, row, color);
      boardSt = newState;
      visualStones.push({ gx: col, gz: row, color, t: reduceMotion ? 1 : 0 });
      for (const c of captured) {
        visualStones = visualStones.filter(s => !(s.gx === c.x && s.gz === c.y));
      }
      return { ok: true, captured: captured.map(c => ({ row: c.y, col: c.x })) };
    },

    /** @returns {Array<{row:number,col:number}>} o an boş olan tüm kesişimler. */
    getEmptyIntersections() {
      const points = [];
      for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
          if (boardSt.isEmpty(col, row)) points.push({ row, col });
        }
      }
      return points;
    },

    /** @param {Array<{row:number,col:number}>} points */
    setIntersectionGuides(points) {
      guidePoints = (points || []).map(p => ({ gx: p.col, gz: p.row }));
    },
    clearIntersectionGuides() {
      guidePoints = [];
      hoverGuide = null;
    },

    /** false iken onIntersectionTap abonelerine ASLA ulaşılmaz (girdi kilidi). */
    setInputEnabled(enabled) { inputEnabled = !!enabled; },
    isInputEnabled() { return inputEnabled; },

    /**
     * @param {(hit:{row:number,col:number}) => void} handler
     * @returns {() => void} abonelikten çıkma fonksiyonu
     */
    onIntersectionTap(handler) {
      tapHandlers.add(handler);
      return () => tapHandlers.delete(handler);
    },

    destroy() {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('pointermove', handleMove);
      tapHandlers.clear();
      guidePoints = [];
      visualStones = [];
    },
  };
}
