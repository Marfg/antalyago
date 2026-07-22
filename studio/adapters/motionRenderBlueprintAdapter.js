/**
 * studio/adapters/motionRenderBlueprintAdapter.js
 *
 * AG-MOTION M4 — M3 camera/focus planından renderer-bağımsız "render
 * blueprint" (çizim talimatları) üretir. Gerçek render (DOM/SVG/canvas
 * API çağrısı), video export, UI/IPC/dosya yazma YOK — yalnız veri.
 *
 * pointToPixel() formülü studio/boardRenderer.js'in px()/cell()
 * fonksiyonlarıyla AYNI doğrusal mantığı izler (bkz. o dosyadaki
 * `px(idx,size) = PAD + idx*cell(size)`): orijin sol-üst, x sağa, y AŞAĞI
 * artar — flip yok. boardRenderer'daki sabit 360x360 viewBox yerine burada
 * herhangi bir boardRect kabul edilir, ama yön/doğrusallık birebir aynı.
 */

const BLUEPRINT_VERSION = '0.1';

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 720;
// 1280x720 içinde ortalanmış kare tahta alanı — 16:9 dengeli yerleşim
// (görevde önerilen {x:160,y:72,width:720,height:720} literal olarak
// 720 yükseklikli viewport'u taşırdı [72+720=792>720]; bu yüzden kendi
// tutarlı varsayılanımız seçildi).
const DEFAULT_BOARD_RECT = Object.freeze({ x: 340, y: 60, width: 600, height: 600 });

const LAYER_BY_STEP_TYPE = Object.freeze({
  'draw-board': 'board',
  'draw-initial-stones': 'stones',
  'place-stone': 'stones',
  'pulse-move': 'stones',
  'lift-captured-stones': 'captures',
  'fade-out-captured-stones': 'captures',
  'fade-in-annotation': 'annotations',
  'show-caption': 'caption',
  'show-pass': 'ui',
  'camera-move': 'ui',
});

/**
 * Tahta koordinatı (0..size-1) → piksel. boardRenderer.js'teki px()/cell()
 * ile aynı doğrusal formül, genel bir boardRect'e uygulanmış hâli.
 *
 * @param {{x:number,y:number}} point
 * @param {number} boardSize
 * @param {{x:number,y:number,width:number,height:number}} boardRect
 * @returns {{x:number,y:number}}
 */
export function pointToPixel(point, boardSize, boardRect) {
  const cellX = boardRect.width / (boardSize - 1);
  const cellY = boardRect.height / (boardSize - 1);
  return {
    x: boardRect.x + point.x * cellX,
    y: boardRect.y + point.y * cellY,
  };
}

function withPixel(point, boardSize, boardRect) {
  return { x: point.x, y: point.y, pixel: pointToPixel(point, boardSize, boardRect) };
}

function stonesWithPixel(stones, boardSize, boardRect) {
  return (Array.isArray(stones) ? stones : []).map(s => ({
    x: s.x, y: s.y, color: s.color, pixel: pointToPixel(s, boardSize, boardRect),
  }));
}

// M3'ün camera-adapter'ındaki annotationPoints() ile aynı mantık — her
// adapter kendi küçük saf yardımcılarını taşır (kurulu proje geleneği).
function annotationPoints(annotation) {
  if (!annotation) return [];
  if (annotation.point) return [annotation.point];
  if (annotation.from && annotation.to) return [annotation.from, annotation.to];
  if (Array.isArray(annotation.points)) return annotation.points;
  return [];
}

