/**
 * workers/goAI.worker.js
 *
 * Ana thread ↔ MCTS motoru köprüsü.
 * Gelen mesaj: { boardData: { grid, ko, size }, color, timeMs }
 * Giden mesaj: { ok, move } | { ok: false, error }
 */

import { getBestMove, finalScore } from '../core/goAI.js';

self.addEventListener('message', ({ data }) => {
  const { type, boardData, color, timeMs } = data;

  try {
    if (type === 'MOVE') {
      const move = getBestMove(boardData, color, timeMs ?? 2000);
      self.postMessage({ ok: true, type: 'MOVE', move });
    } else if (type === 'SCORE') {
      const score = finalScore(boardData);
      self.postMessage({ ok: true, type: 'SCORE', score });
    } else {
      // Geriye dönük uyumluluk — tip belirtilmemişse MOVE varsay
      const move = getBestMove(boardData, color, timeMs ?? 2000);
      self.postMessage({ ok: true, move });
    }
  } catch (e) {
    self.postMessage({ ok: false, error: e.message });
  }
});
