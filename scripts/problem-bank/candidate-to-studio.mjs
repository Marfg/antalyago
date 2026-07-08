import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import fileHandlersModule from '../../desktop/ipc/fileHandlers.cjs';
import { createAnnotation, setMoveNodeAnnotations } from '../../studio/model/moveTree.js';
import { createDocument, slugify } from '../../studio/model/studioDocument.js';
import { validateDocument } from '../../studio/model/validation.js';
import { loadCandidateById, normalizeCandidate, validateCandidate, ROOT as BANK_ROOT } from './candidates.mjs';

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

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
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
  const idx = args.indexOf('--json');
  if (idx === -1) return null;
  return true;
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

function validateCandidateId(candidateId) {
  return typeof candidateId === 'string' && SAFE_CANDIDATE_ID_RE.test(candidateId);
}

async function exportCandidateStudioPreview({ candidateId, outputPath = null, rootDir = ROOT } = {}) {
  if (!validateCandidateId(candidateId)) {
    throw new Error('Invalid candidateId.');
  }
  const candidate = await loadCandidateById(candidateId, rootDir);
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }
  const catalogReport = await import('./candidates.mjs').then(mod => mod.auditCandidateCatalog({ rootDir }));
  const catalog = catalogReport.catalog;
  const validation = validateCandidate(candidate, catalog);
  if (!validation.valid) {
    throw new Error(validation.issues.map(issue => issue.code).join(' | '));
  }

  const document = buildStudioDocument(candidate);
  const result = validateDocument(document);
  if (!result.valid) {
    throw new Error(result.errors.join(' | '));
  }

  let writtenPath = null;
  if (outputPath) {
    const finalPath = outputPath.toLowerCase().endsWith('.agstudio') ? outputPath : path.join(outputPath, `${candidateId}.agstudio`);
    await writeAgstudioDocument(finalPath, document);
    writtenPath = finalPath;
  }

  return {
    candidateId,
    outputPath: writtenPath,
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
    document,
  };
}

async function main() {
  const candidateId = candidateIdFromArgs(process.argv.slice(2));
  if (!candidateId) {
    throw new Error('Usage: node scripts/problem-bank/candidate-to-studio.mjs --candidate <candidateId> [--output <path>]');
  }
  const outputPath = outputPathFromArgs(process.argv.slice(2), candidateId);
  const report = await exportCandidateStudioPreview({ candidateId, outputPath });
  if (outputJsonPathFromArgs(process.argv.slice(2))) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  console.log(JSON.stringify({
    candidateId: report.candidateId,
    outputPath: report.outputPath,
    valid: report.valid,
    warnings: report.warnings,
    document: report.document,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export {
  buildStudioDocument,
  exportCandidateStudioPreview,
  validateCandidateId,
};
