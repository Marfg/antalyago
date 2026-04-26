/**
 * core/actionHandler.js
 *
 * Tüm kullanıcı etkileşimlerinin tek giriş noktası.
 * View katmanı bu fonksiyonu çağırır, sonucu yorumlar.
 *
 * Action types:
 *   BOARD_TAP        { x, y }
 *   STEP_NEXT
 *   STEP_PREV
 *   LESSON_SELECT    { lessonId }
 *   BOARD_SIZE_SET   { size }   — boardSelector adımı için
 *   HINT_REQUEST
 *
 * Result:
 *   { ok, effects[], boardState, lessonState, feedback }
 *
 * Effect types (view bunları yorumlar):
 *   PLACE_STONE      { x, y, color }
 *   REMOVE_STONES    { points[] }
 *   PLAY_MOVES       { moves[], speed }
 *   SEED_BOARD       { stones[] }
 *   RESET_BOARD      { size }
 *   CAMERA_PRESET    { preset }   — view'in yorumlaması isteğe bağlı
 *   SHOW_COMPLETION  { chapTitle, chapComplete, nextLesson }
 *   UPDATE_LESSON    { lessonState }
 */

import { isValidMove, computeCaptures, applyMove } from './ruleEngine.js';
import { isCorrectAnswer, stepRequiresAnswer }      from './lessonEngine.js';

export class ActionHandler {
  /**
   * @param {import('./boardState.js').BoardState} boardState
   * @param {import('./lessonEngine.js').LessonEngine} lessonEngine
   */
  constructor(boardState, lessonEngine) {
    this.board  = boardState;
    this.lesson = lessonEngine;
  }

  /**
   * @param {{ type: string, payload?: object }} action
   * @returns {Result}
   */
  handle(action) {
    switch (action.type) {
      case 'BOARD_TAP':     return this._boardTap(action.payload);
      case 'STEP_NEXT':     return this._stepNext();
      case 'STEP_PREV':     return this._stepPrev();
      case 'STEP_GOTO':     return this._stepGoto(action.payload);
      case 'LESSON_SELECT': return this._lessonSelect(action.payload);
      case 'BOARD_SIZE_SET':return this._boardSizeSet(action.payload);
      case 'HINT_REQUEST':  return this._hintRequest();
      default:
        return this._result(false, [], { text: 'Bilinmeyen aksiyon', type: 'error' });
    }
  }

  // ── BOARD_TAP ─────────────────────────────────────────────────────

  _boardTap({ x, y }) {
    const step = this.lesson.currentStep();

    if (!step || this.lesson.stepDone) {
      return this._result(false, [], null);
    }

    // Eğer adım cevap gerektirmiyorsa (auto adım) → yoksay
    if (!stepRequiresAnswer(step)) {
      return this._result(false, [], null);
    }

    // Dolu nokta
    if (this.board.isOccupied(x, y)) {
      return this._result(false, [], null);
    }

    // Go kural kontrolü (suicide, ko)
    const color = step.turn === 'white' ? 'white' : 'black';
    const ruleCheck = isValidMove(this.board, x, y, color);
    if (!ruleCheck.valid) {
      return this._result(false, [], {
        text: ruleCheck.reason === 'KO' ? 'Ko kuralı — bu hamle yasak!' : 'Geçersiz hamle.',
        type: 'wrong',
      });
    }

    // Ders cevap doğrulama
    const { correct, mistakeCount } = this.lesson.validateAnswer(x, y);

    if (correct) {
      return this._handleCorrectAnswer(step, x, y, color);
    } else {
      const fb = step.fb_err || 'Yanlış, tekrar dene.';
      return this._result(false, [], { text: fb, type: 'wrong' });
    }
  }

  _handleCorrectAnswer(step, x, y, color) {
    const effects = [];

    // Hamle uygula — motor artık kendi yakalamalarını hesaplıyor
    if (step.capture && step.capture.length > 0) {
      // Curriculum'da hâlâ hardcoded capture varsa onu kullan (Faz 5'e kadar)
      effects.push({ type: 'PLACE_STONE', x, y, color });
      effects.push({ type: 'REMOVE_STONES', points: step.capture, delay: 380 });
      step.capture.forEach(c => this.board.removeStone(c.x, c.y));
      this.board.placeStone(x, y, color);
    } else {
      // Kural motoru hesaplasın
      const { newState, captured } = applyMove(this.board, x, y, color);
      this._syncBoard(newState);
      effects.push({ type: 'PLACE_STONE', x, y, color });
      if (captured.length > 0) {
        effects.push({ type: 'REMOVE_STONES', points: captured });
      }
    }

    // movesAfterAnswer varsa
    if (step.movesAfterAnswer) {
      effects.push({ type: 'PLAY_MOVES', moves: step.movesAfterAnswer, speed: step.moveSpeed || 1, delay: 500 });
    } else if (step.movesAfterAnswerMap) {
      const seq = step.movesAfterAnswerMap[`${x},${y}`];
      if (seq) effects.push({ type: 'PLAY_MOVES', moves: seq, speed: step.moveSpeed || 1, delay: 500 });
    }

    // DOM güncellemesi için lessonState
    effects.push({ type: 'UPDATE_LESSON', lessonState: this.lesson._currentState() });

    const fb = step.fb_ok || 'Doğru!';
    return this._result(true, effects, { text: fb, type: 'correct' });
  }

