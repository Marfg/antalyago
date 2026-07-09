import path from 'node:path';

import fileHandlersModule from '../../desktop/ipc/fileHandlers.cjs';
import { createAnnotation, setMoveNodeAnnotations } from '../../studio/model/moveTree.js';
import { createDocument, slugify } from '../../studio/model/studioDocument.js';
import { validateDocument } from '../../studio/model/validation.js';
import {
  auditCandidateCatalog,
  loadCandidateById,
  normalizeCandidate,
  validateCandidate,
  ROOT as BANK_ROOT,
} from './candidates.mjs';

const { writeAgstudioDocument } = fileHandlersModule;
const ROOT = BANK_ROOT;
const SAFE_CANDIDATE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_METHOD_TO_TYPE = new Map([
  ['manual', 'count'],
  ['assisted', 'count'],
  ['ocr', 'count'],
  ['vision', 'count'],
  ['sgf', 'sequence'],
  ['mixed', 'count'],
]);
const STATUS_LABELS = new Map([
  ['extracted', 'Çıkarıldı'],
  ['needs-review', 'İnceleme gerekli'],
  ['rejected', 'Reddedildi'],
  ['promoted', 'Aktarıldı'],
]);

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function validateCandidateId(candidateId) {
  return typeof candidateId === 'string' && SAFE_CANDIDATE_ID_RE.test(candidateId);
}

