import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ROOT,
  buildStudioDocument,
  exportCandidateStudioPreview,
  candidateIdFromArgs,
  outputPathFromArgs,
  outputJsonPathFromArgs,
  validateCandidateId,
} from './candidate-studio-adapter.mjs';

async function main() {
  const candidateId = candidateIdFromArgs(process.argv.slice(2));
  if (!candidateId) {
    throw new Error('Usage: node scripts/problem-bank/candidate-to-studio.mjs --candidate <candidateId> [--output <path>]');
  }
  const outputPath = outputPathFromArgs(process.argv.slice(2), candidateId);
  const report = await exportCandidateStudioPreview({ candidateId, outputPath, rootDir: ROOT });
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
  ROOT,
  buildStudioDocument,
  exportCandidateStudioPreview,
  candidateIdFromArgs,
  outputPathFromArgs,
  outputJsonPathFromArgs,
  validateCandidateId,
};