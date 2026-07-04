import { CURRICULUM } from '../core/curriculum.js';
import { LessonEngine } from '../core/lessonEngine.js';
import {
  auditCurriculum,
  buildAssessmentBlueprint,
  classifyCurriculumStep,
  summarizeAssessmentResponses,
} from '../core/learningContext.js';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (error) {
    console.error('  ✗', name, '-', error.message);
    failed++;
  }
}
function ok(value, message = 'assertion failed') {
  if (!value) throw new Error(message);
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message || ('expected ' + expected + ', got ' + actual));
}

const audit = auditCurriculum(CURRICULUM);

test('müfredatın tamamı sınıflandırılır', () => {
  equal(audit.summary.chapters, 3);
  equal(audit.summary.lessons, 18);
  equal(audit.summary.steps, 109);
  equal(audit.items.length, 109);
});

test('uygulama ve değerlendirme adımları ayrıdır', () => {
  ok(audit.summary.guidedPractice > 0);
  ok(audit.summary.variablePractice > 0);
  equal(audit.summary.assessment, 36);
  equal(audit.summary.assessmentExplanations, 0);
});

test('bağlam kavramları çıkarılır', () => {
  const lesson = CURRICULUM[0].lessons.find(item => item.id === 'l2');
  const context = classifyCurriculumStep({
    chapter: CURRICULUM[0],
    lesson,
    step: lesson.steps[5],
    stepIndex: 5,
  });
  ok(context.concepts.includes('capture'));
  ok(context.concepts.includes('atari'));
  equal(context.responseType, 'board_move');
});

test('değerlendirme açıklaması puan paydasına girmez', () => {
  const lesson = CURRICULUM[1].lessons.find(item => item.id === 'l2_deg');
  const blueprint = buildAssessmentBlueprint(lesson, CURRICULUM[1]);
  equal(lesson.steps.length, 12);
  equal(blueprint.length, 12);
});

test('eksik cevap başarı oranını şişirmez', () => {
  const lesson = CURRICULUM[0].lessons.find(item => item.id === 'l1_deg');
  const blueprint = buildAssessmentBlueprint(lesson, CURRICULUM[0]);
  const responses = new Map([[blueprint[0].id, { correct: true }]]);
  const result = summarizeAssessmentResponses(blueprint, responses);
  equal(result.correct, 1);
  equal(result.answered, 1);
  equal(result.total, 12);
  equal(result.unanswered, 11);
  ok(result.pct < 10);
});

test('zorluk ağırlığı sonuç seviyesine yansır', () => {
  const blueprint = [
    { id: 'x:0', difficulty: 1, concepts: ['liberty'] },
    { id: 'x:1', difficulty: 4, concepts: ['capture'] },
  ];
  const responses = new Map([
    ['x:0', { correct: true }],
    ['x:1', { correct: false }],
  ]);
  const result = summarizeAssessmentResponses(blueprint, responses);
  equal(result.pct, 50);
  equal(result.weightedPct, 20);
  equal(result.level, 'retry');
  ok(result.gaps.includes('capture'));
  ok(result.strengths.includes('liberty'));
});

test('aynı soru iki kez puanlanmaz', () => {
  const engine = new LessonEngine(CURRICULUM);
  engine.loadLesson('l1_deg');
  equal(engine.recordDegAnswer(true), true);
  equal(engine.recordDegAnswer(true), false);
  const result = engine.getDegResult();
  equal(result.answered, 1);
  equal(result.correct, 1);
  equal(result.total, 12);
});

test('değerlendirme yeniden açılınca oturum sıfırlanır', () => {
  const engine = new LessonEngine(CURRICULUM);
  engine.loadLesson('l1_deg');
  engine.recordDegAnswer(true);
  engine.loadLesson('l1_deg');
  const result = engine.getDegResult();
  equal(result.answered, 0);
  equal(result.correct, 0);
});

