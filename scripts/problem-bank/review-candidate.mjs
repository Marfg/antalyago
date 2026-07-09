import { pathToFileURL } from 'node:url';

import {
  ROOT,
  buildCandidateReviewCatalog,
  buildCandidateReviewReport,
  candidateIdFromArgs,
  outputPathFromArgs,
  resolveOutputPath,
  writeReviewReport,
} from './candidate-review-gate.mjs';

async function main() {
  const args = process.argv.slice(2);
  const candidateId = candidateIdFromArgs(args);
  const outputPath = outputPathFromArgs(args);
  const report = candidateId
    ? await buildCandidateReviewReport({ candidateId, rootDir: ROOT })
    : await buildCandidateReviewCatalog({ rootDir: ROOT });

  const resolvedOutput = resolveOutputPath(outputPath, candidateId, {
    defaultFileName: candidateId ? 'review-report.json' : 'review-candidates-report.json',
  });
  if (resolvedOutput) {
    await writeReviewReport(report, resolvedOutput);
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
