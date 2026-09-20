import assert from 'node:assert/strict';
import { CAPTURE_SCENARIOS, createCaptureBoard, targetLiberties, evaluateCaptureMove, chooseCaptureReply } from '../scenes/captureNativePolicy.js';
import { scene06CaptureBasics, scene06CaptureEdge, scene06CaptureGroup } from '../scenes/scene06CaptureBasics.js';
import { scene07CapturePractice } from '../scenes/scene07CapturePractice.js';
import { createSceneRegistry } from '../scenes/sceneRegistry.js';

const scenes = [scene06CaptureBasics, scene06CaptureEdge, scene06CaptureGroup, scene07CapturePractice];
const registry = createSceneRegistry(scenes);
assert.deepEqual(registry.issues, []);
assert.equal(registry.size, 4);
for (const [index, scenario] of CAPTURE_SCENARIOS.entries()) {
  const board = createCaptureBoard(scenario);
  const liberties = targetLiberties(board, scenario);
  assert.equal(liberties.length, 1);
  const result = evaluateCaptureMove(board, liberties[0]);
  assert.equal(result.ok, true);
  assert.equal(result.capturedCount, index === 2 ? 2 : 1);
  assert.equal(result.newState.stones.filter(s => s.color === 'white').length, 0);
  assert.equal(board.stones.length, scenario.board.length, 'evaluation is immutable');
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
    const attempt = evaluateCaptureMove(board, { row, col });
    if (!attempt.ok) continue;
    if (row === liberties[0].row && col === liberties[0].col) continue;
    assert.equal(attempt.capturedCount, 0);
    assert.equal(targetLiberties(attempt.newState, scenario).length, 1);
  }
  console.log(`PASS ${scenario.key}: real capture and every alternative legal move`);
}
assert.deepEqual(targetLiberties(createCaptureBoard(CAPTURE_SCENARIOS[0]), CAPTURE_SCENARIOS[0]), [{ row: 1, col: 2 }], 'displayed C4 = row 1 on a 5x5 renderer');
assert.equal(evaluateCaptureMove(createCaptureBoard(CAPTURE_SCENARIOS[0]), { row: 2, col: 2 }).reason, 'OCCUPIED');
assert.equal(evaluateCaptureMove(createCaptureBoard(), { row: -1, col: 0 }).reason, 'OUT_OF_BOUNDS');

// Full games from an empty board: the opponent must always make legal moves,
// and both outcomes must be reachable without a scripted answer or reset.
let random = 73;
const outcomes = new Set();
for (let game = 0; game < 80; game++) {
  let board = createCaptureBoard();
  for (let ply = 0; ply < 50; ply++) {
    let point;
    if (board.turn === 'white') point = chooseCaptureReply(board);
    else if (game % 2 === 0) {
      const mirrored = board.clone();
      mirrored.grid = mirrored.grid.map(row => row.map(c => c === 'black' ? 'white' : c === 'white' ? 'black' : null));
      mirrored.stones = mirrored.stones.map(s => ({ ...s, color: s.color === 'black' ? 'white' : 'black' }));
      point = chooseCaptureReply(mirrored);
    } else {
      const legal = [];
      for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
        if (evaluateCaptureMove(board, { row, col }).ok) legal.push({ row, col });
      }
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      point = legal[random % legal.length];
    }
    if (!point) break;
    const color = board.turn;
    const result = evaluateCaptureMove(board, point);
    assert.equal(result.ok, true);
    board = result.newState;
    if (result.capturedCount) { outcomes.add(color); break; }
  }
}
assert.deepEqual([...outcomes].sort(), ['black', 'white']);
console.log('PASS legal full games, black/white wins, registry and C4 coordinates');
