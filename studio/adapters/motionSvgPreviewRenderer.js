/**
 * studio/adapters/motionSvgPreviewRenderer.js
 *
 * AG-MOTION M5 — M4 render blueprint'inden TEK bir clip'in statik SVG
 * önizlemesini üretir. Animasyon, video export, DOM/canvas/browser API,
 * dosya yazma, UI/IPC YOK — yalnızca güvenli, escape edilmiş SVG string.
 *
 * Kapsam notu (dürüstlük): bir clip'in kendi step'leri yalnızca O clip'in
 * yeni taşını/yakalamalarını taşır (M1'in tam before/after board snapshot'ı
 * M2'de zaten summarize edilip kaybolmuştu — bkz. motionIntentAdapter.js).
 * Bu yüzden move/capture clip'lerinin önizlemesi "blueprint.board.initialStones
 * + bu clip'in kendi place-stone/fade-out'u" temelinde çizilir — TÜM oyun
 * geçmişini yeniden oynatmaz. Bu, "tek clip'i statik görselleştir" kapsamıyla
 * tutarlıdır ve M5 kapanış raporunda açıkça belirtilir.
 */

import { pointToPixel } from './motionRenderBlueprintAdapter.js';

const STONE_FILL = { black: '#1a1a1a', white: '#f5efe0' };
const STONE_STROKE = { black: '#000000', white: '#8a8272' };
const SUPPORTED_ANNOTATION_TYPES = new Set(['circle', 'triangle', 'square', 'label']);

// ── Güvenlik: XML/SVG metin escape'i — script/style injection yok, Türkçe
// karakterler bozulmaz (Unicode karakterlere dokunulmaz, yalnız 5 XML
// özel karakteri escape edilir). ──────────────────────────────────────────
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

// ── Tahta ve grid ──────────────────────────────────────────────────────

function drawBoardGrid(boardRect, size) {
  let out = `<g class="board">`;
  out += `<rect class="board-bg" x="${num(boardRect.x)}" y="${num(boardRect.y)}" width="${num(boardRect.width)}" height="${num(boardRect.height)}" fill="#dcb35c" stroke="#5a4a2a" stroke-width="2"/>`;
  for (let i = 0; i < size; i++) {
    const a = pointToPixel({ x: i, y: 0 }, size, boardRect);
    const b = pointToPixel({ x: i, y: size - 1 }, size, boardRect);
    out += `<line class="grid-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2a2010" stroke-width="1"/>`;
    const c = pointToPixel({ x: 0, y: i }, size, boardRect);
    const d = pointToPixel({ x: size - 1, y: i }, size, boardRect);
    out += `<line class="grid-line" x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" stroke="#2a2010" stroke-width="1"/>`;
  }
  out += `</g>`;
  return out;
}

// ── Taşlar ────────────────────────────────────────────────────────────

function stoneRadius(boardRect, size) {
  const cellSize = boardRect.width / Math.max(size - 1, 1);
  return cellSize * 0.42;
}