function candidateIdFromArgs(args) {
  const idx = args.indexOf('--candidate');
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function outputPathFromArgs(args, candidateId) {
  const idx = args.indexOf('--output');
  if (idx === -1) return null;
  const raw = args[idx + 1];
  if (!raw) return null;
  const absolute = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (raw.toLowerCase().endsWith('.agstudio')) return absolute;
  return path.join(absolute, `${candidateId}.agstudio`);
}

function outputJsonPathFromArgs(args) {
  return args.includes('--json');
}

function candidateStatusLabel(status) {
  return STATUS_LABELS.get(status) ?? 'Hatalı dosya';
}

function candidateRightsSummary(rights = {}) {
  const canPublish = rights.canPublish === true;
  const needsReview = rights.needsRightsReview !== false;
  if (canPublish) return 'Yayınlanabilir';
  if (needsReview) return 'Yayın hakkı inceleme bekliyor';
  return 'Yayın kapalı';
}

function candidateReadOnlyNotice(normalized) {
  const rights = normalized?.rights ?? {};
  if (rights.canPublish === false && rights.needsRightsReview === true) {
    return 'Bu aday salt-okunurdur; yayın hakkı için inceleme gerekir.';
  }
  if (rights.canPublish === false) {
    return 'Bu aday salt-okunurdur.';
  }
  return 'Bu aday önizleme olarak açıldı.';
}

function mapProblemType(candidate) {
  const type = candidate?.task?.type;
  if (type === 'sequence') return 'sequence';
  if (type === 'judgment') return 'judgment';
  if (type === 'save') return 'save';
  if (type === 'construct') return 'construct';
  if (type === 'count' || type === 'numeric_count') return 'count';
  return VALID_METHOD_TO_TYPE.get(candidate?.extraction?.method) || 'count';
}

function mapDifficulty(confidence) {
  if (typeof confidence !== 'number') return 'beginner';
  if (confidence >= 0.85) return 'intermediate';
  if (confidence >= 0.65) return 'beginner';
  return 'advanced';
}

function buildStudioDocument(candidate) {
  const normalized = normalizeCandidate(candidate);
  const title = normalized.task?.prompt?.trim() || normalized.candidateId || 'Problem adayı';
  const doc = createDocument({
    id: normalized.candidateId,
    title,
    slug: slugify(normalized.candidateId),
    summary: normalized.extraction?.notes || normalized.task?.prompt || '',
    status: 'review',
    curriculum: {
      section: normalized.curriculum.section,
      lesson: normalized.curriculum.lesson,
      step: 'candidate-preview',
      objectives: normalized.task?.prompt ? [normalized.task.prompt] : [],
      skills: normalized.curriculum.skill ? [normalized.curriculum.skill] : [],
      prerequisites: [],
    },
    classification: {
      problemType: mapProblemType(normalized),
      subtype: 'candidate-preview',
      difficulty: mapDifficulty(normalized.extraction?.confidence),
      playerToMove: 'black',
      goal: 'best-move',
    },
    board: {
      size: normalized.board.size,
      turn: 'black',
      ko: null,
      stones: (normalized.board.initialStones || []).map(stone => ({
        color: stone.color,
        x: stone.x,
        y: stone.y,
      })),
      markers: (normalized.board.markers || []).map(marker => ({
        x: marker.x,
        y: marker.y,
        label: marker.label,
      })),
      regions: [],
      viewport: null,
    },
    sources: [{
      sourceId: normalized.source.sourceId,
      locator: {
        type: normalized.source.locator.type,
        value: normalized.source.locator.value,
      },
      usage: normalized.source.usage,
    }],
    outputs: {
      problemBank: false,
      lesson3d: false,
      sgf: false,
      motion: false,
      obsidian: false,
      image: false,
    },
    extensions: {
      problemBankCandidate: {
        candidateId: normalized.candidateId,
        candidateVersion: normalized.candidateVersion,
        status: normalized.status,
        extraction: normalized.extraction,
        source: {
          sourceId: normalized.source.sourceId,
          locator: {
            type: normalized.source.locator.type,
            value: normalized.source.locator.value,
          },
          usage: normalized.source.usage,
        },
        curriculum: normalized.curriculum,
        rights: {
          sourceRightsSnapshot: normalized.rights.sourceRightsSnapshot,
          canPublish: normalized.rights.canPublish,
          needsRightsReview: normalized.rights.needsRightsReview,
        },
        review: normalized.review,
        note: 'preview-only; not canonical; human approval required before promotion',
      },
    },
  });

  const annotations = (normalized.board.markers || []).map(marker => createAnnotation({
    type: 'label',
    point: { x: marker.x, y: marker.y },
    text: marker.label,
  }));
  setMoveNodeAnnotations(doc.moveTree.root, 'root', annotations, doc.board.size);
  doc.moveTree.root.comment = normalized.task?.prompt || '';
  doc.moveTree.root.formation = {
    size: doc.board.size,
    turn: doc.board.turn,
    ko: doc.board.ko,
    stones: doc.board.stones.map(stone => ({ ...stone })),
    markers: doc.board.markers.map(marker => ({ ...marker })),
    regions: [],
    viewport: null,
  };
  doc.activeNodeId = 'root';
  doc.moveTree.activeNodeId = 'root';
  doc.moves = [];
  return doc;
}

function buildCandidateSummary(candidate, { issueCount = 0, issues = [] } = {}) {
  const normalized = normalizeCandidate(candidate);
  const locator = normalized.source?.locator ?? {};
  const title = normalized.task?.prompt?.trim() || normalized.candidateId || 'Problem adayı';
  return {
    candidateId: normalized.candidateId,
    candidateVersion: normalized.candidateVersion,
    title,
    status: normalized.status,
    statusLabel: candidateStatusLabel(normalized.status),
    curriculumSection: normalized.curriculum?.section ?? '',
    curriculumLesson: normalized.curriculum?.lesson ?? '',
    curriculumSkill: normalized.curriculum?.skill ?? '',
    sourceId: normalized.source?.sourceId ?? '',
    locatorType: locator.type ?? '',
    locatorValue: locator.value ?? '',
    sourceSummary: normalized.source?.sourceId ? `${normalized.source.sourceId}/${locator.type ?? 'unresolved'}:${locator.value ?? 'unresolved'}` : 'Kaynak belirsiz',
    reviewRequired: normalized.review?.required === true,
    canPublish: normalized.rights?.canPublish === true,
    needsRightsReview: normalized.rights?.needsRightsReview === true,
    rightsSummary: candidateRightsSummary(normalized.rights),
    readOnlyNotice: candidateReadOnlyNotice(normalized),
    boardSize: normalized.board?.size ?? 9,
    initialStoneCount: Array.isArray(normalized.board?.initialStones) ? normalized.board.initialStones.length : 0,
    markerCount: Array.isArray(normalized.board?.markers) ? normalized.board.markers.length : 0,
    issueCount,
    issues,
    studioCompatible: normalized.studio?.compatible ?? false,
  };
}

function summarizeCandidateReport(report) {
  if (!report?.candidateId) {
    return {
      candidateId: null,
      candidateVersion: report?.candidateVersion ?? null,
      title: 'Bozuk aday dosyası',
      status: 'invalid',
      statusLabel: 'Hatalı dosya',
      curriculumSection: '',
      curriculumLesson: '',
      curriculumSkill: '',
      sourceId: report?.sourceId ?? '',
      locatorType: report?.locatorType ?? '',
      locatorValue: report?.locatorValue ?? '',
      sourceSummary: 'Okunamayan aday dosyası',
      reviewRequired: false,
      canPublish: false,
      needsRightsReview: false,
      rightsSummary: 'Okunamadı',
      readOnlyNotice: 'Bu aday dosyası bozuk.',
      boardSize: 0,
      initialStoneCount: 0,
      markerCount: 0,
      issueCount: report?.issueCount ?? 1,
      issues: report?.issues ?? [],
      studioCompatible: false,
      parseError: report?.parseError ?? null,
      valid: false,
      canOpen: false,
    };
  }
  const summary = buildCandidateSummary(report.normalized, {
    issueCount: report.issueCount,
    issues: report.issues,
  });
  return {
    ...summary,
    valid: report.issueCount === 0,
    canOpen: report.issueCount === 0,
  };
}

async function listCandidateLibrary({ rootDir = ROOT } = {}) {
  const audit = await auditCandidateCatalog({ rootDir });
  const items = audit.items.map(summarizeCandidateReport);
  const invalidCount = items.filter(item => !item.valid).length;
  return {
    catalog: audit.catalog,
    items,
    issues: audit.issues,
    summary: {
      ...audit.summary,
      invalidCount,
      issueCount: audit.issues.length,
    },
  };
}

async function loadCandidateStudioBundle(candidateId, { rootDir = ROOT } = {}) {
  if (!validateCandidateId(candidateId)) {
    const error = new Error('Invalid candidateId.');
    error.code = 'INVALID_CANDIDATE_ID';
    throw error;
  }

  const candidate = await loadCandidateById(candidateId, rootDir);
  if (!candidate) {
    const error = new Error(`Candidate not found: ${candidateId}`);
    error.code = 'CANDIDATE_NOT_FOUND';
    throw error;
  }

  const catalogReport = await auditCandidateCatalog({ rootDir });
  const validation = validateCandidate(candidate, catalogReport.catalog);
  if (!validation.valid) {
    const error = new Error(validation.issues.map(issue => issue.code).join(' | '));
    error.code = 'CANDIDATE_INVALID';
    error.issues = validation.issues;
    throw error;
  }

  const document = buildStudioDocument(candidate);
  const documentValidation = validateDocument(document);
  if (!documentValidation.valid) {
    const error = new Error(documentValidation.errors.join(' | '));
    error.code = 'INVALID_STUDIO_DOCUMENT';
    error.errors = documentValidation.errors;
    throw error;
  }

  return {
    candidate: validation.normalized,
    summary: buildCandidateSummary(validation.normalized, {
      issueCount: validation.issues.length,
      issues: validation.issues,
    }),
    document,
    validation: documentValidation,
    catalog: catalogReport.catalog,
  };
}

async function exportCandidateStudioPreview({ candidateId, outputPath = null, rootDir = ROOT } = {}) {
  const bundle = await loadCandidateStudioBundle(candidateId, { rootDir });

  let writtenPath = null;
  if (outputPath) {
    const finalPath = outputPath.toLowerCase().endsWith('.agstudio') ? outputPath : path.join(outputPath, `${candidateId}.agstudio`);
    await writeAgstudioDocument(finalPath, bundle.document);
    writtenPath = finalPath;
  }

  return {
    candidateId: bundle.candidate.candidateId,
    outputPath: writtenPath,
    valid: bundle.validation.valid,
    errors: bundle.validation.errors,
    warnings: bundle.validation.warnings,
    document: bundle.document,
    summary: bundle.summary,
  };
}

async function materializeCandidateStudioDocument(candidateId, { rootDir = ROOT } = {}) {
  return loadCandidateStudioBundle(candidateId, { rootDir });
}

function candidatePreviewPath(candidateId) {
  return candidateId ? path.join(ROOT, 'content/problem-bank/candidates/items', `${candidateId}.json`) : null;
}

export {
  ROOT,
  candidateIdFromArgs,
  candidatePreviewPath,
  candidateRightsSummary,
  candidateStatusLabel,
  buildCandidateSummary,
  buildStudioDocument,
  exportCandidateStudioPreview,
  listCandidateLibrary,
  loadCandidateStudioBundle,
  materializeCandidateStudioDocument,
  outputJsonPathFromArgs,
  outputPathFromArgs,
  validateCandidateId,
};