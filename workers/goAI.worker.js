/**
 * workers/goAI.worker.js
 *
 * Ana thread ↔ MCTS motoru köprüsü.
 * Gelen mesaj: MOVE için { boardData, color, timeMs };
 *               MOVE_ITERATIONS için { boardData, color, iterations, seed };
 *               MOVE_PROFILE için { boardData:{ grid,ko,size,komi,previousPass,moveCount }, color, profile, seed }
 * Giden mesaj: { ok, move } | { ok: false, error }
 */

import { getBestMove, getBestMoveByIterations, getBestMoveForProfile, getAIProfile, finalScore } from '../core/goAI.js';

self.addEventListener('message', ({ data }) => {
  const { type, boardData, color, timeMs, iterations, seed, profile, gameId, requestId } = data;
  const reply=payload=>self.postMessage({...payload,gameId,requestId});

  try {
    if (type === 'MOVE') {
      const move = getBestMove(boardData, color, timeMs ?? 2000);
      reply({ ok: true, type: 'MOVE', move });
    } else if (type === 'MOVE_ITERATIONS') {
      const move = getBestMoveByIterations(boardData, color, iterations, { seed });
      reply({ ok: true, type: 'MOVE_ITERATIONS', move });
    } else if (type === 'MOVE_PROFILE') {
      const config = getAIProfile(profile);
      const move = getBestMoveForProfile(boardData, color, profile, { seed });
      reply({ ok: true, type: 'MOVE_PROFILE', move, profile, thinkingTimeMs:config.thinkingTimeMs });
    } else if (type === 'SCORE') {
      const score = finalScore(boardData);
      reply({ ok: true, type: 'SCORE', score });
    } else {
      // Geriye dönük uyumluluk — tip belirtilmemişse MOVE varsay
      const move = getBestMove(boardData, color, timeMs ?? 2000);
      reply({ ok: true, move });
    }
  } catch (e) {
    reply({ ok: false, error: e.message });
  }
});
