/** Müfredat adımlarını öğrenme amacı ve ölçme bağlamına göre sınıflandırır. */

const CONCEPT_RULES = [
  ['liberty', /nefes|özgürlük|libert/i],
  ['capture', /yakala|taş alma|esir/i],
  ['atari', /atari/i],
  ['connection', /bağla|bağlantı|kesme|kesil/i],
  ['life_and_death', /canlı|ölü|iki göz|sahte göz|gerçek göz/i],
  ['ko', /\bko\b/i],
  ['forbidden_move', /yasak|intihar|öz[- ]?yakalama/i],
  ['ladder', /merdiven|shicho/i],
  ['net', /\bağ\b|geta/i],
  ['snapback', /snapback|geri çekme/i],
  ['territory', /bölge|sayım|puan/i],
  ['opening', /açılış|fuseki|hoshi|komoku|san-san/i],
  ['endgame', /son oyun|yose|sente|gote/i],
  ['shape', /şekil|kaplan ağzı/i],
];

export function stripMarkup(value = '') {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isAssessmentLesson(lessonOrId) {
  const id = typeof lessonOrId === 'string' ? lessonOrId : lessonOrId?.id;
  return (id || '').endsWith('_deg');
}

export function responseTypeOf(step) {
  if (step?.miniQuestion) return 'choice';
  if (step?.answer || step?.answers || step?.goalZone || step?.goalAdjacent) return 'board_move';
  if (step?.moves?.length) return 'sequence_observation';
  if (step?.pedagogy) return 'exploration';
  return 'passive';
}

export function isScorableStep(step) {
  return ['choice', 'board_move'].includes(responseTypeOf(step));
}

export function difficultyOf(step) {
  if (Number.isInteger(step?.difficulty)) return Math.min(4, Math.max(1, step.difficulty));
  const stars = (stripMarkup(step?.text).match(/★+/) || [''])[0].length;
  return stars ? Math.min(4, stars) : 1;
}

export function conceptsOf(step) {
  if (Array.isArray(step?.concepts) && step.concepts.length) return [...new Set(step.concepts)];
  const text = [step?.text, step?.miniQuestion?.text, step?.fb?.t].map(stripMarkup).join(' ');
  const concepts = CONCEPT_RULES.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
  return concepts.length ? concepts : ['general_go'];
}

export function classifyCurriculumStep({ chapter, lesson, step, stepIndex }) {
  const assessment = isAssessmentLesson(lesson);
  const responseType = responseTypeOf(step);
  const prompt = stripMarkup(step?.miniQuestion?.text || step?.text);
  let stage = 'instruction';
  if (assessment) stage = isScorableStep(step) ? 'assessment' : 'assessment_explanation';
  else if (step?.pedagogy) stage = 'guided_practice';
  else if (isScorableStep(step) && /alıştırma|uygulama/i.test(prompt)) stage = 'variable_practice';
  else if (isScorableStep(step)) stage = 'guided_practice';
  else if (step?.moves?.length) stage = 'worked_example';

  return {
    id: (lesson?.id || 'lesson') + ':' + stepIndex,
    chapterId: chapter?.id || null,
    lessonId: lesson?.id || null,
    stepIndex,
    stage,
    responseType,
    difficulty: difficultyOf(step),
    concepts: conceptsOf(step),
    prompt,
    scorable: isScorableStep(step),
  };
}

export function buildAssessmentBlueprint(lesson, chapter = null) {
  if (!isAssessmentLesson(lesson)) return [];
  return (lesson.steps || [])
    .map((step, stepIndex) => classifyCurriculumStep({ chapter, lesson, step, stepIndex }))
    .filter(item => item.scorable);
}

export function summarizeAssessmentResponses(blueprint, responses) {
  const rows = blueprint.map(item => ({ ...item, response: responses.get(item.id) || null }));
  const expected = rows.length;
  const answered = rows.filter(row => row.response).length;
  const correct = rows.filter(row => row.response?.correct).length;
  const rawPct = expected ? Math.round(correct / expected * 100) : 0;
  const totalWeight = rows.reduce((sum, row) => sum + row.difficulty, 0) || 1;
  const earnedWeight = rows.reduce((sum, row) => sum + (row.response?.correct ? row.difficulty : 0), 0);
  const weightedPct = Math.round(earnedWeight / totalWeight * 100);

  const conceptMap = new Map();
  for (const row of rows) for (const concept of row.concepts) {
    const stat = conceptMap.get(concept) || { concept, total: 0, answered: 0, correct: 0 };
    stat.total++;
    if (row.response) stat.answered++;
    if (row.response?.correct) stat.correct++;
    conceptMap.set(concept, stat);
  }
  const concepts = [...conceptMap.values()].map(stat => {
    const pct = Math.round(stat.correct / stat.total * 100);
    return { ...stat, pct, status: pct >= 80 ? 'strong' : pct >= 60 ? 'developing' : 'gap' };
  }).sort((a, b) => a.pct - b.pct || b.total - a.total);

  return {
    correct,
    total: expected,
    expected,
    answered,
    unanswered: expected - answered,
    pct: rawPct,
    weightedPct,
    level: weightedPct >= 80 ? 'pass' : weightedPct >= 60 ? 'partial' : 'retry',
    concepts,
    gaps: concepts.filter(item => item.status === 'gap').map(item => item.concept),
    strengths: concepts.filter(item => item.status === 'strong').map(item => item.concept),
  };
}

export function auditCurriculum(curriculum) {
  const items = [];
  const issues = [];
  for (const chapter of curriculum || []) for (const lesson of chapter.lessons || []) {
    for (const [stepIndex, step] of (lesson.steps || []).entries()) {
      const item = classifyCurriculumStep({ chapter, lesson, step, stepIndex });
      items.push(item);
      const prompt = item.prompt;
      if (!isAssessmentLesson(lesson) && item.scorable && (/\b[A-T][1-9]\b/.test(prompt) || /noktasına tıkla/i.test(prompt))) {
        issues.push({ type: 'answer_leak', severity: 'warning', itemId: item.id });
      }
      if (item.scorable) {
        const correctOptions = step.miniQuestion?.options?.filter(option => option.correct) || [];
        const incorrectOptions = step.miniQuestion?.options?.filter(option => !option.correct) || [];
        const correctFeedback = !!(step.fb_ok || (correctOptions.length && correctOptions.every(option => option.feedback)));
        const incorrectFeedback = !!(step.fb_err || (incorrectOptions.length && incorrectOptions.every(option => option.feedback)));
        if (!correctFeedback) issues.push({ type: 'missing_correct_feedback', severity: 'warning', itemId: item.id });
        if (!incorrectFeedback) issues.push({ type: 'missing_incorrect_feedback', severity: 'warning', itemId: item.id });
      }
    }
  }
  const count = stage => items.filter(item => item.stage === stage).length;
  return {
    summary: {
      chapters: (curriculum || []).length,
      lessons: (curriculum || []).flatMap(chapter => chapter.lessons || []).length,
      steps: items.length,
      instruction: count('instruction'),
      workedExamples: count('worked_example'),
      guidedPractice: count('guided_practice'),
      variablePractice: count('variable_practice'),
      assessment: count('assessment'),
      assessmentExplanations: count('assessment_explanation'),
    },
    items,
    issues,
  };
}