test('kalite denetimi s?n?flar? ayr??t?r?r', () => {
  const types = new Set(audit.issues.map(issue => issue.type));
  ok(types.has('intentional_scaffold'));
  ok(types.has('coordinate_reference'));
  equal(audit.summary.answerLeaks, 0);
  equal(audit.summary.intentionalScaffolds, 9);
  equal(audit.summary.coordinateReferences, 3);
});

function synthCurriculum(lesson) {
  return [{ id: 'c1', title: 'Sentetik', lessons: [lesson] }];
}

test('i?aretsiz guided-practice s?z?nt?s? yakalan?r', () => {
  const audit = auditCurriculum(synthCurriculum({
    id: 'l1',
    title: 'Guided Leak',
    steps: [
      {
        text: '<p>Tahtada E4 noktas?na t?kla.</p>',
        answer: { x: 4, y: 4 },
        turn: 'black',
        fb: { t: 'x', c: 'info' },
        fb_ok: 'ok',
        fb_err: 'err',
      },
    ],
  }));
  ok(audit.issues.some(issue => issue.type === 'answer_leak'));
  ok(!audit.issues.some(issue => issue.type === 'intentional_scaffold'));
});

test('i?aretli direct guidance scaffold olarak raporlan?r', () => {
  const audit = auditCurriculum(synthCurriculum({
    id: 'l2',
    title: 'Guided Scaffold',
    steps: [
      {
        text: '<p>Tahtada E4 noktas?na t?kla.</p>',
        answer: { x: 4, y: 4 },
        turn: 'black',
        guidanceLevel: 'direct',
        fb: { t: 'x', c: 'info' },
        fb_ok: 'ok',
        fb_err: 'err',
      },
    ],
  }));
  ok(audit.issues.some(issue => issue.type === 'intentional_scaffold'));
  ok(!audit.issues.some(issue => issue.type === 'answer_leak'));
});

test('i?aretli constrained guidance scaffold olarak raporlan?r', () => {
  const audit = auditCurriculum(synthCurriculum({
    id: 'l5',
    title: 'Constrained Scaffold',
    steps: [
      {
        text: '<p>Tahtada E4 noktas?na t?kla.</p>',
        answer: { x: 4, y: 4 },
        turn: 'black',
        guidanceLevel: 'constrained',
        fb: { t: 'x', c: 'info' },
        fb_ok: 'ok',
        fb_err: 'err',
      },
    ],
  }));
  ok(audit.issues.some(issue => issue.type === 'intentional_scaffold'));
  ok(!audit.issues.some(issue => issue.type === 'answer_leak'));
});

test('de?erlendirme koordinat s?z?nt?s? yakalan?r', () => {
  const audit = auditCurriculum(synthCurriculum({
    id: 'l3_deg',
    title: 'Assessment Leak',
    steps: [
      {
        text: '<p>De?erlendirme sorusu: D5 noktas?na t?kla.</p>',
        answer: { x: 3, y: 4 },
        turn: 'black',
        fb: { t: 'x', c: 'info' },
        fb_ok: 'ok',
        fb_err: 'err',
      },
    ],
  }));
  ok(audit.issues.some(issue => issue.type === 'answer_leak'));
});

test('boolean/choice soruda koordinat referans? answer leak say?lmaz', () => {
  const audit = auditCurriculum(synthCurriculum({
    id: 'l4',
    title: 'Choice Reference',
    steps: [
      {
        text: "<p>D5'e (3,4) oynamak snapback midir?</p>",
        miniQuestion: {
          text: "D5'e (3,4) oynamak snapback midir?",
          options: [
            { text: 'Evet', correct: true, feedback: 'Do?ru.' },
            { text: 'Hay?r', correct: false, feedback: 'Yanl??.' },
          ],
        },
        fb: { t: 'x', c: 'info' },
      },
    ],
  }));
  ok(audit.issues.some(issue => issue.type === 'coordinate_reference'));
  ok(!audit.issues.some(issue => issue.type === 'answer_leak'));
});

console.log('\nToplam: ' + (passed + failed) + '  ? ' + passed + '  ? ' + failed);
if (failed) process.exit(1);
