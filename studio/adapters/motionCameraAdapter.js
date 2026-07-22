/**
 * studio/adapters/motionCameraAdapter.js
 *
 * AG-MOTION M3 — M2 motion-intent planından sahne başına kamera/focus
 * çerçevesi (frame) üretir. Gerçek animasyon render, video export, canvas,
 * UI/IPC/dosya yazma YOK — yalnız veri dönüşümü (M1/M2 ile aynı "saf
 * adapter" ilkesi).
 */

const CAMERA_VERSION = '0.1';

const DEFAULT_MOVE_ZOOM = 1.4;
const DEFAULT_CAPTURE_ZOOM = 1.6;
const DEFAULT_FULL_BOARD_ZOOM = 1;
const DEFAULT_PADDING = 1.5;

const EASING_BY_KIND = Object.freeze({
  setup: 'ease-out',
  move: 'ease-in-out',
  capture: 'emphasized',
  pass: 'linear',
});

function cloneStones(stones) {
  return (Array.isArray(stones) ? stones : []).map(s => ({ x: s.x, y: s.y, color: s.color }));
}

function clampToBoard(value, size) {
  return Math.min(Math.max(value, 0), size - 1);
}

function clampPoint(point, size) {
  if (!point) return point;
  return { x: clampToBoard(point.x, size), y: clampToBoard(point.y, size) };
}

// Annotation şekli tipe göre değişir: point (triangle/square/circle/cross/
// selected/label), from/to (arrow/line), points[] (region). Kamera odağı
// için ilgili tüm noktalar tek bir listeye indirgenir.
function annotationPoints(annotation) {
  if (!annotation) return [];
  if (annotation.point) return [annotation.point];
  if (annotation.from && annotation.to) return [annotation.from, annotation.to];
  if (Array.isArray(annotation.points)) return annotation.points;
  return [];
}