function drawStone(x, y, color, boardRect, size) {
  const p = pointToPixel({ x, y }, size, boardRect);
  const r = stoneRadius(boardRect, size);
  const fill = STONE_FILL[color] ?? '#888888';
  const stroke = STONE_STROKE[color] ?? '#444444';
  return `<circle class="stone stone-${color === 'white' ? 'white' : 'black'}" cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
}

// clip'in KENDİ step'lerinden (draw-initial-stones / place-stone /
// fade-out-captured-stones) bu tek clip için nihai taş listesini kurar —
// bkz. dosya başındaki kapsam notu.
function resolveFinalStones(clip, blueprint) {
  const drawInitial = clip.steps.find(s => s.type === 'draw-initial-stones');
  let stones = drawInitial
    ? drawInitial.stones.map(s => ({ x: s.x, y: s.y, color: s.color }))
    : (blueprint.board?.initialStones ?? []).map(s => ({ x: s.x, y: s.y, color: s.color }));

  for (const step of clip.steps) {
    if (step.type === 'place-stone' && step.color) {
      stones.push({ x: step.point.x, y: step.point.y, color: step.color });
    }
  }

  const faded = clip.steps.find(s => s.type === 'fade-out-captured-stones');
  if (faded) {
    const removeKeys = new Set(faded.stones.map(s => `${s.x},${s.y}`));
    stones = stones.filter(s => !removeKeys.has(`${s.x},${s.y}`));
  }

  return stones;
}

// ── Hamle vurgusu ve yakalama halosu ─────────────────────────────────────

function drawMoveHighlight(step, boardRect, size) {
  const p = pointToPixel(step.point, size, boardRect);
  const r = stoneRadius(boardRect, size) * 1.6;
  return `<circle class="move-highlight" cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="#ff5a3c" stroke-width="2.5" opacity="0.85"/>`;
}

function drawCaptureHalos(step, boardRect, size) {
  let out = '';
  for (const stone of step.stones ?? []) {
    const p = pointToPixel(stone, size, boardRect);
    const r = stoneRadius(boardRect, size) * 1.3;
    out += `<circle class="capture-halo" cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="#cc2222" stroke-width="2" stroke-dasharray="4 3"/>`;
  }
  return out;
}

// ── Annotation ────────────────────────────────────────────────────────

function drawAnnotation(step, boardRect, size, warnings, clipId) {
  const annotation = step.annotation ?? {};
  const type = annotation.type;
  if (!SUPPORTED_ANNOTATION_TYPES.has(type)) {
    warnings.push(`${clipId}: desteklenmeyen annotation tipi '${type}' çizilmedi`);
    return '';
  }

  const point = step.points?.[0] ?? annotation.point;
  if (!point) {
    warnings.push(`${clipId}: '${type}' annotation'ı için nokta bulunamadı, çizilmedi`);
    return '';
  }
  const p = pointToPixel(point, size, boardRect);
  const r = stoneRadius(boardRect, size) * 0.55;

  if (type === 'circle') {
    return `<circle class="annotation annotation-circle" cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="#2255cc" stroke-width="2"/>`;
  }
  if (type === 'square') {
    return `<rect class="annotation annotation-square" x="${p.x - r}" y="${p.y - r}" width="${r * 2}" height="${r * 2}" fill="none" stroke="#2255cc" stroke-width="2"/>`;
  }
  if (type === 'triangle') {
    const h = r * 1.4;
    const pts = `${p.x},${p.y - h} ${p.x - h * 0.87},${p.y + h * 0.5} ${p.x + h * 0.87},${p.y + h * 0.5}`;
    return `<polygon class="annotation annotation-triangle" points="${pts}" fill="none" stroke="#2255cc" stroke-width="2"/>`;
  }
  if (type === 'label') {
    const text = escapeXml(annotation.text ?? '');
    return `<g class="annotation annotation-label">`
      + `<circle cx="${p.x}" cy="${p.y}" r="${r * 1.1}" fill="#fff8e0" stroke="#2255cc" stroke-width="1.5"/>`
      + `<text x="${p.x}" y="${p.y}" font-size="${Math.max(r, 8)}" text-anchor="middle" dominant-baseline="central" fill="#1a1a1a">${text}</text>`
      + `</g>`;
  }
  return '';
}

// ── Caption / Pas / Kamera odağı ─────────────────────────────────────────

function drawCaption(text, viewport, boardRect) {
  const safe = escapeXml(text);
  const boxY = boardRect.y + boardRect.height + 16;
  const boxWidth = Math.min(viewport.width - 40, boardRect.width);
  const boxX = boardRect.x + (boardRect.width - boxWidth) / 2;
  return `<g class="caption">`
    + `<rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="40" rx="6" fill="#221933" stroke="#4a3a66" stroke-width="1"/>`
    + `<text x="${boxX + boxWidth / 2}" y="${boxY + 24}" font-size="16" text-anchor="middle" fill="#f4eff7">${safe}</text>`
    + `</g>`;
}

function drawPassLabel(boardRect) {
  const x = boardRect.x + boardRect.width / 2;
  const y = boardRect.y - 20;
  return `<g class="pass"><text x="${x}" y="${y}" font-size="20" font-weight="700" text-anchor="middle" fill="#c7b2d6">Pas</text></g>`;
}

function drawCameraFocus(camera, boardRect, size) {
  if (!camera || camera.mode === 'full-board' || !camera.center) return '';
  const p = pointToPixel(camera.center, size, boardRect);
  const r = stoneRadius(boardRect, size) * 2.2;
  // Gerçek zoom/crop uygulanmaz (Kapsam md.8) — yalnız odak noktası
  // görünür kılınır: kesikli artı işareti + zayıf daire.
  return `<g class="camera-focus" opacity="0.6">`
    + `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="#66c2ff" stroke-width="1.5" stroke-dasharray="3 3"/>`
    + `<line x1="${p.x - r}" y1="${p.y}" x2="${p.x + r}" y2="${p.y}" stroke="#66c2ff" stroke-width="1"/>`
    + `<line x1="${p.x}" y1="${p.y - r}" x2="${p.x}" y2="${p.y + r}" stroke="#66c2ff" stroke-width="1"/>`
    + `</g>`;
}

// ── Bir clip için tam SVG gövdesi ─────────────────────────────────────────

