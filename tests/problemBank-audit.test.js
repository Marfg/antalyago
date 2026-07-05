import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditProblemBank, buildTaxonomy } from '../scripts/problem-bank/audit.mjs';
import { CURRICULUM } from '../core/curriculum.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log('  ✓', name);
      passed++;
    })
    .catch(error => {
      console.error('  ✗', name, '-', error.message);
      failed++;
    });
}

function ok(value, message = 'assertion failed') {
  if (!value) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${expected}, got ${actual}`);
  }
}

function baseProblem(id, overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    id,
    title: 'Problem',
    curriculum: { chapter: 'B1', lesson: 'l2', node: 'practice' },
    stage: 'variable_practice',
    interactionType: 'numeric_count',
    concepts: ['liberty'],
    board: {
      size: 9,
      toPlay: 'B',
      stones: [{ color: 'W', x: 0, y: 0 }],
      markers: [],
    },
    question: {
      prompt: 'Köşedeki beyaz taşın kaç nefes noktası var?',
      options: [
        { text: '2', correct: true, feedback: 'Doğru.' },
        { text: '3', correct: false, feedback: 'Yanlış.' },
      ],
    },
    solution: { terminalChecks: ['liberty_count:2'] },
    difficulty: { authorLevel: 1, estimated: 0.1, calibrated: null },
    rights: { status: 'original' },
    source: { documentId: 'doc-1', page: 1, usage: 'concept_reference' },
    ...overrides,
  };
}

async function writeBank(rootDir, problems, indexEntries = null) {
  const bankDir = path.join(rootDir, 'content/problem-bank');
  const problemDir = path.join(bankDir, 'problems');
  await fs.mkdir(problemDir, { recursive: true });
  const entries = indexEntries || problems.map(problem => ({
    id: problem.id,
    path: `problems/${problem.id}.json`,
    status: 'verified',
    curriculum: problem.curriculum,
    stage: problem.stage,
    interactionType: problem.interactionType,
    concepts: problem.concepts,
    difficulty: problem.difficulty.authorLevel,
  }));
  await fs.writeFile(path.join(bankDir, 'index.json'), JSON.stringify({ schemaVersion: '1.0.0', updatedAt: '2026-07-05', problems: entries }, null, 2), 'utf8');
  for (const [index, problem] of problems.entries()) {
    const targetPath = entries[index]?.path || `problems/${problem.id}.json`;
    await fs.writeFile(path.join(bankDir, targetPath), JSON.stringify(problem, null, 2), 'utf8');
  }
  return bankDir;
}

const repoRoot = path.resolve(import.meta.dirname, '..');

await test('mevcut problem bankası hatasız audit edilir', async () => {
  const report = await auditProblemBank({ rootDir: repoRoot });
  equal(report.summary.totalProblems, 3);
  equal(report.summary.errorCount, 0, report.issues.map(issue => `${issue.code}:${issue.message}`).join(' | '));
  equal(report.summary.rendererCompatibleCount, 3);
  equal(report.summary.answerLeakCount, 0);
  equal(report.summary.sourcePresentCount, 3);
  equal(report.summary.sourceTraceCount, 3);
  equal(report.summary.chapterCounts[0][0], 'B1');
  equal(report.summary.controlledSkillCounts.find(([k]) => k === 'atari')?.[1], 2);
  equal(report.summary.freeTagCounts.find(([k]) => k === 'corner')?.[1], 1);
});

await test('taksonomi kontrollü sözlükleri üretir', async () => {
  const taxonomy = buildTaxonomy({ curriculum: CURRICULUM, problems: [baseProblem('x-1')] });
  ok(taxonomy.chapters.some(chapter => chapter.id === 'c1'));
  ok(taxonomy.lessons.some(lesson => lesson.lessonId === 'l2'));
  ok(taxonomy.skills.includes('liberty'));
  ok(taxonomy.questionTypes.includes('capture_goal'));
  ok(taxonomy.sourceTypes.includes('pdf'));
  ok(taxonomy.publicationStatuses.includes('published'));
});

await test('duplicate ID hatasını üretir', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-dup-id-'));
  const a = baseProblem('dup-a', { id: 'dup-a' });
  const b = baseProblem('dup-b', { id: 'dup-b' });
  await writeBank(rootDir, [a, b], [
    { id: 'dup-a', path: 'problems/a.json', status: 'verified', curriculum: a.curriculum, stage: a.stage, interactionType: a.interactionType, concepts: a.concepts, difficulty: 1 },
    { id: 'dup-a', path: 'problems/b.json', status: 'verified', curriculum: b.curriculum, stage: b.stage, interactionType: b.interactionType, concepts: b.concepts, difficulty: 1 },
  ]);
  const report = await auditProblemBank({ rootDir });
  ok(report.issues.some(issue => issue.code === 'DUPLICATE_INDEX_ID'));
  ok(report.summary.errorCount >= 1);
});

await test('yasadışı çözüm hamlesi yakalanır', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-illegal-'));
  const problem = baseProblem('illegal', {
    stage: 'assessment',
    interactionType: 'capture_goal',
    board: {
      size: 9,
      toPlay: 'B',
      stones: [
        { color: 'W', x: 4, y: 4 },
        { color: 'B', x: 3, y: 4 },
      ],
      markers: [],
    },
    question: { prompt: 'Beyazı yakala.' },
    goal: { type: 'capture_group', targetGroup: [{ x: 4, y: 4 }], maxMoves: 1 },
    solution: { acceptedMoves: [{ x: 4, y: 4 }], terminalChecks: ['target_captured'] },
  });
  await writeBank(rootDir, [problem]);
  const report = await auditProblemBank({ rootDir });
  ok(report.issues.some(issue => issue.code === 'ILLEGAL_SOLUTION_MOVE'));
  equal(report.summary.errorCount > 0, true);
});

await test('kaynak bilgisi eksikliği raporlanır', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-source-'));
  const problem = baseProblem('missing-source', { source: undefined });
  await writeBank(rootDir, [problem]);
  const report = await auditProblemBank({ rootDir });
  ok(report.issues.some(issue => issue.code === 'SOURCE_TRACE_INCOMPLETE'));
  ok(report.summary.warningCount >= 1);
});

await test('cevap sızıntısı yakalanır, koordinat referansı yanlış pozitif olmaz', async () => {
  const leakRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-leak-'));
  const leakProblem = baseProblem('leak', {
    stage: 'assessment',
    interactionType: 'capture_goal',
    question: { prompt: "D5 noktasına tıkla." },
    board: {
      size: 9,
      toPlay: 'B',
      stones: [{ color: 'W', x: 4, y: 4 }],
      markers: [],
    },
    goal: { type: 'capture_group', targetGroup: [{ x: 4, y: 4 }], maxMoves: 1 },
    solution: { acceptedMoves: [{ x: 4, y: 5 }], terminalChecks: ['target_captured'] },
  });
  const refRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-ref-'));
  const refProblem = baseProblem('ref', {
    stage: 'assessment',
    interactionType: 'binary_judgement',
    question: {
      prompt: "D5 (3,4) snapback midir?",
      options: [
        { text: 'Evet', correct: true, feedback: 'Doğru.' },
        { text: 'Hayır', correct: false, feedback: 'Yanlış.' },
      ],
    },
  });
  await writeBank(leakRoot, [leakProblem]);
  await writeBank(refRoot, [refProblem]);
  const leakReport = await auditProblemBank({ rootDir: leakRoot });
  const refReport = await auditProblemBank({ rootDir: refRoot });
  ok(leakReport.issues.some(issue => issue.code === 'answer_leak'));
  ok(!refReport.issues.some(issue => issue.code === 'answer_leak'));
  ok(refReport.issues.some(issue => issue.code === 'coordinate_reference'));
});

await test('taş çakışması raporlanır', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-overlap-'));
  const problem = baseProblem('overlap', {
    board: {
      size: 9,
      toPlay: 'B',
      stones: [
        { color: 'W', x: 0, y: 0 },
        { color: 'B', x: 0, y: 0 },
      ],
      markers: [],
    },
  });
  await writeBank(rootDir, [problem]);
  const report = await auditProblemBank({ rootDir });
  ok(report.issues.some(issue => issue.code === 'STONE_OVERLAP'));
  ok(report.summary.errorCount >= 1);
});

await test('draft ve published kalite farkı korunur', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-bank-status-'));
  const draft = baseProblem('draft-a');
  const published = baseProblem('pub-a');
  await writeBank(rootDir, [draft, published], [
    { id: 'draft-a', path: 'problems/draft-a.json', status: 'draft', curriculum: draft.curriculum, stage: draft.stage, interactionType: draft.interactionType, concepts: draft.concepts, difficulty: 1 },
    { id: 'pub-a', path: 'problems/pub-a.json', status: 'published', curriculum: published.curriculum, stage: published.stage, interactionType: published.interactionType, concepts: published.concepts, difficulty: 1 },
  ]);
  const report = await auditProblemBank({ rootDir });
  const draftIssues = report.issues.filter(issue => issue.problemId === 'draft-a');
  const publishedIssues = report.issues.filter(issue => issue.problemId === 'pub-a');
  ok(publishedIssues.some(issue => issue.code === 'PUBLISHED_METADATA_INCOMPLETE'));
  ok(publishedIssues.length > draftIssues.length);
});

await test('audit çıktısı deterministiktir', async () => {
  const reportA = await auditProblemBank({ rootDir: repoRoot });
  const reportB = await auditProblemBank({ rootDir: repoRoot });
  const scrub = report => {
    const clone = structuredClone(report);
    clone.generatedAt = 'STATIC';
    return JSON.stringify(clone);
  };
  equal(scrub(reportA), scrub(reportB));
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