function boundingCenter(points) {
  if (!points.length) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

// Annotation (overlay + focus.points) ve comment (caption overlay) her
// scene.kind için ortak — Kapsam md.6-7.
function collectAnnotationAndCommentOverlays(scene) {
  const overlays = [];
  const focusPoints = [];
  for (const action of Array.isArray(scene.actions) ? scene.actions : []) {
    if (action.type === 'highlight-annotation') {
      overlays.push({ type: 'annotation', annotation: { ...action.annotation } });
      focusPoints.push(...annotationPoints(action.annotation));
    } else if (action.type === 'show-comment') {
      overlays.push({ type: 'caption', text: action.text });
    }
  }
  return { overlays, focusPoints };
}

function buildFrame(scene, board, options, warnings) {
  const size = Number.isInteger(board?.size) ? board.size : 9;
  const easing = EASING_BY_KIND[scene.kind] ?? 'linear';
  const { overlays, focusPoints: annotationFocusPoints } = collectAnnotationAndCommentOverlays(scene);

  let camera;
  let focus = { points: [], stones: [], captures: [] };

  if (scene.kind === 'setup') {
    camera = {
      mode: 'full-board',
      center: null,
      zoom: Number.isFinite(options.fullBoardZoom) ? options.fullBoardZoom : DEFAULT_FULL_BOARD_ZOOM,
      padding: Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING,
    };
    focus.stones = cloneStones(board?.initialStones);
  } else if (scene.kind === 'pass') {
    const passAction = (scene.actions ?? []).find(a => a.type === 'show-pass');
    overlays.unshift({ type: 'pass', color: passAction?.color ?? null });
    camera = {
      mode: 'full-board',
      center: null,
      zoom: Number.isFinite(options.fullBoardZoom) ? options.fullBoardZoom : DEFAULT_FULL_BOARD_ZOOM,
      padding: Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING,
    };
  } else if (scene.kind === 'move' || scene.kind === 'capture') {
    if (!scene.focus) {
      warnings.push(`${scene.id}: kind '${scene.kind}' için scene.focus eksik — full-board\'a düşüldü`);
      camera = {
        mode: 'full-board',
        center: null,
        zoom: Number.isFinite(options.fullBoardZoom) ? options.fullBoardZoom : DEFAULT_FULL_BOARD_ZOOM,
        padding: Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING,
      };
    } else if (scene.kind === 'capture') {
      const captureAction = (scene.actions ?? []).find(a => a.type === 'remove-captured-stones');
      const capturedStones = captureAction ? cloneStones(captureAction.stones) : [];
      const center = boundingCenter([scene.focus, ...capturedStones]) ?? scene.focus;
      camera = {
        mode: 'area-focus',
        center: clampPoint(center, size),
        zoom: Number.isFinite(options.captureZoom) ? options.captureZoom : DEFAULT_CAPTURE_ZOOM,
        padding: Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING,
      };
      focus.captures = capturedStones;
      focus.points.push(scene.focus);
    } else {
      camera = {
        mode: 'point-focus',
        center: clampPoint(scene.focus, size),
        zoom: Number.isFinite(options.moveZoom) ? options.moveZoom : DEFAULT_MOVE_ZOOM,
        padding: Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING,
      };
      focus.points.push(scene.focus);
    }
  } else {
    // Bilinmeyen/gelecekte eklenebilecek scene.kind (ör. M2'nin dokümante
    // ettiği ama üretmediği 'annotation'/'comment') — sessizce yok
    // sayılmaz, güvenli varsayılana düşülür ve açıkça raporlanır.
    warnings.push(`${scene.id}: bilinmeyen scene.kind '${scene.kind}' — full-board varsayılana düşüldü`);
    camera = {
      mode: 'full-board',
      center: null,
      zoom: Number.isFinite(options.fullBoardZoom) ? options.fullBoardZoom : DEFAULT_FULL_BOARD_ZOOM,
      padding: Number.isFinite(options.padding) ? options.padding : DEFAULT_PADDING,
    };
  }

  focus.points.push(...annotationFocusPoints.map(p => clampPoint(p, size)));

  return {
    id: `frame-${scene.id}`,
    sceneId: scene.id,
    nodeId: scene.nodeId,
    kind: scene.kind,
    camera,
    focus,
    overlays,
    durationMs: scene.durationMs,
    easing,
  };
}

/**
 * M2 motion-intent planı → sahne başına kamera/focus çerçeveleri.
 *
 * @param {object} intentPlan — buildMotionIntent() çıktısının .plan'ı
 * @param {object} [options]
 * @param {number} [options.moveZoom] — move point-focus zoom (varsayılan 1.4)
 * @param {number} [options.captureZoom] — capture area-focus zoom (varsayılan 1.6)
 * @param {number} [options.fullBoardZoom] — setup/pass full-board zoom (varsayılan 1)
 * @param {number} [options.padding] — kamera padding (varsayılan 1.5)
 * @returns {{ cameraPlan: object, warnings: string[] }}
 */
export function buildMotionCameraPlan(intentPlan, options = {}) {
  if (!intentPlan || typeof intentPlan !== 'object') {
    throw new Error('MOTION_CAMERA_INVALID_PLAN');
  }
  if (!Array.isArray(intentPlan.scenes)) {
    throw new Error('MOTION_CAMERA_NO_SCENES');
  }

  // M1+M2'nin kendi warnings'i sessizce kaybolmasın diye taşınır; M3'ün
  // kendi (bilinmeyen kind / eksik focus gibi) uyarıları eklenir.
  const warnings = [...(Array.isArray(intentPlan.warnings) ? intentPlan.warnings : [])];

  const frames = intentPlan.scenes.map(scene => buildFrame(scene, intentPlan.board, options, warnings));

  const cameraPlan = {
    version: CAMERA_VERSION,
    source: intentPlan.source ? { ...intentPlan.source } : null,
    board: intentPlan.board
      ? { ...intentPlan.board, initialStones: cloneStones(intentPlan.board.initialStones) }
      : null,
    frames,
    warnings,
  };

  return { cameraPlan, warnings };
}