function renderClipBody(clip, blueprint, warnings) {
  const { viewport, board } = blueprint;
  const boardRect = viewport.boardRect;
  const size = Number.isInteger(board?.size) ? board.size : 9;

  let body = drawBoardGrid(boardRect, size);

  const stones = resolveFinalStones(clip, blueprint);
  body += `<g class="stones">`;
  for (const stone of stones) {
    body += drawStone(stone.x, stone.y, stone.color, boardRect, size);
  }
  body += `</g>`;

  body += `<g class="highlights">`;
  const pulseStep = clip.steps.find(s => s.type === 'pulse-move');
  if (pulseStep) body += drawMoveHighlight(pulseStep, boardRect, size);
  body += `</g>`;

  body += `<g class="captures">`;
  const fadeStep = clip.steps.find(s => s.type === 'fade-out-captured-stones');
  if (fadeStep) body += drawCaptureHalos(fadeStep, boardRect, size);
  body += `</g>`;

  body += `<g class="annotations">`;
  for (const step of clip.steps.filter(s => s.type === 'fade-in-annotation')) {
    body += drawAnnotation(step, boardRect, size, warnings, clip.id);
  }
  body += `</g>`;

  const cameraStep = clip.steps.find(s => s.type === 'camera-move');
  if (cameraStep) {
    body += drawCameraFocus(clip.camera, boardRect, size);
  }

  const passStep = clip.steps.find(s => s.type === 'show-pass');
  if (passStep) body += drawPassLabel(boardRect);

  const captionStep = clip.steps.find(s => s.type === 'show-caption');
  if (captionStep) body += drawCaption(captionStep.text, viewport, boardRect);

  return body;
}

function wrapSvg(viewport, body) {
  const w = num(viewport.width, 1280);
  const h = num(viewport.height, 720);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect class="bg" x="0" y="0" width="${w}" height="${h}" fill="#15111f"/>`
    + body
    + `</svg>`;
}

function validateBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('MOTION_SVG_INVALID_BLUEPRINT');
  }
  if (!Array.isArray(blueprint.clips)) {
    throw new Error('MOTION_SVG_NO_CLIPS');
  }
  if (!blueprint.viewport || typeof blueprint.viewport !== 'object' || !blueprint.viewport.boardRect) {
    throw new Error('MOTION_SVG_INVALID_VIEWPORT');
  }
}

function resolveClip(blueprint, clipIdOrIndex) {
  if (typeof clipIdOrIndex === 'number') {
    return blueprint.clips[clipIdOrIndex] ?? null;
  }
  if (typeof clipIdOrIndex === 'string') {
    return blueprint.clips.find(c => c.id === clipIdOrIndex) ?? null;
  }
  return null;
}

/**
 * Blueprint içinden TEK bir clip seçip statik SVG önizlemesi üretir.
 *
 * @param {object} blueprint — buildMotionRenderBlueprint() çıktısının .blueprint'i
 * @param {number|string} clipIdOrIndex — clip.id ya da clips[] index'i
 * @param {object} [options] — şu an kullanılmıyor, ileri uyumluluk için
 * @returns {{ svg: string, warnings: string[] }}
 */
export function renderClipSvg(blueprint, clipIdOrIndex, options = {}) {
  validateBlueprint(blueprint);
  const clip = resolveClip(blueprint, clipIdOrIndex);
  if (!clip) {
    throw new Error(`MOTION_SVG_CLIP_NOT_FOUND: '${clipIdOrIndex}'`);
  }

  const warnings = [...(Array.isArray(blueprint.warnings) ? blueprint.warnings : [])];
  const body = renderClipBody(clip, blueprint, warnings);
  return { svg: wrapSvg(blueprint.viewport, body), warnings };
}

/**
 * Blueprint'ten tek bir statik SVG önizlemesi üretir. `options.clipId` ya
 * da `options.clipIndex` verilmezse ilk clip (index 0) seçilir. Blueprint'te
 * hiç clip yoksa hata FIRLATMAZ — yalnız tahta/grid içeren geçerli bir SVG
 * döner (boş önizleme, "boş blueprint → geçerli SVG" kapsamı).
 *
 * @param {object} blueprint
 * @param {object} [options]
 * @param {string} [options.clipId]
 * @param {number} [options.clipIndex]
 * @returns {{ svg: string, warnings: string[] }}
 */
export function renderMotionSvgPreview(blueprint, options = {}) {
  validateBlueprint(blueprint);

  const warnings = [...(Array.isArray(blueprint.warnings) ? blueprint.warnings : [])];

  if (blueprint.clips.length === 0) {
    const boardRect = blueprint.viewport.boardRect;
    const size = Number.isInteger(blueprint.board?.size) ? blueprint.board.size : 9;
    const body = drawBoardGrid(boardRect, size);
    return { svg: wrapSvg(blueprint.viewport, body), warnings };
  }

  const selector = options.clipId ?? options.clipIndex ?? 0;
  return renderClipSvg(blueprint, selector, options);
}
