import { CAPTURE_SCENARIOS, createCaptureBoard, targetLiberties, evaluateCaptureMove, chooseCaptureReply } from '../scenes/captureNativePolicy.js';

const assert = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, message, timeout = 7000) {
  const start = Date.now();
  while (!fn()) { if (Date.now() - start > timeout) throw Error(message); await delay(30); }
}

export async function runCaptureBrowserTests(log = console.log) {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  let win, doc, hook;
  const errors = [];
  async function open(id, width = 1280, height = 800) {
    frame.width = width; frame.height = height;
    frame.src = `../learning-scenes.html?exposeBoardAdapter=1&testScene=${id}`;
    await new Promise(resolve => frame.onload = resolve);
    win = frame.contentWindow; doc = win.document;
    win.addEventListener('error', e => errors.push(e.message));
    await waitFor(() => doc.querySelector('.capture-scene'), `mount ${id}`);
    hook = win.__lsTestBoardAdapter;
    await delay(800); // camera settles before hit-testing
  }
  const events = () => JSON.parse(win.localStorage.getItem('go_teacher_event_log_v1') || '[]');
  const panel = () => doc.querySelector('.capture-scene');
  function tap(point) {
    const canvas = doc.querySelector('#ls-canvas');
    const box = canvas.getBoundingClientRect();
    for (let y = box.top + 4; y < box.bottom; y += 8) for (let x = box.left + 4; x < box.right; x += 8) {
      canvas.dispatchEvent(new win.MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
      const hit = hook.getHoverPoint();
      if (hit?.row === point.row && hit?.col === point.col) {
        canvas.dispatchEvent(new win.MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
        return;
      }
    }
    throw Error(`Visible clickable intersection not found: ${JSON.stringify(point)}`);
  }
  const ids = ['scene-06-capture-basics', 'scene-06-capture-edge', 'scene-06-capture-group'];
  for (const width of [1280, 390]) {
    for (const [index, scenario] of CAPTURE_SCENARIOS.entries()) {
      await open(ids[index], width, width === 390 ? 844 : 800);
      const target = targetLiberties(createCaptureBoard(scenario), scenario)[0];
      assert(!doc.querySelector('#ls-scene-host').textContent.includes('Taş alma'), 'concept leaked before action');
      assert(hook.getLibertyPoints().length === 0, 'target highlighted on entry');
      assert(hook.getMovePreview() == null, 'move preview on entry');
      assert(doc.documentElement.scrollWidth <= width, 'horizontal overflow');
      const hint = doc.querySelector('[data-action="hint"]');
      hint.click(); assert(hook.getLibertyPoints().length === 0, 'first hint reveals answer');
      hint.click(); assert(hook.getLibertyPoints().length === 1, 'second hint missing marker');
      hint.click(); assert(hook.getMovePreview() != null, 'third hint missing preview');
      // Real unsuccessful move remains visible until the observation finishes.
      tap({ row: 0, col: 0 });
      assert(hook.isOccupied({ row: 0, col: 0 }), 'unsuccessful move not played');
      await waitFor(() => panel().dataset.phase === 'consequence', 'missing consequence');
      assert(hook.getLibertyPoints().length === 1, 'remaining liberty not shown');
      assert(!doc.querySelector('.s05-feedback').textContent.toLowerCase().includes('yanlış'), 'punitive feedback');
      await waitFor(() => panel().dataset.phase === 'observe', 'move not undone');
      assert(!hook.isOccupied({ row: 0, col: 0 }), 'stone survives undo');
      tap(target);
      const answersAfterTap = events().filter(e => e.type === 'scene_assessment_answered').length;
      doc.querySelector('#ls-canvas').dispatchEvent(new win.MouseEvent('click', { clientX: 400, clientY: 300, bubbles: true }));
      assert(events().filter(e => e.type === 'scene_assessment_answered').length === answersAfterTap, 'duplicate tap accepted during capture');
      assert(panel().dataset.phase === 'act', 'act phase missing');
      assert(doc.querySelector('.s05-feedback').textContent === '', 'explanation precedes result');
      for (const s of scenario.board.filter(s => s.color === 'white')) assert(!hook.isOccupied({ row: s.y, col: s.x }), 'captured group remains in rule state');
      await waitFor(() => doc.querySelector('.ls-topic-end'), 'completion missing');
      assert(doc.querySelector('.ls-topic-end-summary').textContent.includes('Taş alma'), 'concept missing after action');
      const result = events().filter(e => e.stepId === ids[index] && e.type === 'scene_assessment_answered').at(-1).payload;
      assert(result.correct && result.capturedCount === (index === 2 ? 2 : 1) && result.hintLevel === 3, 'incorrect assessment event');
      doc.querySelector('[data-action="replay"]').click();
      await waitFor(() => panel()?.dataset.phase === 'observe', 'replay not reset');
      assert(hook.getLibertyPoints().length === 0, 'replay retains hint');
      log(`PASS ${width}px ${scenario.key}: hint, legal retry/undo, capture, event, replay`);
    }
  }
  await open(ids[0]);
  tap(targetLiberties(createCaptureBoard(CAPTURE_SCENARIOS[0]), CAPTURE_SCENARIOS[0])[0]);
  doc.querySelector('#ls-topics-open').click();
  await delay(1000);
  assert(panel().dataset.phase === 'act', 'capture timer advanced behind topics panel');
  doc.querySelector('#ls-topics-open').click();
  await waitFor(() => doc.querySelector('.ls-topic-end'), 'capture did not resume after topics closed');
  await open(ids[0]);
  tap({ row: 0, col: 0 });
  doc.querySelector('#ls-topics-open').click();
  const edgeButton = [...doc.querySelectorAll('.ls-topic-item')].find(el => el.textContent.includes('Tahta kenarı'));
  edgeButton.click();
  await waitFor(() => doc.querySelector('.s05-prompt')?.textContent.startsWith('Kenardaki'), 'switch did not mount edge');
  const switchedAt = events().length;
  await delay(2400);
  assert(!events().slice(switchedAt).some(e => e.stepId === ids[0]), 'unmounted scene emitted a delayed event');
  assert(panel().dataset.phase === 'observe' && hook.getLibertyPoints().length === 0, 'old timer modified new scene');
  log('PASS duplicate taps, topics suspension/resume and unmount timer cleanup');
  // Play a complete real game, choosing black's moves with the same small policy.
  await open('scene-07-capture-practice');
  let board = createCaptureBoard();
  const eventStart = events().length;
  for (let round = 0; round < 25; round++) {
    const mirrored = board.clone();
    mirrored.grid = mirrored.grid.map(row => row.map(c => c === 'black' ? 'white' : c === 'white' ? 'black' : null));
    mirrored.stones = mirrored.stones.map(s => ({ ...s, color: s.color === 'black' ? 'white' : 'black' }));
    const point = chooseCaptureReply(mirrored);
    assert(point, 'black has no legal move in test game');
    tap(point);
    let result = evaluateCaptureMove(board, point, 'black');
    board = result.newState;
    if (result.capturedCount) break;
    const white = chooseCaptureReply(board);
    result = evaluateCaptureMove(board, white, 'white'); board = result.newState;
    await delay(650);
    if (result.capturedCount) break;
    assert(hook.isOccupied(point), 'mini game incorrectly undid black move');
  }
  await waitFor(() => doc.querySelector('.ls-topic-end'), 'game never ended');
  const gameEvents = events().slice(eventStart);
  assert(gameEvents.filter(e => e.type === 'scene_game_finished').length === 1, 'game end not emitted exactly once');
  assert(!gameEvents.some(e => e.type === 'scene_assessment_answered'), 'game recorded as quiz');
  assert(gameEvents.some(e => e.type === 'scene_game_move' && e.payload.color === 'white'), 'no opponent moves');
  doc.querySelector('[data-action="advance"]').click();
  await waitFor(() => doc.querySelector('#s08-intro'), 'capture game does not advance to existing scene 08');
  log('PASS micro game: alternating legal moves, persistent board, first capture, non-quiz events, next scene');
  assert(errors.length === 0, errors.join('\n'));
  log('ALL CAPTURE BROWSER TESTS PASSED');
}
