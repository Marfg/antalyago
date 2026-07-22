import { getMovePath, createBoardStateFromSnapshot } from '../model/moveTree.js';
import { applyMove, isValidMove } from '../../core/ruleEngine.js';

/**
 * studio/adapters/motionStoryboardAdapter.js
 *
 * AG-MOTION M1 — Studio document → saf storyboard/timeline sözleşmesi.
 * Render motoru, video export, canvas animasyon veya IPC/UI YOK — yalnız
 * veri dönüşümü. sgfAdapter.js'in yanına, aynı "saf adapter" ilkesiyle
 * eklendi: DOM yok, dosya I/O yok, yalnızca studioDocument → düz JSON.
 */

const STORYBOARD_VERSION = '0.1';
const DEFAULT_DURATION_MS = 800;

function cloneStones(stones) {
  return (Array.isArray(stones) ? stones : []).map(s => ({ x: s.x, y: s.y, color: s.color }));
}

// Annotation şekilleri (id,type,point/from/to/text/points) düz veri —
// JSON round-trip güvenli, fonksiyon/Date içermez.
function cloneAnnotations(annotations) {
  return (Array.isArray(annotations) ? annotations : []).map(a => JSON.parse(JSON.stringify(a)));
}

function resolveTargetNodeId(doc, options) {
  return options.nodeId
    ?? doc.moveTree?.activeNodeId
    ?? doc.activeNodeId
    ?? 'root';
}

/**
 * Timeline üretilecek düğüm dizisini belirler.
 * Varsayılan ("active-path"): root'tan hedef düğüme (options.nodeId ya da
 * doc.activeNodeId/moveTree.activeNodeId) giden yol — varyasyonlarda yalnız
 * SEÇİLİ dal.
 * options.mode === 'mainline': root'tan preferredChildId zincirini izleyerek
 * ana hattın sonuna kadar iner (serializeMainlineMoves ile aynı gezinme
 * mantığı, ama tam düğümleri — annotations/comment dahil — döndürür).
 */
function resolvePathNodes(doc, root, options) {
  if (options.mode === 'mainline') {
    const path = [root];
    let cursor = root;
    const seen = new Set([root.id]);
    while (Array.isArray(cursor.children) && cursor.children.length > 0) {
      const preferred = cursor.children.find(c => c.id === cursor.preferredChildId) ?? cursor.children[0];
      if (!preferred || seen.has(preferred.id)) break;
      seen.add(preferred.id);
      path.push(preferred);
      cursor = preferred;
    }
    return path;
  }

  const targetNodeId = resolveTargetNodeId(doc, options);
  const path = getMovePath(root, targetNodeId);
  // Hedef düğüm bulunamazsa (örn. eskimiş activeNodeId) sessizce tüm ağacı
  // taramak yerine köke düşer — boş timeline, hata değil.
  return path.length > 0 ? path : [root];
}

/**
 * Studio document → storyboard/timeline.
 *
 * @param {object} doc — studioDocument (moveTree + board.size + title/id)
 * @param {object} [options]
 * @param {string} [options.nodeId] — hedef düğüm (varsayılan: doc'un aktif düğümü)
 * @param {'active-path'|'mainline'} [options.mode] — varsayılan: active-path
 * @param {number} [options.defaultDurationMs] — her event için sabit süre (varsayılan 800ms)
 * @returns {{ storyboard: object, warnings: string[] }}
 */
export function buildMotionStoryboard(doc, options = {}) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('MOTION_STORYBOARD_INVALID_DOCUMENT');
  }
  const root = doc.moveTree?.root;
  if (!root) {
    throw new Error('MOTION_STORYBOARD_NO_MOVETREE');
  }

  const warnings = [];
  const size = Number.isInteger(doc.board?.size) ? doc.board.size : 9;
  const durationMs = Number.isInteger(options.defaultDurationMs) && options.defaultDurationMs > 0
    ? options.defaultDurationMs
    : DEFAULT_DURATION_MS;
  const pathNodes = resolvePathNodes(doc, root, options);

  // Kök düğümün kendi comment/annotations'ı timeline event'i DEĞİL (kurulum
  // pozisyonuna ait) — sessizce kaybolmasın diye açıkça warning'e kaydedilir.
  if (root.comment || (Array.isArray(root.annotations) && root.annotations.length > 0)) {
    warnings.push("root: comment/annotations storyboard zaman çizgisine dahil edilmedi (yalnız hamle event'leri kapsanıyor, kurulum pozisyonuna ait)");
  }

  let state = createBoardStateFromSnapshot(root.formation ?? {});
  const timeline = [];

  for (const node of pathNodes.slice(1)) {
    const move = node.move;
    if (!move) continue; // hamlesiz ara düğüm olmamalı ama güvenlik için atlanır

    const before = { stones: cloneStones(state.stones), turn: state.turn };

    if (move.pass) {
      const next = state.clone();
      next.turn = state.turn === 'black' ? 'white' : 'black';
      next.koPoint = null;
      state = next;

      timeline.push({
        id: `evt-${node.id}`,
        nodeId: node.id,
        type: 'pass',
        color: move.color,
        move: null,
        pass: true,
        comment: node.comment ?? '',
        annotations: cloneAnnotations(node.annotations),
        before,
        after: { stones: cloneStones(state.stones), turn: state.turn },
        captures: [],
        durationMs,
      });
      continue;
    }

    // Out-of-bounds / illegal hamle sessizce geçilmez — açık hata.
    const validity = isValidMove(state, move.x, move.y, move.color);
    if (!validity.valid) {
      throw new Error(`MOTION_STORYBOARD_ILLEGAL_MOVE: node ${node.id} (${move.x},${move.y}) ${validity.reason}`);
    }

    const { newState, captured } = applyMove(state, move.x, move.y, move.color);
    const captureColor = move.color === 'black' ? 'white' : 'black';
    const captures = captured.map(c => ({ x: c.x, y: c.y, color: captureColor }));
    state = newState;

    timeline.push({
      id: `evt-${node.id}`,
      nodeId: node.id,
      type: 'move',
      color: move.color,
      move: { x: move.x, y: move.y },
      pass: false,
      comment: node.comment ?? '',
      annotations: cloneAnnotations(node.annotations),
      before,
      after: { stones: cloneStones(state.stones), turn: state.turn },
      captures,
      durationMs,
    });
  }

  // Eski/global doc.board.markers SİLİNMEZ — genel overlay alanına taşınır +
  // warning'e kaydedilir (zaman çizgisine dağıtılmadığı açıkça belirtilir).
  let legacyMarkersOverlay;
  if (Array.isArray(doc.board?.markers) && doc.board.markers.length > 0) {
    legacyMarkersOverlay = doc.board.markers.map(m => ({ ...m }));
    warnings.push(`legacy doc.board.markers (${doc.board.markers.length} adet) storyboard'a genel overlay olarak eklendi, zaman çizgisine dağıtılmadı`);
  }

  const storyboard = {
    version: STORYBOARD_VERSION,
    source: {
      documentId: doc.id ?? null,
      title: doc.title ?? '',
      activeNodeId: pathNodes[pathNodes.length - 1]?.id ?? root.id,
      boardSize: size,
    },
    board: {
      size,
      initialStones: cloneStones(root.formation?.stones),
    },
    timeline,
    ...(legacyMarkersOverlay ? { legacyMarkersOverlay } : {}),
    warnings,
  };

  return { storyboard, warnings };
}
