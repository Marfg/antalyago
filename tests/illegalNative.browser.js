import { CAPTURE_SCENARIOS, createCaptureBoard, targetLiberties, evaluateCaptureMove, chooseCaptureReply } from '../scenes/captureNativePolicy.js';

const assert = (value, message) => { if (!value) throw Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, message, timeout = 7000) {
  const start = Date.now();
  while (!fn()) { if (Date.now() - start > timeout) throw Error(message); await delay(30); }
}

export async function runIllegalBrowserTests(log = console.log) {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  let win, doc, hook;
  const errors = [];
  async function open(id, width = 1280, height = 800) {
    frame.width = width; frame.height = height;
    frame.src = `../learning-scenes.html?exposeBoardAdapter=1&testScene=${id}&revision=2`;
    await new Promise(resolve => frame.onload = resolve);
    win = frame.contentWindow; doc = win.document;
    win.addEventListener('error', e => errors.push(e.message));
    await waitFor(() => doc.querySelector('.illegal-native'), `mount ${id}`);
    hook = win.__lsTestBoardAdapter;
    await delay(800); // camera settles before hit-testing
  }
  const events = () => JSON.parse(win.localStorage.getItem('go_teacher_event_log_v1') || '[]');
  const panel = () => doc.querySelector('.illegal-native');
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


  const {STAGES}=await import('../scenes/illegalNativePolicy.js?v=ls08-r2');
  const next=()=>doc.querySelector('[data-action="next"]');
  for(const width of (location.search.includes("lifecycle")?[]:[1280,390])) {
    await open('scene-08-illegal-moves',width,width===390?844:800);

    assert(doc.documentElement.scrollWidth<=width,'horizontal overflow');
    assert(!doc.querySelector('#ls-scene-host').textContent.includes('Yasak hamle'),'concept on entry');
    const hint=doc.querySelector('[data-action="hint"]');
    hint.click();hint.click();assert(hook.getIllegalHints().length===0,'hint reveals points too early');
    hint.click();assert(hook.getIllegalHints().length===4,'four hints missing');
    tap({row:4,col:8});assert(hook.isOccupied({row:4,col:8}),'legal exploration not shown');
    await waitFor(()=>!doc.querySelector('[data-action="retry"]').hidden,'manual undo missing');
    await delay(1600);assert(hook.isOccupied({row:4,col:8}),'observation disappeared automatically');
    doc.querySelector('[data-action="retry"]').click();assert(!hook.isOccupied({row:4,col:8}),'undo failed');
    for(const [i,target] of [...STAGES[0].targets].reverse().entries()) {
      tap(target);assert(!hook.isOccupied(target),'rejected stone actually placed');
      await waitFor(()=>panel().dataset.phase==='concept','discovery explanation missing');
      assert(doc.querySelector('.in-progress').textContent.includes(`${i+1} / 4`),'discovery progress wrong');
      assert(next().hidden===(i!==3),'completion unlocked early');
      if(i===0){tap(target);await waitFor(()=>panel().dataset.phase==='concept','repeat failed');assert(doc.querySelector('.in-progress').textContent.includes('1 / 4'),'duplicate counted');}
    }
    next().click();
    for(let i=1;i<STAGES.length;i++){
      const s=STAGES[i],target=s.targets[0];
      assert(panel().dataset.moment===s.key,'stage wrong');
      tap(target);
      assert(panel().dataset.phase==='act','act missing');
      assert(doc.querySelector('.in-feedback').textContent==='','explanation before result');
      assert(hook.isOccupied(target)===(s.expected!=='reject'),'wrong rule result');
      await waitFor(()=>panel().dataset.phase==='concept','concept missing');
      const expected=s.expected==='capture'?3:s.expected==='connect'?8:s.opponent?1:0;
      assert(hook.getLibertyPoints().length===expected,'wrong visible liberty evidence');
      const compare=doc.querySelector('[data-action="compare"]');
      compare.click();assert(!hook.isOccupied(target),'before view retains move');
      compare.click();assert(hook.isOccupied(target)===(s.expected!=='reject'),'after view wrong');
      if(s.expected==='capture')for(const stone of s.stones.filter(s2=>s2.color!==s.color))assert(!hook.isOccupied({row:stone.y,col:stone.x}),'captured stone survived');
      next().click();
    }
    assert(doc.querySelector('.ls-topic-end'),'completion missing'); assert(win.getComputedStyle(panel()).display==='none','completed experiment remains visible');
    const last=events().filter(e=>e.type==='scene_assessment_answered'&&e.payload?.momentKey==='white_capture').at(-1);
    assert(last?.payload.correct&&last.payload.capturedCount===5,'transfer assessment incorrect');
    doc.querySelector('[data-action="replay"]').click();await waitFor(()=>panel()?.dataset.phase==='observe','replay failed');
    assert(hook.getIllegalHints().length===0,'replay retains hint');
    log(`PASS ${width}px: 4 original shapes, manual exploration/undo, duplicate protection, 5 follow-up experiments, before/after, white capture, events, replay`);
  }
  await open('scene-08-illegal-moves');tap(STAGES[0].targets[0]);doc.querySelector('#ls-topics-open').click();
  await delay(1100);assert(panel().dataset.phase==='act','timer advanced behind topics');
  doc.querySelector('#ls-topics-open').click();await waitFor(()=>panel().dataset.phase==='concept','resume failed');
  tap(STAGES[0].targets[1]);doc.querySelector('#ls-topics-open').click();
  const other=[...doc.querySelectorAll('.ls-topic-item')].find(el=>el.textContent.includes('Tahtayı Tanı'));
  assert(other&&!other.disabled,'available scene link missing');other.click();await delay(1700);
  assert(!doc.querySelector('.illegal-native-root'),'unmount retained UI');
  assert(doc.querySelector('#ls-scene-host').textContent.trim(),'next scene did not mount');
  assert(errors.length===0,errors.join('\n'));
  frame.remove();log('ALL LS08 R2 BROWSER TESTS PASSED');
}