function buildClipSteps(frame, boardSize, boardRect, warnings) {
  const steps = [];

  steps.push({ type: 'draw-board', layer: 'board' });

  const kind = frame.kind;
  if (kind === 'setup') {
    steps.push({
      type: 'draw-initial-stones',
      layer: 'stones',
      stones: stonesWithPixel(frame.focus?.stones, boardSize, boardRect),
    });
  } else if (kind === 'move' || kind === 'capture') {
    const point = frame.camera?.center ?? frame.focus?.points?.[0] ?? null;
    if (!point) {
      warnings.push(`${frame.id}: kind '${kind}' için nokta bulunamadı — place-stone/pulse-move atlandı`);
    } else {
      const placed = withPixel(point, boardSize, boardRect);
      steps.push({ type: 'place-stone', layer: 'stones', point: { x: placed.x, y: placed.y }, pixel: placed.pixel });
      steps.push({ type: 'pulse-move', layer: 'stones', point: { x: placed.x, y: placed.y }, pixel: placed.pixel });
    }
    if (kind === 'capture') {
      const captured = stonesWithPixel(frame.focus?.captures, boardSize, boardRect);
      steps.push({ type: 'lift-captured-stones', layer: 'captures', stones: captured });
      steps.push({ type: 'fade-out-captured-stones', layer: 'captures', stones: captured });
    }
  } else if (kind === 'pass') {
    const passOverlay = (frame.overlays ?? []).find(o => o.type === 'pass');
    steps.push({ type: 'show-pass', layer: 'ui', color: passOverlay?.color ?? null });
  } else {
    warnings.push(`${frame.id}: bilinmeyen frame.kind '${kind}' — yalnız draw-board üretildi`);
  }

  if (frame.camera && frame.camera.mode !== 'full-board') {
    const centerPixel = frame.camera.center ? pointToPixel(frame.camera.center, boardSize, boardRect) : null;
    steps.push({
      type: 'camera-move',
      layer: 'ui',
      mode: frame.camera.mode,
      center: frame.camera.center,
      pixel: centerPixel,
      zoom: frame.camera.zoom,
      padding: frame.camera.padding,
    });
  }

  for (const overlay of frame.overlays ?? []) {
    if (overlay.type === 'annotation') {
      const points = annotationPoints(overlay.annotation).map(p => withPixel(p, boardSize, boardRect));
      steps.push({ type: 'fade-in-annotation', layer: 'annotations', annotation: { ...overlay.annotation }, points });
    } else if (overlay.type === 'caption') {
      steps.push({ type: 'show-caption', layer: 'caption', text: overlay.text });
    }
    // overlay.type === 'pass' zaten kind==='pass' dalında show-pass'e dönüştü — tekrar eklenmez.
  }

  return steps;
}

function buildClip(frame, boardSize, boardRect, warnings) {
  const steps = buildClipSteps(frame, boardSize, boardRect, warnings);
  const layers = [...new Set(steps.map(s => LAYER_BY_STEP_TYPE[s.type] ?? 'ui'))];

  return {
    id: `clip-${frame.id}`,
    frameId: frame.id,
    sceneId: frame.sceneId,
    nodeId: frame.nodeId,
    kind: frame.kind,
    durationMs: frame.durationMs,
    easing: frame.easing,
    camera: frame.camera ? { ...frame.camera } : null,
    layers,
    steps,
  };
}

/**
 * M3 camera/focus planı → renderer-bağımsız render blueprint.
 *
 * @param {object} cameraPlan — buildMotionCameraPlan() çıktısının .cameraPlan'ı
 * @param {object} [options]
 * @param {number} [options.viewportWidth] — varsayılan 1280
 * @param {number} [options.viewportHeight] — varsayılan 720
 * @param {{x:number,y:number,width:number,height:number}} [options.boardRect] — varsayılan ortalanmış 600x600
 * @returns {{ blueprint: object, warnings: string[] }}
 */
export function buildMotionRenderBlueprint(cameraPlan, options = {}) {
  if (!cameraPlan || typeof cameraPlan !== 'object') {
    throw new Error('MOTION_BLUEPRINT_INVALID_CAMERA_PLAN');
  }
  if (!Array.isArray(cameraPlan.frames)) {
    throw new Error('MOTION_BLUEPRINT_NO_FRAMES');
  }

  // M1+M2+M3'ün kendi warnings zinciri sessizce kaybolmasın diye taşınır;
  // M4'ün kendi (bilinmeyen kind / eksik nokta gibi) uyarıları eklenir.
  const warnings = [...(Array.isArray(cameraPlan.warnings) ? cameraPlan.warnings : [])];

  const boardSize = Number.isInteger(cameraPlan.board?.size) ? cameraPlan.board.size : 9;
  const width = Number.isFinite(options.viewportWidth) ? options.viewportWidth : DEFAULT_VIEWPORT_WIDTH;
  const height = Number.isFinite(options.viewportHeight) ? options.viewportHeight : DEFAULT_VIEWPORT_HEIGHT;
  const boardRect = options.boardRect ? { ...options.boardRect } : { ...DEFAULT_BOARD_RECT };

  const clips = cameraPlan.frames.map(frame => buildClip(frame, boardSize, boardRect, warnings));

  const blueprint = {
    version: BLUEPRINT_VERSION,
    source: cameraPlan.source ? { ...cameraPlan.source } : null,
    board: cameraPlan.board ? { ...cameraPlan.board } : null,
    viewport: {
      width,
      height,
      boardRect,
      coordinateSystem: {
        origin: 'top-left',
        xAxis: 'right',
        yAxis: 'down',
        boardMin: 0,
        boardMax: boardSize - 1,
      },
    },
    clips,
    warnings,
  };

  return { blueprint, warnings };
}
