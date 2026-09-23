import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-22.illegal-native2';
import { createCaptureBoard, targetLiberties, evaluateCaptureMove, chooseCaptureReply } from './captureNativePolicy.js?v=2026-09-22.illegal-native2';

/** Capture-only controller using the existing scene lifecycle and board adapter. */
export function createCaptureScene({ id, scenario, game = false }) {
  let dispose = null;
  let completed = false;
  return {
    id, version: 3, title: game ? 'İlk taşı alan kazanır' : scenario.title,
    concept: 'capture', prerequisites: ['liberty', 'atari'],
    // Required legacy registry metadata only; never used to load content.
    curriculumRef: { lessonId: 'l3', concept: 'capture' },
    captureKey: game ? 'capture_04_first_capture' : scenario.key,
    mount(context) {
      completed = false;
      const adapter = context.boardAdapter;
      let board = createCaptureBoard(game ? undefined : scenario);
      let active = true, busy = false, hintLevel = 0, attempts = 0, ply = 0, passes = 0;
      let endControls = null;
      const timers = new Set();
      const root = document.createElement('div');
      root.className = 'ls-strip-root';
      root.innerHTML = `<div class="ls-strip-row capture-scene">
        <div class="s05-content"><p class="s05-prompt"></p><p class="s05-tap-hint"></p></div>
        <p class="s05-feedback" role="status" aria-live="polite"></p>
        <div class="ls-topic-end-actions"><button class="ls-strip-btn ls-strip-btn--ghost" data-action="hint">İpucu</button><button class="ls-strip-btn ls-strip-btn--ghost" data-action="pass">Pas</button></div>
      </div>`;
      context.container.appendChild(root);
      const panel = root.firstElementChild;
      const prompt = root.querySelector('.s05-prompt');
      const turn = root.querySelector('.s05-tap-hint');
      const feedback = root.querySelector('.s05-feedback');
      const hint = root.querySelector('[data-action="hint"]');
      const pass = root.querySelector('[data-action="pass"]');
      prompt.textContent = game ? 'İlk taşı alan kazanır. Sen siyahsın; bilgisayar beyaz.' : scenario.prompt;
      turn.textContent = 'Siyah oynar';
      hint.hidden = game;
      pass.hidden = !game;

      function emit(type, data = {}) {
        context.emit(type, { concept: 'capture', captureKey: game ? 'capture_04_first_capture' : scenario.key, ...data });
      }
      function phase(value) {
        panel.dataset.phase = value;
        emit('scene_phase_changed', { phase: value });
      }
      function later(fn, delay) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!active) return;
          // The host suspends board input while the topics panel is open.
          // Keep delayed actions suspended too, so its input snapshot stays valid.
          if (context.container.hidden) { later(fn, 100); return; }
          fn();
        }, delay);
        timers.add(timer);
      }
      function lock(value) {
        busy = value;
        adapter.setInputEnabled(!value && !completed);
        hint.disabled = value || hintLevel === 3;
        pass.disabled = value || completed;
      }
      function seed() {
        adapter.reset();
        board.stones.forEach(s => adapter.playMove({ row: s.y, col: s.x, color: s.color }));
      }
      adapter.setSize(5);
      seed();
      adapter.focus('center');
      adapter.clearLiberties();
      adapter.clearMovePreview();
      phase('observe');
      lock(false);
      emit(game ? 'scene_game_started' : 'scene_assessment_presented', game
        ? { boardSize: 5, playerColor: 'black' }
        : { assessmentIndex: 0, assessmentCount: 1, assessmentType: 'board_tap', assessmentConcept: 'atari', targetGroupSize: scenario.board.filter(s => s.color === 'white').length });

      function finishGame(winner, capturedCount) {
        lock(true);
        later(() => {
          phase('consequence');
          feedback.textContent = winner === 'black' ? 'İlk taşı sen aldın. Kazandın!' : winner === 'white' ? 'İlk taşı beyaz aldı. Bu oyunu beyaz kazandı.' : 'İki taraf da pas geçti. Oyun taş alınmadan bitti.';
          emit('scene_game_finished', { winner, capturedCount, moveCount: ply, outcome: winner === 'black' ? 'win' : winner === 'white' ? 'loss' : 'draw', ...(capturedCount ? { resultConcept: 'capture' } : {}) });
          later(() => {
            phase('concept');
            completed = true; // A finished game is participation, not a correct quiz answer.
            panel.hidden = true;
            emit('scene_completion_unlocked');
            endControls = mountTopicEndControls(context, { summaryText: `${feedback.textContent} ${capturedCount ? 'Taş alma: nefes noktası kalmayan taş veya grup tahtadan kaldırılır.' : 'Yeni bir oyun için tekrar dene.'}` });
          }, 650);
        }, 750);
      }
      function play(point, color) {
        const result = evaluateCaptureMove(board, point, color);
        if (!result.ok) {
          feedback.textContent = result.reason === 'OCCUPIED' ? 'Bu kesişimde zaten bir taş var. Boş bir kesişim seç.' : 'Bu hamle oynanamıyor. Başka bir nefes noktası bırakacak hamle dene.';
          emit('scene_move_rejected', { ...point, color, reason: result.reason });
          return null;
        }
        const visible = adapter.playMove({ ...point, color, animateCapture: true });
        if (!visible.ok) return null;
        board = result.newState;
        ply++;
        return result;
      }
      function gameMove(point, color) {
        const result = play(point, color);
        if (!result) return false;
        passes = 0;
        emit('scene_game_move', { ...point, color, moveNumber: ply, capturedCount: result.capturedCount, ...(result.capturedCount ? { resultConcept: 'capture' } : {}) });
        if (result.capturedCount) finishGame(color, result.capturedCount);
        else if (color === 'black') reply();
        else { turn.textContent = 'Siyah oynar'; phase('observe'); lock(false); }
        return true;
      }
      function passTurn(color) {
        passes++;
        board.turn = color === 'black' ? 'white' : 'black';
        board.koPoint = null;
        emit('scene_game_passed', { color, consecutivePasses: passes });
        if (passes === 2) finishGame(null, 0);
        else if (color === 'black') reply();
        else { turn.textContent = 'Siyah oynar'; lock(false); }
      }
      function reply() {
        lock(true);
        turn.textContent = 'Beyaz oynuyor…';
        later(() => {
          const point = chooseCaptureReply(board);
          if (point) gameMove(point, 'white');
          else passTurn('white');
        }, 500);
      }
      function onTap(point) {
        if (!active || busy || completed) return;
        if (game) {
          if (board.turn !== 'black') return;
          feedback.textContent = '';
          phase('act');
          gameMove(point, 'black');
          return;
        }
        const before = board;
        const result = play(point, 'black');
        if (!result) return;
        attempts++;
        lock(true);
        phase('act');
        feedback.textContent = '';
        adapter.clearLiberties();
        adapter.clearMovePreview();
        const correct = scenario.board.filter(s => s.color === 'white').every(s => board.colorAt(s.x, s.y) === null);
        emit('scene_assessment_answered', {
          assessmentIndex: 0, assessmentConcept: 'atari', attemptNumber: attempts, correct,
          ...point, capturedCount: result.capturedCount, targetRemovedFromBoard: correct,
          hintRequested: hintLevel > 0, hintLevel,
          ...(correct ? { resultConcept: 'capture' } : {}),
        });
        later(() => {
          phase('consequence');
          if (!correct) {
            adapter.showLiberties(targetLiberties(board, scenario));
            feedback.textContent = 'Beyaz taşın nefes noktası hâlâ açık. İşaretli noktaya bak; hamleni geri alıp yeniden deneyelim.';
            later(() => {
              board = before;
              seed();
              adapter.showLiberties(targetLiberties(board, scenario));
              emit('scene_move_undone', { ...point, reason: 'target_has_liberties' });
              phase('observe');
              lock(false);
            }, 1400);
            return;
          }
          feedback.textContent = scenario.consequence;
          later(() => {
            phase('concept');
            prompt.textContent = 'Taş alma';
            feedback.textContent = scenario.conceptText;
            turn.textContent = '';
            hint.hidden = true;
            completed = true;
            emit('scene_completion_unlocked');
            panel.hidden = true;
            endControls = mountTopicEndControls(context, { summaryText: `Taş alma — ${scenario.conceptText}` });
          }, 650);
        }, 750);
      }
      function onHint() {
        if (busy || completed || hintLevel === 3) return;
        hintLevel++;
        feedback.textContent = scenario.hints[hintLevel - 1];
        const liberties = targetLiberties(board, scenario);
        if (hintLevel >= 2) adapter.showLiberties(liberties);
        if (hintLevel === 3) adapter.setMovePreview({ ...liberties[0], color: 'black' });
        hint.textContent = hintLevel === 3 ? 'İpucu 3 / 3' : `İpucu ${hintLevel + 1} / 3`;
        hint.disabled = hintLevel === 3;
        emit('scene_hint_revealed', { assessmentIndex: 0, hintLevel, hintRequested: true });
      }
      function onPass() { if (!busy && !completed && board.turn === 'black') passTurn('black'); }
      hint.addEventListener('click', onHint);
      pass.addEventListener('click', onPass);
      const unsubscribe = adapter.onIntersectionTap(onTap);
      dispose = () => {
        active = false;
        timers.forEach(clearTimeout);
        timers.clear();
        unsubscribe();
        hint.removeEventListener('click', onHint);
        pass.removeEventListener('click', onPass);
        adapter.setInputEnabled(false);
        adapter.clearLiberties();
        adapter.clearMovePreview();
        endControls?.destroy();
        root.remove();
      };
    },
    unmount() { dispose?.(); dispose = null; completed = false; },
    canComplete() { return completed; },
    complete() {},
  };
}