  // ── STEP_NEXT ────────────────────────────────────────────────────

  _stepNext() {
    if (!this.lesson.canAdvance()) {
      return this._result(false, [], null);
    }

    const outcome = this.lesson.nextStep();
    if (!outcome) return this._result(false, [], null);

    if (outcome.type === 'LESSON_COMPLETE') {
      const effects = [
        { type: 'SHOW_COMPLETION', ...outcome },
      ];
      return this._result(true, effects, null);
    }

    // Yeni adım yüklendi
    return this._loadStepEffects(outcome);
  }

  // ── STEP_GOTO ────────────────────────────────────────────────────

  _stepGoto({ idx }) {
    const outcome = this.lesson.loadStep(idx);
    if (!outcome) return this._result(false, [], null);
    return this._loadStepEffects(outcome);
  }

  // ── STEP_PREV ────────────────────────────────────────────────────

  _stepPrev() {
    const outcome = this.lesson.prevStep();
    if (!outcome) return this._result(false, [], null);
    return this._loadStepEffects(outcome);
  }

  // ── LESSON_SELECT ────────────────────────────────────────────────

  _lessonSelect({ lessonId }) {
    const outcome = this.lesson.loadLesson(lessonId);
    if (!outcome) return this._result(false, [], { text: 'Ders bulunamadı', type: 'error' });
    return this._loadStepEffects(outcome);
  }

  // ── BOARD_SIZE_SET ───────────────────────────────────────────────

  _boardSizeSet({ size }) {
    this.board.reset(size);
    const effects = [{ type: 'RESET_BOARD', size }];
    return this._result(true, effects, null);
  }

  // ── HINT_REQUEST ─────────────────────────────────────────────────

  _hintRequest() {
    const step = this.lesson.currentStep();
    if (!step) return this._result(false, [], null);

    // İpucu: doğru cevap noktalarını vurgula
    const targets = step.answers === 'any' ? [] :
      step.answer ? [step.answer] :
      Array.isArray(step.answers) ? step.answers : [];

    return this._result(true,
      [{ type: 'SHOW_HINT', targets }],
      { text: 'İpucu: hedef noktalar vurgulandı.', type: 'info' }
    );
  }

  // ── Yardımcı ─────────────────────────────────────────────────────

  /**
   * Yeni adım yüklenince gerekli effects'leri üret.
   */
  _loadStepEffects(lessonState) {
    const step = lessonState.step;
    const effects = [];

    // Board sıfırla + taşları yer
    effects.push({ type: 'RESET_BOARD', size: step?.size || 9 });

    // Board state'i senkronize et
    this.board.reset(step?.size || 9);
    if (step?.turn) this.board.turn = step.turn === 'black' ? 'black' : 'white';

    const stones = step?.board || [];
    stones.forEach(s => this.board.placeStone(s.x, s.y, s.color === 'B' ? 'black' : s.color === 'W' ? 'white' : s.color));

    effects.push({ type: 'SEED_BOARD', stones: this.board.stones.map(s => ({ ...s })) });

    // Kamera
    if (step?.camera) {
      effects.push({ type: 'CAMERA_PRESET', preset: step.camera });
    }

    // Otomatik hamle sekansı
    if (step?.moves?.length) {
      effects.push({ type: 'PLAY_MOVES', moves: step.moves, speed: step.moveSpeed || 1 });
    }

    effects.push({ type: 'UPDATE_LESSON', lessonState });

    return this._result(true, effects, this._stepFeedback(step));
  }

  _stepFeedback(step) {
    if (!step) return null;
    const fb = step.fb;
    if (!fb) return null;
    if (typeof fb === 'string') return { text: fb, type: 'info' };
    return { text: fb.t, type: fb.c || 'info' };
  }

  _result(ok, effects, feedback) {
    return {
      ok,
      effects,
      feedback,
      boardState: this.board,
      lessonState: this.lesson._currentState?.() || null,
    };
  }

  /**
   * Yeni BoardState'i mevcut board nesnesine senkronize et.
   * Faz 2 tamamlanana kadar bridge görevini görür.
   */
  _syncBoard(newState) {
    this.board.grid    = newState.grid;
    this.board.stones  = newState.stones;
    this.board.turn    = newState.turn;
    this.board.koPoint = newState.koPoint;
    this.board.size    = newState.size;
  }
}
