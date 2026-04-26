/**
 * core/lessonEngine.js
 *
 * Ders durumu ve validasyon. DOM, render, animasyon yok.
 *
 * Dışarıya:
 *  - isCorrectAnswer(step, x, y)       ← tek doğrulama noktası
 *  - LessonEngine sınıfı (state yönetimi)
 */

// ── Tek doğrulama fonksiyonu ───────────────────────────────────────
// Önceki mimaride 5 ayrı yerde tekrarlanan mantık buraya taşındı.

/**
 * Verilen step tanımına göre (x,y) hamlesi doğru cevap mı?
 *
 * @param {object} step  — curriculum step verisi
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isCorrectAnswer(step, x, y) {
  if (!step) return false;
  if (step.answers === 'any') return true;
  if (Array.isArray(step.answers)) {
    return step.answers.some(a => a.x === x && a.y === y);
  }
  if (step.answer) {
    return step.answer.x === x && step.answer.y === y;
  }
  return false;
}

/**
 * Step bir cevap gerektiriyor mu?
 */
export function stepRequiresAnswer(step) {
  if (!step) return false;
  if (step.auto) return false;
  return !!(step.answer || step.answers);
}

// ── LessonEngine sınıfı ────────────────────────────────────────────

export class LessonEngine {
  constructor(curriculum) {
    /** @type {object[]}  bölüm listesi */
    this.curriculum = curriculum;
    /** @type {object[]}  tüm dersler düz liste */
    this.allLessons = curriculum.flatMap(c => c.lessons);

    // Mevcut durum
    this.curLesson    = null;
    this.curStepIdx   = 0;
    this.stepDone     = false;
    this.mistakeCount = 0;

    // localStorage'dan tamamlanan dersler
    this._loadDone();
  }

  // ── Ders gezinme ─────────────────────────────────────────────────

  loadLesson(lessonId) {
    const lesson = this.allLessons.find(l => l.id === lessonId);
    if (!lesson) return null;
    this.curLesson    = lesson;
    this.mistakeCount = 0;
    return this.loadStep(0);  // stepDone'u ilk adıma göre doğru ayarlar
  }

  loadStep(idx) {
    if (!this.curLesson) return null;
    const step = this.curLesson.steps[idx];
    if (!step) return null;
    this.curStepIdx   = idx;
    this.stepDone     = !!(step.auto || step.moves?.length);
    this.mistakeCount = 0;
    return this._currentState();
  }

  nextStep() {
    if (!this.curLesson) return null;
    const steps = this.curLesson.steps;

    if (this.curStepIdx < steps.length - 1) {
      return this.loadStep(this.curStepIdx + 1);
    }

    // Son adım → dersi tamamla
    return this._completeLesson();
  }

  prevStep() {
    if (!this.curLesson || this.curStepIdx === 0) return null;
    return this.loadStep(this.curStepIdx - 1);
  }

  // ── Cevap doğrulama ──────────────────────────────────────────────

  /**
   * Kullanıcının (x,y) hamlesini değerlendir.
   * @returns {{ correct: boolean, stepDone: boolean, mistakeCount: number }}
   */
  validateAnswer(x, y) {
    const step = this.currentStep();
    if (!step || this.stepDone) {
      return { correct: false, stepDone: this.stepDone, mistakeCount: this.mistakeCount };
    }

    const correct = isCorrectAnswer(step, x, y);

    if (correct) {
      this.stepDone = true;
    } else {
      this.mistakeCount++;
    }

    return { correct, stepDone: this.stepDone, mistakeCount: this.mistakeCount };
  }

  // ── Yardımcı erişiciler ──────────────────────────────────────────

  currentStep() {
    if (!this.curLesson) return null;
    return this.curLesson.steps[this.curStepIdx] || null;
  }

  currentChapter() {
    if (!this.curLesson) return null;
    return this.curriculum.find(c => c.lessons.some(l => l.id === this.curLesson.id)) || null;
  }

  isFirstStep() { return this.curStepIdx === 0; }
  isLastStep()  {
    return !this.curLesson || this.curStepIdx === this.curLesson.steps.length - 1;
  }

  canAdvance() {
    const step = this.currentStep();
    return !!(step && (step.auto || this.stepDone));
  }

  totalSteps() {
    return this.curLesson?.steps.length ?? 0;
  }

  isLessonDone(lessonId) {
    return this.doneLessons.has(lessonId);
  }

  progress() {
    const done  = this.doneLessons.size;
    const total = this.allLessons.length;
    return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
  }

  // ── localStorage ─────────────────────────────────────────────────

  _loadDone() {
    try {
      this.doneLessons = new Set(JSON.parse(localStorage.getItem('go_done_3d') || '[]'));
    } catch {
      this.doneLessons = new Set();
    }
  }

  _saveDone() {
    localStorage.setItem('go_done_3d', JSON.stringify([...this.doneLessons]));
  }

  // ── Ders tamamlama ───────────────────────────────────────────────

  _completeLesson() {
    this.doneLessons.add(this.curLesson.id);
    this._saveDone();

    const chap = this.currentChapter();
    const chapComplete = chap && chap.lessons.every(l => this.doneLessons.has(l.id));

    // Bir sonraki ders var mı?
    const idx = this.allLessons.findIndex(l => l.id === this.curLesson.id);
    const nextLesson = this.allLessons[idx + 1] || null;

    return {
      type: 'LESSON_COMPLETE',
      lessonId: this.curLesson.id,
      chapComplete,
      chapTitle: chap?.title || '',
      nextLesson,
      progress: this.progress(),
    };
  }

  _currentState() {
    const step  = this.currentStep();
    const chap  = this.currentChapter();
    return {
      type: 'STEP_LOADED',
      lesson:       this.curLesson,
      chapter:      chap,
      stepIdx:      this.curStepIdx,
      step,
      stepDone:     this.stepDone,
      isFirst:      this.isFirstStep(),
      isLast:       this.isLastStep(),
      canAdvance:   this.canAdvance(),
      totalSteps:   this.totalSteps(),
      progress:     this.progress(),
      doneLessons:  [...this.doneLessons],
    };
  }
}
