import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateDocument } from '../../studio/model/validation.js';
import { buildStudioDocument, validateCandidateId } from './candidate-studio-adapter.mjs';
import {
  ROOT as BANK_ROOT,
  auditCandidateCatalog,
  normalizeCandidate,
  validateCandidate,
} from './candidates.mjs';

const ROOT = BANK_ROOT;
const SAFE_FILE_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPORTS_DIR = path.join(ROOT, 'content/problem-bank/candidates/reports');
const PROBLEM_DIR = path.join(ROOT, 'content/problem-bank/problems');

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return String(value ?? '').trim();
}

function sha256(textValue) {
  return crypto.createHash('sha256').update(textValue, 'utf8').digest('hex');
}

function normalizeJsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function candidateIdFromArgs(args) {
  const idx = args.findIndex(argument => argument === '--id' || argument === '--candidate');
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function outputPathFromArgs(args) {
  const idx = args.indexOf('--output');
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function validateSafeId(candidateId) {
  return typeof candidateId === 'string' && SAFE_FILE_NAME_RE.test(candidateId);
}

function resolveOutputPath(outputPath, candidateId, { defaultFileName = 'review-report.json' } = {}) {
  if (!outputPath) return null;
  const absolute = path.isAbsolute(outputPath) ? outputPath : path.join(ROOT, outputPath);
  if (path.extname(absolute).toLowerCase() === '.json') {
    return absolute;
  }
  if (candidateId) {
    return path.join(absolute, `${candidateId}.${defaultFileName}`);
  }
  return path.join(absolute, defaultFileName);
}

function cleanCandidateSource(candidate) {
  const normalized = normalizeCandidate(candidate);
  return {
    sourceId: normalized.source?.sourceId ?? '',
    locator: {
      type: normalized.source?.locator?.type ?? 'unresolved',
      value: normalized.source?.locator?.value ?? 'unresolved',
    },
    usage: normalized.source?.usage ?? 'concept_reference',
  };
}

function classifyRightsStatus(candidate, catalogSource) {
  const rights = candidate?.rights ?? {};
  const sourceRights = catalogSource?.rights ?? {};

  if (rights.canPublish === true && rights.needsRightsReview === false) {
    return 'publishable';
  }
  if (sourceRights.licenseStatus === 'permission-required') {
    return 'permission-required';
  }
  if (sourceRights.licenseStatus === 'permission-granted-noncommercial') {
    return 'noncommercial-only';
  }
  if (sourceRights.distributionAllowed === false || rights.needsRightsReview === true) {
    return 'review-required';
  }
  return 'restricted';
}

function detectAnswerLeak(candidate) {
  const expected = candidate?.task?.expectedAnswer;
  const answerText = typeof expected === 'string'
    ? expected.trim()
    : expected !== null && expected !== undefined
      ? String(expected).trim()
      : '';
  if (!answerText) {
    return { level: 'none', signals: [] };
  }

  const haystacks = [
    candidate?.task?.prompt,
    candidate?.extraction?.notes,
    candidate?.review?.checklist?.join(' '),
    candidate?.feedback?.initial,
    candidate?.feedback?.correct,
    candidate?.feedback?.incorrect,
    JSON.stringify(candidate?.hints ?? []),
  ].map(text).filter(Boolean);

  const signals = [];
  for (const haystack of haystacks) {
    if (haystack.includes(answerText)) {
      signals.push('expected-answer-mentioned');
      break;
    }
  }

  return {
    level: signals.length > 0 ? 'low' : 'none',
    signals,
  };
}

function validateBoard(candidate) {
  const board = candidate?.board ?? {};
  const size = board.size;
  const stones = Array.isArray(board.initialStones) ? board.initialStones : [];
  const markers = Array.isArray(board.markers) ? board.markers : [];
  const sizeValid = Number.isInteger(size) && size >= 5;

  const inBounds = point => sizeValid && Number.isInteger(point?.x) && Number.isInteger(point?.y) && point.x >= 0 && point.y >= 0 && point.x < size && point.y < size;
  const stonesValid = sizeValid
    && stones.every(stone => ['black', 'white'].includes(stone?.color) && inBounds(stone))
    && new Set(stones.map(stone => `${stone.x},${stone.y}`)).size === stones.length;
  const markersValid = sizeValid
    && markers.every(marker => inBounds(marker))
    && new Set(markers.map(marker => `${marker.x},${marker.y}`)).size === markers.length;

  const issues = [];
  if (!sizeValid) issues.push({ code: 'INVALID_BOARD_SIZE', message: 'board.size geçersiz.' });
  if (!stonesValid) issues.push({ code: 'INVALID_INITIAL_STONES', message: 'board.initialStones geçersiz.' });
  if (!markersValid) issues.push({ code: 'INVALID_MARKERS', message: 'board.markers geçersiz.' });

  return {
    size,
    sizeValid,
    initialStonesValid: stonesValid,
    markersValid,
    koTurnMoveLegality: 'not-applicable',
    valid: issues.length === 0,
    issues,
  };
}

function validateTask(candidate) {
  const task = candidate?.task ?? {};
  const expectedAnswer = task.expectedAnswer;
  const prompt = text(task.prompt);
  const hasPrompt = Boolean(prompt);
  const hasAnswer = expectedAnswer !== null && expectedAnswer !== undefined && text(expectedAnswer) !== '';
  let answerTypeValid = false;

  switch (task.type) {
    case 'numeric_count':
    case 'count':
      answerTypeValid = hasAnswer && /^\d+$/.test(text(expectedAnswer));
      break;
    case 'sequence':
      answerTypeValid = Array.isArray(expectedAnswer) || hasAnswer;
      break;
    case 'binary_judgement':
      answerTypeValid = ['true', 'false', true, false].includes(expectedAnswer);
      break;
    default:
      answerTypeValid = hasAnswer;
      break;
  }

  const hasSolution = Boolean(task.solution || candidate?.solution || hasAnswer);
  const hasExplanation = Boolean(
    text(task.explanation)
    || text(candidate?.feedback?.correct)
    || text(candidate?.feedback?.initial)
    || text(candidate?.feedback?.incorrect)
  );
  const leak = detectAnswerLeak(candidate);

  const issues = [];
  if (!hasPrompt) issues.push({ code: 'MISSING_PROMPT', message: 'task.prompt zorunlu.' });
  if (!hasAnswer) issues.push({ code: 'MISSING_ANSWER', message: 'task.expectedAnswer zorunlu.' });
  if (!answerTypeValid) issues.push({ code: 'INVALID_ANSWER_TYPE', message: 'answer type geçersiz.' });
  if (leak.level !== 'none') issues.push({ code: 'ANSWER_LEAK_RISK', message: 'expected answer visible in task/supporting text.' });

  return {
    hasPrompt,
    hasAnswer,
    answerTypeValid,
    hasSolution,
    hasExplanation,
    answerLeakRisk: leak,
    valid: issues.length === 0 && leak.level === 'none',
    issues,
  };
}

function validatePedagogy(candidate) {
  const curriculum = candidate?.curriculum ?? {};
  const pedagogy = isObject(candidate?.pedagogy) ? candidate.pedagogy : {};
  const tags = Array.isArray(curriculum.tags) ? curriculum.tags.filter(Boolean) : [];
  const skillMeaningful = Boolean(text(curriculum.section) && text(curriculum.lesson) && text(curriculum.skill));
  const useCase = text(pedagogy.useCase);
  const difficulty = text(pedagogy.difficulty);
  const reviewDecision = text(pedagogy.reviewDecision);
  const reviewNotes = text(pedagogy.reviewNotes);
  const difficultyPresent = Boolean(difficulty);
  const curriculumMatch = skillMeaningful;
  const problemTypeClear = Boolean(text(candidate?.task?.type));

  const warnings = [];
  if (!difficultyPresent) warnings.push('difficulty-missing');
  if (!tags.length) warnings.push('tags-empty');

  return {
    skillMeaningful,
    difficultyPresent,
    curriculumMatch,
    problemTypeClear,
    useCase,
    difficulty,
    reviewDecision,
    reviewNotes,
    warnings,
    valid: skillMeaningful && curriculumMatch && problemTypeClear,
  };
}

function validateStudioPreview(candidate) {
  const document = buildStudioDocument(candidate);
  const validation = validateDocument(document);
  const source = document.sources?.[0] ?? {};
  const sourceSafe = isObject(source)
    && Object.keys(source).length === 3
    && source.sourceId
    && source.locator
    && source.usage
    && !/[A-Za-z]:\\/.test(JSON.stringify(document))
    && !/\.pdf\b/i.test(JSON.stringify(document));

  const result = {
    valid: validation.valid && sourceSafe,
    documentValid: validation.valid,
    sourceSafe,
    errors: validation.errors,
    warnings: validation.warnings,
    leaks: {
      absolutePath: /[A-Za-z]:\\/.test(JSON.stringify(document)),
      pdfPath: /\.pdf\b/i.test(JSON.stringify(document)),
      licenseClaim: /license/i.test(JSON.stringify(document)) && !JSON.stringify(document).includes('sourceRightsSnapshot'),
    },
    source,
  };

  return { document, validation, result };
}

function buildCanonicalProblemPreview(candidate, catalogSource, reviewDecision) {
  const normalized = normalizeCandidate(candidate);
  const source = cleanCandidateSource(normalized);
  const stage = (() => {
    const type = text(normalized.task?.type);
    if (type === 'sequence') return 'guided_practice';
    if (type === 'numeric_count' || type === 'count' || type === 'construct' || type === 'save' || type === 'binary_judgement') return 'variable_practice';
    return 'assessment';
  })();
  const difficulty = {
    authorLevel: Number.isInteger(normalized.difficulty?.authorLevel) ? normalized.difficulty.authorLevel : 1,
    estimated: typeof normalized.extraction?.confidence === 'number' ? normalized.extraction.confidence : 0.5,
    calibrated: null,
  };
  const concepts = [...new Set([
    normalized.curriculum?.skill,
    ...(Array.isArray(normalized.curriculum?.tags) ? normalized.curriculum.tags : []),
  ].filter(Boolean))];

  return {
    schemaVersion: '1.1.0',
    id: normalized.candidateId,
    title: normalized.task?.prompt?.trim() || normalized.candidateId,
    status: reviewDecision.targetStatus,
    curriculum: {
      chapter: normalized.curriculum?.section || '',
      lesson: normalized.curriculum?.lesson || '',
      node: normalized.curriculum?.skill || 'candidate-review',
    },
    stage,
    interactionType: normalized.task?.type || 'numeric_count',
    concepts: concepts.length ? concepts : ['candidate'],
    source,
    board: {
      size: normalized.board?.size ?? 9,
      toPlay: 'B',
      stones: (normalized.board?.initialStones ?? []).map(stone => ({
        color: stone.color === 'white' ? 'W' : 'B',
        x: stone.x,
        y: stone.y,
      })),
      markers: (normalized.board?.markers ?? []).map(marker => ({
        x: marker.x,
        y: marker.y,
        type: 'label',
        label: marker.label,
      })),
    },
    question: {
      prompt: normalized.task?.prompt || '',
    },
    solution: {
      terminalChecks: normalized.task?.expectedAnswer !== undefined ? [`expected_answer:${normalized.task.expectedAnswer}`] : [],
    },
    difficulty,
    hints: [],
    feedback: {
      initial: normalized.task?.prompt || '',
    },
    variantPolicy: {
      rotate: false,
      mirror: false,
      swapColors: false,
      translate: false,
    },
    rights: {
      status: reviewDecision.rightsStatus === 'publishable' ? 'licensed' : 'review_required',
      notes: catalogSource?.rights?.rightsNote || 'Promotion preview produced from candidate review gate.',
    },
    revision: 1,
    migration: {
      legacyStatus: normalized.status,
    },
  };
}

function buildReportBase(candidate, catalogSource) {
  const normalized = normalizeCandidate(candidate);
  const source = cleanCandidateSource(normalized);
  const board = validateBoard(normalized);
  const task = validateTask(normalized);
  const pedagogy = validatePedagogy(normalized);
  const studio = validateStudioPreview(normalized);
  const sourceRightsSnapshot = catalogSource?.rights ?? normalized.rights?.sourceRightsSnapshot ?? {};
  const rightsStatus = classifyRightsStatus(normalized, catalogSource);
  const rightsWarnings = [];
  if (normalized.rights?.canPublish !== true) {
    rightsWarnings.push('rights.canPublish-false');
  }
  if (normalized.rights?.needsRightsReview !== false) {
    rightsWarnings.push('rights.needsRightsReview-true');
  }

    const blockingIssues = [
    ...board.issues,
    ...task.issues,
    ...(task.answerLeakRisk.level !== 'none' ? [{ code: 'ANSWER_LEAK_RISK', message: 'expected answer visible in task/supporting text.' }] : []),
    ...(pedagogy.valid ? [] : [{ code: 'PEDAGOGY_INVALID', message: 'curriculum/skill metadata incomplete or inconsistent.' }]),
    ...studio.validation.errors.map(message => ({ code: 'INVALID_STUDIO_PREVIEW', message })),
    ...(!studio.result.sourceSafe ? [{ code: 'UNSAFE_STUDIO_PREVIEW', message: 'studio preview contains unsafe source data.' }] : []),
  ];
  const warnings = [
    ...rightsWarnings,
    ...pedagogy.warnings,
    ...(task.answerLeakRisk.level !== 'none' ? ['answer-leak-risk'] : []),
    ...(studio.validation.warnings.length ? studio.validation.warnings : []),
  ];

  return {
    candidateId: normalized.candidateId,
    candidateVersion: normalized.candidateVersion,
    status: normalized.status,
    source,
    curriculum: clone(normalized.curriculum),
    rights: {
      canPublish: normalized.rights?.canPublish === true,
      needsRightsReview: normalized.rights?.needsRightsReview === true,
      rightsStatus,
      sourceRightsSnapshot,
    },
    board,
    task,
    pedagogy,
    studioPreviewValidation: {
      valid: studio.result.valid,
      documentValid: studio.result.documentValid,
      sourceSafe: studio.result.sourceSafe,
      leaks: studio.result.leaks,
      warnings: studio.result.warnings,
      errors: studio.result.errors,
      source: studio.result.source,
    },
    promotionReadiness: {
      readyForPromotion: blockingIssues.length === 0 && studio.result.valid,
      blockingIssues,
      warnings,
      info: [
        rightsStatus === 'publishable'
          ? 'Hak durumu yayınlanabilir.'
          : 'Hak durumu inceleme gerektirir; approved/published üretilemez.',
        `Studio preview ${studio.result.valid ? 'geçti' : 'geçemedi'}.`,
      ],
    },
  };
}

async function buildCandidateReviewCatalog({ rootDir = ROOT } = {}) {
  const audit = await auditCandidateCatalog({ rootDir });
  const reports = audit.items.map(item => {
    if (item.parseError) {
      return {
        candidateId: null,
        candidateVersion: null,
        status: null,
        source: { sourceId: null, locator: null, usage: null },
        curriculum: null,
        rights: {
          canPublish: false,
          needsRightsReview: false,
          rightsStatus: 'invalid',
          sourceRightsSnapshot: null,
        },
        board: {
          size: null,
          sizeValid: false,
          initialStonesValid: false,
          markersValid: false,
          koTurnMoveLegality: 'not-applicable',
          valid: false,
          issues: [{ code: 'INVALID_JSON', message: item.parseError }],
        },
        task: {
          hasPrompt: false,
          hasAnswer: false,
          answerTypeValid: false,
          hasSolution: false,
          hasExplanation: false,
          answerLeakRisk: { level: 'none', signals: [] },
          valid: false,
          issues: [{ code: 'INVALID_JSON', message: item.parseError }],
        },
        pedagogy: {
          skillMeaningful: false,
          difficultyPresent: false,
          curriculumMatch: false,
          problemTypeClear: false,
          warnings: [],
          valid: false,
        },
        studioPreviewValidation: {
          valid: false,
          documentValid: false,
          sourceSafe: false,
          leaks: { absolutePath: false, pdfPath: false, licenseClaim: false },
          warnings: [],
          errors: [item.parseError],
          source: null,
        },
        promotionReadiness: {
          readyForPromotion: false,
          blockingIssues: [{ code: 'INVALID_JSON', message: item.parseError }],
          warnings: [],
          info: ['candidate dosyası okunamadı.'],
        },
        parseError: item.parseError,
        path: item.path,
      };
    }
    const report = buildReportBase(item.normalized, audit.catalog.sources.find(source => source.sourceId === item.sourceId));
    report.parseError = null;
    report.path = item.path;
    return report;
  });

  const summary = {
    candidateCount: reports.length,
    readyForPromotion: reports.filter(report => report.promotionReadiness.readyForPromotion).length,
    blocked: reports.filter(report => report.promotionReadiness.blockingIssues.length > 0).length,
    sourceCount: audit.summary.sourceCount,
    issueCount: audit.summary.issueCount,
  };

  return { ...audit, reports, summary };
}

async function buildCandidateReviewReport({ candidateId, rootDir = ROOT } = {}) {
  const catalog = await auditCandidateCatalog({ rootDir });
  if (candidateId && !validateCandidateId(candidateId)) {
    const error = new Error('Invalid candidateId.');
    error.code = 'INVALID_CANDIDATE_ID';
    throw error;
  }
  const item = catalog.items.find(entry => entry.candidateId === candidateId);
  if (!item) {
    const error = new Error(`Candidate not found: ${candidateId}`);
    error.code = 'CANDIDATE_NOT_FOUND';
    throw error;
  }
  if (item.parseError) {
    return {
      candidateId: null,
      candidateVersion: null,
      status: null,
      source: { sourceId: null, locator: null, usage: null },
      curriculum: null,
      rights: {
        canPublish: false,
        needsRightsReview: false,
        rightsStatus: 'invalid',
        sourceRightsSnapshot: null,
      },
      board: {
        size: null,
        sizeValid: false,
        initialStonesValid: false,
        markersValid: false,
        koTurnMoveLegality: 'not-applicable',
        valid: false,
        issues: [{ code: 'INVALID_JSON', message: item.parseError }],
      },
      task: {
        hasPrompt: false,
        hasAnswer: false,
        answerTypeValid: false,
        hasSolution: false,
        hasExplanation: false,
        answerLeakRisk: { level: 'none', signals: [] },
        valid: false,
        issues: [{ code: 'INVALID_JSON', message: item.parseError }],
      },
      pedagogy: {
        skillMeaningful: false,
        difficultyPresent: false,
        curriculumMatch: false,
        problemTypeClear: false,
        warnings: [],
        valid: false,
      },
      studioPreviewValidation: {
        valid: false,
        documentValid: false,
        sourceSafe: false,
        leaks: { absolutePath: false, pdfPath: false, licenseClaim: false },
        warnings: [],
        errors: [item.parseError],
        source: null,
      },
      promotionReadiness: {
        readyForPromotion: false,
        blockingIssues: [{ code: 'INVALID_JSON', message: item.parseError }],
        warnings: [],
        info: ['candidate dosyas? okunamad?.'],
      },
      parseError: item.parseError,
      path: item.path,
    };
  }
  const catalogSource = catalog.catalog.sources.find(source => source.sourceId === item.sourceId) || null;
  return buildReportBase(item.normalized, catalogSource);
}

function summarizePromotion(report, catalogSource, rootDir = ROOT) {
  if (!report || report.parseError) {
    return {
      candidateId: report?.candidateId ?? null,
      targetStatus: 'blocked',
      rightsStatus: report?.rights?.rightsStatus ?? 'invalid',
      readyForPromotion: false,
      blocked: true,
      blockingIssues: report?.promotionReadiness?.blockingIssues ?? [{ code: 'INVALID_JSON', message: report?.parseError ?? 'candidate parse failed.' }],
      warnings: report?.promotionReadiness?.warnings ?? [],
      info: report?.promotionReadiness?.info ?? [],
      preview: null,
      targetPath: null,
      writeResult: null,
      report,
    };
  }

  const rightsIncomplete = report.rights.canPublish !== true || report.rights.needsRightsReview === true;
  const targetStatus = report.promotionReadiness.blockingIssues.length > 0
    ? 'blocked'
    : (rightsIncomplete ? 'review' : 'approved');
  const blocked = report.promotionReadiness.blockingIssues.length > 0;
  const canonicalPreview = blocked ? null : buildCanonicalProblemPreview(report, catalogSource, {
    targetStatus,
    rightsStatus: report.rights.rightsStatus,
  });
  const targetPath = blocked
    ? null
    : path.join(rootDir, 'content/problem-bank/problems', `${report.candidateId}.json`);

  return {
    candidateId: report.candidateId,
    targetStatus,
    rightsStatus: report.rights.rightsStatus,
    readyForPromotion: !blocked,
    blocked,
    blockingIssues: report.promotionReadiness.blockingIssues,
    warnings: [
      ...report.promotionReadiness.warnings,
      ...(rightsIncomplete ? ['rights-blocks-approved-published'] : []),
    ],
    info: report.promotionReadiness.info,
    preview: canonicalPreview,
    targetPath,
    writeResult: null,
    report,
  };
}

async function buildCandidatePromotionReport({ candidateId = null, rootDir = ROOT } = {}) {
  const reviewCatalog = await buildCandidateReviewCatalog({ rootDir });
  const catalogMap = new Map(reviewCatalog.catalog.sources.map(source => [source.sourceId, source]));

  if (candidateId) {
    const report = reviewCatalog.reports.find(item => item.candidateId === candidateId);
    if (!report) {
      const error = new Error(`Candidate not found: ${candidateId}`);
      error.code = 'CANDIDATE_NOT_FOUND';
      throw error;
    }
    return summarizePromotion(report, catalogMap.get(report.source?.sourceId ?? ''), rootDir);
  }

  const reports = reviewCatalog.reports.map(report => summarizePromotion(report, catalogMap.get(report.source?.sourceId ?? ''), rootDir));
  return {
    summary: {
      candidateCount: reports.length,
      readyForPromotion: reports.filter(item => item.readyForPromotion).length,
      blocked: reports.filter(item => item.blocked).length,
      rightsBlocked: reports.filter(item => item.warnings.includes('rights-blocks-approved-published')).length,
      sourceCount: reviewCatalog.summary.sourceCount,
      issueCount: reviewCatalog.summary.issueCount,
      changeCount: 0,
    },
    reports,
    writeResult: null,
  };
}

async function writeJsonAtomic(filePath, value, fsImpl = fs) {
  const dir = path.dirname(filePath);
  await fsImpl.mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const backupPath = `${filePath}.bak.${process.pid}.${Date.now()}`;
  const json = normalizeJsonText(value);
  await fsImpl.writeFile(tempPath, json, 'utf8');
  let hadExisting = false;
  let existingText = null;
  try {
    existingText = await fsImpl.readFile(filePath, 'utf8');
    hadExisting = true;
  } catch {
    hadExisting = false;
  }

  if (hadExisting && normalizeJsonText(JSON.parse(existingText)) === json) {
    await fsImpl.unlink(tempPath).catch(() => {});
    return { status: 'noop', path: filePath };
  }

  try {
    if (hadExisting) {
      await fsImpl.rename(filePath, backupPath);
    }
    await fsImpl.rename(tempPath, filePath);
    if (hadExisting) {
      await fsImpl.unlink(backupPath).catch(() => {});
    }
    return { status: hadExisting ? 'replaced' : 'created', path: filePath };
  } catch (error) {
    await fsImpl.unlink(tempPath).catch(() => {});
    if (hadExisting) {
      try {
        await fsImpl.rename(backupPath, filePath);
      } catch {
        // best-effort rollback
      }
    }
    throw error;
  }
}

function assertAllowedTargetPath(targetPath, rootDir = ROOT) {
  const allowedRoot = path.resolve(rootDir, 'content/problem-bank/problems');
  const resolved = path.resolve(targetPath);
  const prefix = allowedRoot.endsWith(path.sep) ? allowedRoot : `${allowedRoot}${path.sep}`;
  if (resolved !== allowedRoot && !resolved.startsWith(prefix)) {
    const error = new Error('Geçersiz canonical hedef yolu.');
    error.code = 'INVALID_TARGET_PATH';
    throw error;
  }
  return resolved;
}

async function applyCandidatePromotion({ candidateId, rootDir = ROOT, fsImpl = fs } = {}) {
  if (!validateCandidateId(candidateId)) {
    const error = new Error('Invalid candidateId.');
    error.code = 'INVALID_CANDIDATE_ID';
    throw error;
  }

  const reportBundle = await buildCandidatePromotionReport({ candidateId, rootDir });
  if (reportBundle.blocked) {
    const error = new Error(reportBundle.blockingIssues.map(issue => issue.message || issue.code).join(' | '));
    error.code = 'PROMOTION_BLOCKED';
    error.report = reportBundle;
    throw error;
  }

  const targetPath = assertAllowedTargetPath(reportBundle.targetPath, rootDir);
  const existingText = await fsImpl.readFile(targetPath, 'utf8').catch(() => null);
  if (existingText !== null) {
    const existingNormalized = normalizeJsonText(JSON.parse(existingText));
    const previewNormalized = normalizeJsonText(reportBundle.preview);
    if (existingNormalized === previewNormalized) {
      return {
        ...reportBundle,
        targetPath,
        writeResult: { status: 'noop', path: targetPath },
      };
    }
    const error = new Error('Target canonical problem already exists and differs.');
    error.code = 'TARGET_EXISTS';
    error.report = reportBundle;
    throw error;
  }
  const writeResult = await writeJsonAtomic(targetPath, reportBundle.preview, fsImpl);
  return {
    ...reportBundle,
    targetPath,
    writeResult,
  };
}

async function writeReviewReport(report, outputPath, { fsImpl = fs } = {}) {
  if (!outputPath) return null;
  const resolved = path.isAbsolute(outputPath) ? outputPath : path.join(ROOT, outputPath);
  const json = normalizeJsonText(report);
  await fsImpl.mkdir(path.dirname(resolved), { recursive: true });
  await fsImpl.writeFile(resolved, json, 'utf8');
  return resolved;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // CLI entry points are handled by the thin wrappers.
}

export {
  ROOT,
  REPORTS_DIR,
  PROBLEM_DIR,
  candidateIdFromArgs,
  outputPathFromArgs,
  validateSafeId,
  cleanCandidateSource,
  classifyRightsStatus,
  detectAnswerLeak,
  validateBoard,
  validateTask,
  validatePedagogy,
  validateStudioPreview,
  buildReportBase,
  buildCandidateReviewCatalog,
  buildCandidateReviewReport,
  buildCandidatePromotionReport,
  buildCanonicalProblemPreview,
  summarizePromotion,
  applyCandidatePromotion,
  writeJsonAtomic,
  writeReviewReport,
  resolveOutputPath,
  normalizeJsonText,
  sha256,
};
