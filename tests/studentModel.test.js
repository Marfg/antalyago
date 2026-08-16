/**
 * tests/studentModel.test.js
 * node tests/studentModel.test.js
 *
 * core/studentModel.js — saf, event-driven, tamamen deterministik
 * Student Model reducer. Bu testlerin asıl amacı: LLM'nin hiç
 * karışmadığı, yalnızca gerçek semantic event'lerden türeyen bir
 * öğrenme özetinin doğru hesaplandığını kanıtlamak.
 */

import {
  createStudentModel, applyStudentEvent, getConceptState,
  hydrateStudentModel, computeStatus, STUDENT_MODEL_VERSION, RECENT_WINDOW,
} from '../core/studentModel.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(value, message = 'assertion failed') { if (!value) throw new Error(message); }
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Yardımcı event kurucular (gerçek core/teacherPanelBridge.js /
// core/teacherAssistant.js şeklini birebir yansıtır) ─────────────────

function answerEvent(concept, result, extra = {}) {
  return { type: 'answer_evaluated', lessonId: 'l3', stepId: 'l3:0', payload: { result, concept }, ...extra };
}
function hintEvent() {
  return { type: 'ai_teacher_responded', lessonId: 'l3', stepId: 'l3:0', payload: { action: 'give_hint', hintLevel: 1 } };
}
function sayEvent() {
  return { type: 'ai_teacher_responded', lessonId: 'l3', stepId: 'l3:0', payload: { action: 'say', hintLevel: null } };
}
function toolAppliedEvent() {
  return { type: 'teacher_tool_applied', lessonId: 'l3', stepId: 'l3:0', payload: { tool: 'show_liberties', effect: 'SHOW_LIBERTY_HIGHLIGHTS', targetCount: 1 } };
}
function manualLibertiesEvent() {
  // Manuel Teacher Panel "Nefes noktalarını göster" butonunun ürettiği
  // GERÇEK event tipi — teacher_tool_applied DEĞİL.
  return { type: 'teacher_show_liberties_requested', lessonId: 'l3', stepId: 'l3:0', payload: {} };
}
function manualHintEvent() {
  return { type: 'teacher_hint_requested', lessonId: 'l3', stepId: 'l3:0', payload: {} };
}
function stepLoadedEvent() {
  return { type: 'lesson_step_loaded', lessonId: 'l3', stepId: 'l3:1', payload: {} };
}

function apply(model, ...events) {
  let m = model;
  const allDerived = [];
  for (const e of events) {
    const { model: next, derivedEvents } = applyStudentEvent(m, e);
    m = next;
    allDerived.push(...derivedEvents);
  }
  return { model: m, derived: allDerived };
}

// ── Model creation ────────────────────────────────────────────────────

test('createStudentModel: version doğru, tüm concept\'ler not_started', () => {
  const model = createStudentModel();
  equal(model.version, STUDENT_MODEL_VERSION);
  for (const concept of ['stone_placement', 'liberty', 'atari', 'capture']) {
    equal(getConceptState(model, concept).status, 'not_started');
    equal(getConceptState(model, concept).attempts, 0);
  }
  equal(model.currentConcept, null);
});

// ── Correct / incorrect ──────────────────────────────────────────────

test('correct event: correct/attempts artar', () => {
  const { model } = apply(createStudentModel(), answerEvent('capture', 'correct'));
  const s = getConceptState(model, 'capture');
  equal(s.attempts, 1);
  equal(s.correct, 1);
  equal(s.incorrect, 0);
});

test('incorrect event: incorrect/attempts artar', () => {
  const { model } = apply(createStudentModel(), answerEvent('capture', 'incorrect'));
  const s = getConceptState(model, 'capture');
  equal(s.attempts, 1);
  equal(s.incorrect, 1);
  equal(s.correct, 0);
});

test('yalnız ilgili concept güncellenir, diğerleri değişmez', () => {
  const { model } = apply(createStudentModel(), answerEvent('liberty', 'correct'));
  equal(getConceptState(model, 'liberty').attempts, 1);
  equal(getConceptState(model, 'capture').attempts, 0);
  equal(model.currentConcept, 'liberty');
});

// ── Independent correct ──────────────────────────────────────────────

test('independentCorrect: yardım yok + correct → artar', () => {
  const { model } = apply(createStudentModel(), answerEvent('capture', 'correct'));
  equal(getConceptState(model, 'capture').independentCorrect, 1);
});

test('independentCorrect: hint sonrası correct → ARTMAZ', () => {
  const { model } = apply(
    createStudentModel(),
    answerEvent('capture', 'incorrect'),
    hintEvent(),
    answerEvent('capture', 'correct'),
  );
  const s = getConceptState(model, 'capture');
  equal(s.correct, 1, 'correct yine de sayılmalı');
  equal(s.independentCorrect, 0, 'hint kullanıldığı için bağımsız SAYILMAMALI');
});

test('independentCorrect: show_liberties (teacher_tool_applied) sonrası correct → ARTMAZ', () => {
  const { model } = apply(
    createStudentModel(),
    answerEvent('capture', 'incorrect'),
    answerEvent('capture', 'incorrect'),
    toolAppliedEvent(),
    answerEvent('capture', 'correct'),
  );
  const s = getConceptState(model, 'capture');
  equal(s.correct, 1);
  equal(s.independentCorrect, 0);
});

test('independentCorrect: aynı step\'te ÖNCEKİ yanlış denemede alınan yardım hâlâ geçerli sayılır', () => {
  // attempt1: yanlış + hint. attempt2: yanlış (hint YOK bu sefer, ama
  // session.hintUsed hâlâ true). attempt3: doğru → independentCorrect
  // yine ARTMAMALI çünkü bu step'te en az bir kez yardım alındı.
  const { model } = apply(
    createStudentModel(),
    answerEvent('capture', 'incorrect'),
    hintEvent(),
    answerEvent('capture', 'incorrect'),
    answerEvent('capture', 'correct'),
  );
  equal(getConceptState(model, 'capture').independentCorrect, 0);
});

// ── Assistance ────────────────────────────────────────────────────────

test('AI tool assist (teacher_tool_applied) doğru concept\'e (currentConcept) yazılır', () => {
  const { model } = apply(createStudentModel(), answerEvent('atari', 'incorrect'), toolAppliedEvent());
  equal(getConceptState(model, 'atari').toolAssists, 1);
});

test('manuel debug tool (teacher_show_liberties_requested) öğrenci modeline HİÇ yazılmaz', () => {
  const { model } = apply(createStudentModel(), answerEvent('atari', 'incorrect'), manualLibertiesEvent());
  equal(getConceptState(model, 'atari').toolAssists, 0);
});

test('manuel debug hint (teacher_hint_requested) öğrenci modeline HİÇ yazılmaz', () => {
  const { model } = apply(createStudentModel(), answerEvent('liberty', 'incorrect'), manualHintEvent());
  equal(getConceptState(model, 'liberty').hintsUsed, 0);
});

test('"say" action\'ı hint olarak SAYILMAZ (yalnız give_hint sayılır)', () => {
  const { model } = apply(createStudentModel(), answerEvent('capture', 'correct'), sayEvent());
  equal(getConceptState(model, 'capture').hintsUsed, 0);
});

test('aynı step içinde tekrar tekrar hint uygulansa bile hintsUsed yalnız BİR artar', () => {
  const { model } = apply(
    createStudentModel(),
    answerEvent('capture', 'incorrect'),
    hintEvent(),
    answerEvent('capture', 'incorrect'),
    hintEvent(), // ikinci hint — aynı step
  );
  equal(getConceptState(model, 'capture').hintsUsed, 1, 'step başına bir kez sayılmalı');
});

test('lesson_step_loaded sonrası YENİ step\'te hint tekrar sayılabilir', () => {
  const { model } = apply(
    createStudentModel(),
    answerEvent('capture', 'incorrect'),
    hintEvent(),
    stepLoadedEvent(), // yeni step → session sıfırlanır
    answerEvent('capture', 'incorrect'),
    hintEvent(),
  );
  equal(getConceptState(model, 'capture').hintsUsed, 2, 'her step kendi hint sayımını hak eder');
});

// ── Recent accuracy ───────────────────────────────────────────────────

test(`recentAccuracy: pencere limiti (${RECENT_WINDOW}) çalışır, eski event'ler düşer`, () => {
  const events = [
    answerEvent('liberty', 'incorrect'), // düşecek
    answerEvent('liberty', 'incorrect'), // düşecek
    answerEvent('liberty', 'correct'),
    answerEvent('liberty', 'correct'),
    answerEvent('liberty', 'correct'),
    answerEvent('liberty', 'incorrect'),
  ];
  const { model } = apply(createStudentModel(), ...events);
  const s = getConceptState(model, 'liberty');
  equal(s.attempts, 6, 'toplam attempts pencereden ETKİLENMEMELİ');
  equal(s.recentResults.length, RECENT_WINDOW);
  // son 5: correct, correct, correct, incorrect + ilk incorrect'in biri düştü
  // sıralama: [incorrect(düştü), incorrect, correct, correct, correct, incorrect]
  // son 5 = [incorrect, correct, correct, correct, incorrect] → 3/5 = 0.6
  equal(s.recentAccuracy, 0.6);
});

test('recentAccuracy oranı doğru hesaplanır (tam pencere, hepsi doğru)', () => {
  const events = Array.from({ length: RECENT_WINDOW }, () => answerEvent('liberty', 'correct'));
  const { model } = apply(createStudentModel(), ...events);
  equal(getConceptState(model, 'liberty').recentAccuracy, 1);
});

test('recentAccuracy: hint/tool assist doğrudan karıştırılmaz, yalnız answer_evaluated etkiler', () => {
  const { model } = apply(
    createStudentModel(),
    answerEvent('capture', 'correct'),
    hintEvent(), // recentResults'a EKLENMEMELİ
  );
  equal(getConceptState(model, 'capture').recentResults.length, 1);
});

// ── Status eşikleri ───────────────────────────────────────────────────

test('computeStatus: attempts=0 → not_started', () => {
  equal(computeStatus({ attempts: 0, independentCorrect: 0, recentAccuracy: 0, hintsUsed: 0, toolAssists: 0 }), 'not_started');
});

test('computeStatus: attempts>0, independentCorrect<2 → learning', () => {
  equal(computeStatus({ attempts: 1, independentCorrect: 0, recentAccuracy: 1, hintsUsed: 0, toolAssists: 0 }), 'learning');
  equal(computeStatus({ attempts: 3, independentCorrect: 1, recentAccuracy: 0.9, hintsUsed: 0, toolAssists: 0 }), 'learning');
});

test('computeStatus: independentCorrect>=2 ve recentAccuracy>=0.60 → provisional', () => {
  equal(computeStatus({ attempts: 4, independentCorrect: 2, recentAccuracy: 0.6, hintsUsed: 1, toolAssists: 0 }), 'provisional');
});

test('computeStatus: independentCorrect>=4, recentAccuracy>=0.80, düşük yardım oranı → mastered', () => {
  equal(computeStatus({ attempts: 5, independentCorrect: 4, recentAccuracy: 0.8, hintsUsed: 0, toolAssists: 0 }), 'mastered');
});

test('computeStatus: eşikleri karşılasa bile yardım oranı YÜKSEKSE mastered OLMAZ (provisional\'a düşer)', () => {
  const stats = { attempts: 5, independentCorrect: 4, recentAccuracy: 0.9, hintsUsed: 3, toolAssists: 0 };
  equal(computeStatus(stats), 'provisional', 'assistRatio 3/5=0.6 > eşik(0.34), mastered olmamalı');
});

test('status geçişi: learning → provisional → mastered gerçek event akışında', () => {
  let model = createStudentModel();
  ({ model } = apply(model, answerEvent('atari', 'correct')));
  equal(getConceptState(model, 'atari').status, 'learning');

  ({ model } = apply(model, answerEvent('atari', 'correct')));
  equal(getConceptState(model, 'atari').status, 'provisional', 'independentCorrect=2, recentAccuracy=1.0');

  ({ model } = apply(model, answerEvent('atari', 'correct'), answerEvent('atari', 'correct')));
  equal(getConceptState(model, 'atari').status, 'mastered', 'independentCorrect=4, recentAccuracy=1.0, yardım yok');
});

test('status geri düşebilir: mastered iken tekrar tekrar yanlış yapılırsa provisional/learning\'e düşer', () => {
  let model = createStudentModel();
  for (let i = 0; i < 4; i++) ({ model } = apply(model, answerEvent('capture', 'correct')));
  equal(getConceptState(model, 'capture').status, 'mastered');

  // Art arda yanlışlar recentAccuracy'yi düşürür (pencere son 5'i tutar).
  ({ model } = apply(model, answerEvent('capture', 'incorrect'), answerEvent('capture', 'incorrect'), answerEvent('capture', 'incorrect')));
  const s = getConceptState(model, 'capture');
  ok(s.status !== 'mastered', 'kötü yakın dönem performansı sonrası mastered\'da KALMAMALI: ' + s.status);
});

test('concept_status_changed derived event doğru üretilir', () => {
  let model = createStudentModel();
  let derived;
  ({ model, derived } = apply(model, answerEvent('liberty', 'correct')));
  ok(derived.some(e => e.type === 'concept_status_changed' && e.payload.from === 'not_started' && e.payload.to === 'learning'));
});

test('status değişmiyorsa concept_status_changed ÜRETİLMEZ', () => {
  let model = createStudentModel();
  ({ model } = apply(model, answerEvent('liberty', 'incorrect'))); // not_started → learning (1 event)
  const { derived } = apply(model, answerEvent('liberty', 'incorrect')); // learning → learning (event YOK)
  equal(derived.length, 0);
});

// ── Persistence (hydrateStudentModel) ────────────────────────────────

test('hydrateStudentModel: null/geçersiz girdi → güvenli fallback (yeni model)', () => {
  const m1 = hydrateStudentModel(null);
  equal(m1.version, STUDENT_MODEL_VERSION);
  equal(getConceptState(m1, 'capture').status, 'not_started');

  const m2 = hydrateStudentModel('bozuk string');
  equal(m2.version, STUDENT_MODEL_VERSION);

  const m3 = hydrateStudentModel(42);
  equal(m3.version, STUDENT_MODEL_VERSION);
});

test('hydrateStudentModel: bilinmeyen/eski version → güvenli fallback', () => {
  const m = hydrateStudentModel({ version: 999, concepts: { capture: { attempts: 5 } } });
  equal(m.version, STUDENT_MODEL_VERSION);
  equal(getConceptState(m, 'capture').attempts, 0, 'eski versiyon verisi KULLANILMAMALI');
});

test('hydrateStudentModel: geçerli, doğru versiyonlu veri sadakatle yüklenir', () => {
  const { model: saved } = apply(createStudentModel(), answerEvent('capture', 'correct'), answerEvent('capture', 'incorrect'));
  const raw = JSON.parse(JSON.stringify({ version: saved.version, currentConcept: saved.currentConcept, concepts: saved.concepts }));
  const loaded = hydrateStudentModel(raw);
  equal(getConceptState(loaded, 'capture').attempts, 2);
  equal(getConceptState(loaded, 'capture').correct, 1);
  equal(loaded.currentConcept, 'capture');
});

test('hydrateStudentModel: session ASLA persist edilmiş veriden okunmaz — her zaman temiz', () => {
  const loaded = hydrateStudentModel({ version: STUDENT_MODEL_VERSION, concepts: {}, session: { hintUsed: true, toolAssistUsed: true } });
  equal(loaded.session.hintUsed, false);
  equal(loaded.session.toolAssistUsed, false);
});

test('hydrateStudentModel: eksik concept anahtarları varsayılanla doldurulur (KNOWN_CONCEPTS genişlerse güvenli)', () => {
  const loaded = hydrateStudentModel({ version: STUDENT_MODEL_VERSION, concepts: { capture: { attempts: 3, correct: 2, incorrect: 1, independentCorrect: 1, hintsUsed: 0, toolAssists: 0, recentResults: ['correct'] } } });
  equal(getConceptState(loaded, 'capture').attempts, 3);
  equal(getConceptState(loaded, 'liberty').attempts, 0, 'eksik concept boş başlamalı, hata vermemeli');
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
