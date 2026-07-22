/**
 * studio/adapters/motionIntentAdapter.js
 *
 * AG-MOTION M2 — M1 storyboard/timeline'ından saf sahne (scene) / motion
 * intent planı üretir. Gerçek animasyon çizimi, render motoru, canvas,
 * UI/IPC/dosya yazma YOK — yalnız veri dönüşümü (motionStoryboardAdapter.js
 * ile aynı "saf adapter" ilkesi).
 */

const INTENT_VERSION = '0.1';
const DEFAULT_SETUP_DURATION_MS = 1000;

// Görevde önerilen tam sözlük — dokümantasyon/gelecekteki tüketiciler için
// dışa açık. M2 şu an yalnız setup/move/pass/capture kind'lerini ÜRETİYOR;
// annotation/comment birer bağımsız "kind" değil, her zaman ACTION olarak
// ilgili move/pass/capture sahnesine ekleniyor (bkz. Kapsam md.4-5 — yalnız
// "action eklensin" deniyor, "kind = annotation/comment" denmiyor; md.3'te
// ise capture için "scene kind = capture" açıkça belirtiliyor).
export const SCENE_KINDS = Object.freeze(['setup', 'move', 'pass', 'capture', 'annotation', 'comment']);

// "focus-area" burada tanımlı ama M2'de hiçbir sahne tarafından üretilmiyor
// (tek noktalı focus, mevcut kapsam için yeterli — bkz. kapanış raporu).
export const ACTION_TYPES = Object.freeze([
  'show-initial-stones', 'place-stone', 'highlight-move', 'highlight-annotation',
  'remove-captured-stones', 'show-comment', 'show-pass', 'focus-area',
]);

function cloneStones(stones) {
  return (Array.isArray(stones) ? stones : []).map(s => ({ x: s.x, y: s.y, color: s.color }));
}

function colorLabel(color) {
  return color === 'white' ? 'Beyaz' : 'Siyah';
}

function buildSetupScene(storyboard, options) {
  const stones = Array.isArray(storyboard.board?.initialStones) ? storyboard.board.initialStones : [];
  if (stones.length === 0) return null;

  const durationMs = Number.isInteger(options.setupDurationMs) && options.setupDurationMs > 0
    ? options.setupDurationMs
    : DEFAULT_SETUP_DURATION_MS;

  return {
    id: 'scene-setup',
    eventId: null,
    nodeId: 'root',
    kind: 'setup',
    title: 'Kurulum',
    narration: `Kurulum: ${stones.length} taş.`,
    focus: null,
    actions: [{ type: 'show-initial-stones', stones: cloneStones(stones) }],
    durationMs,
  };
}

function buildEventScene(event) {
  const isPass = event.pass === true || event.type === 'pass';
  const hasCaptures = Array.isArray(event.captures) && event.captures.length > 0;
  const hasAnnotations = Array.isArray(event.annotations) && event.annotations.length > 0;
  const hasComment = typeof event.comment === 'string' && event.comment.trim().length > 0;

  // Kapsam md.3: capture varsa kind = capture (move'dan önceliklidir).
  // Pass ayrı işlenir (md.6). Annotation/comment kind'i değiştirmez —
  // yalnız action ekler (md.4-5).
  const kind = isPass ? 'pass' : (hasCaptures ? 'capture' : 'move');
  const actions = [];

  if (isPass) {
    actions.push({ type: 'show-pass', color: event.color });
  } else {
    actions.push({ type: 'place-stone', point: { x: event.move.x, y: event.move.y }, color: event.color });
    actions.push({ type: 'highlight-move', point: { x: event.move.x, y: event.move.y }, color: event.color });
  }

  if (hasCaptures) {
    actions.push({ type: 'remove-captured-stones', stones: event.captures.map(c => ({ ...c })) });
  }

  if (hasAnnotations) {
    for (const annotation of event.annotations) {
      // Tüm annotation alanları (id/type/point veya from-to veya text/points)
      // olduğu gibi taşınır — "annotation point/type taşınsın" (md.4) fazlasıyla.
      actions.push({ type: 'highlight-annotation', annotation: { ...annotation } });
    }
  }

  if (hasComment) {
    actions.push({ type: 'show-comment', text: event.comment });
  }

  const narrationParts = [
    isPass
      ? `${colorLabel(event.color)} pas geçti.`
      : `${colorLabel(event.color)} (${event.move.x},${event.move.y}) oynadı.`,
  ];
  if (hasCaptures) {
    narrationParts.push(`${event.captures.length} taş yakalandı.`);
  }
  if (hasComment) {
    narrationParts.push(event.comment);
  }

  return {
    id: `scene-${event.id}`,
    eventId: event.id,
    nodeId: event.nodeId,
    kind,
    title: isPass ? 'Pas' : (hasCaptures ? 'Yakalama' : 'Hamle'),
    narration: narrationParts.join(' '),
    focus: isPass ? null : { x: event.move.x, y: event.move.y },
    actions,
    durationMs: event.durationMs,
  };
}

/**
 * M1 storyboard → M2 sahne/motion intent planı.
 *
 * @param {object} storyboard — buildMotionStoryboard() çıktısının .storyboard'ı
 * @param {object} [options]
 * @param {number} [options.setupDurationMs] — kurulum sahnesi süresi (varsayılan 1000ms)
 * @returns {{ plan: object, warnings: string[] }}
 */
export function buildMotionIntent(storyboard, options = {}) {
  if (!storyboard || typeof storyboard !== 'object') {
    throw new Error('MOTION_INTENT_INVALID_STORYBOARD');
  }
  if (!Array.isArray(storyboard.timeline)) {
    throw new Error('MOTION_INTENT_NO_TIMELINE');
  }

  // M1'in kendi warnings'i (ör. kök annotation, eski marker) sessizce
  // kaybolmasın diye plana taşınır; M2'nin kendi yeni uyarıları eklenir.
  const warnings = [...(Array.isArray(storyboard.warnings) ? storyboard.warnings : [])];

  const scenes = [];
  const setupScene = buildSetupScene(storyboard, options);
  if (setupScene) scenes.push(setupScene);

  for (const event of storyboard.timeline) {
    scenes.push(buildEventScene(event));
  }

  // legacyMarkersOverlay hiçbir sahneye/action'a dağıtılmadı — açık uyarı.
  if (Array.isArray(storyboard.legacyMarkersOverlay) && storyboard.legacyMarkersOverlay.length > 0) {
    warnings.push(`legacy marker overlay (${storyboard.legacyMarkersOverlay.length} adet) hiçbir sahneye/action'a dağıtılmadı`);
  }

  const plan = {
    version: INTENT_VERSION,
    source: storyboard.source ? { ...storyboard.source } : null,
    board: storyboard.board
      ? { ...storyboard.board, initialStones: cloneStones(storyboard.board.initialStones) }
      : null,
    scenes,
    warnings,
  };

  return { plan, warnings };
}
