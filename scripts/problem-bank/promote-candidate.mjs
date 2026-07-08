import { pathToFileURL } from 'node:url';
import { buildCandidatePromotionReport } from './candidates.mjs';

async function main() {
  const json = process.argv.includes('--json');
  const apply = process.argv.includes('--apply');
  const report = await buildCandidatePromotionReport({ apply });
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }
  console.log('Candidate promotion preview');
  console.log(`  Items: ${report.summary.candidateCount}`);
  console.log(`  Promotable: ${report.summary.promotableCount}`);
  console.log(`  Change count: ${report.summary.changeCount}`);
  console.log(`  Mode: ${apply ? 'apply (preview-only in phase 5)' : 'dry-run'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export { buildCandidatePromotionReport };
