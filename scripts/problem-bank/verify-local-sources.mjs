import assert from 'node:assert/strict';
import { verifyLocalSourcePaths } from './audit-sources.mjs';

const report = await verifyLocalSourcePaths();
assert.equal(typeof report.present, 'boolean');
if (report.present) {
  assert.equal(report.issues.length, 0, 'local-paths.json must not expose absolute paths');
}
console.log(report.present ? 'local source paths file present and safe' : 'local source paths file absent (expected)');
