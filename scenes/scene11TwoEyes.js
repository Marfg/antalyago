import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-13.7';
import { getTwoEyesMoments, buildTwoEyesBoard, evaluateTwoEyesTap, CONCEPT } from './twoEyesPolicy.js?v=2026-09-13.7';
import { isValidMove, applyMove } from '../core/ruleEngine.js?v=2026-09-13.7';
let active = null;
const points = pairs => pairs.map(([col,row]) => ({row,col}));
export const scene11TwoEyes = {
  id: 'scene-11-two-eyes', version: 3, title: 'Canlı Gruplar (İki Göz)',
  curriculumRef: { lessonId: 'l7', concept: CONCEPT },
  mount(context) {
    const s = active = { index: 0, moments: getTwoEyesMoments(), done: new Set(), tried: new Set(), alive: true, locked: true, off: null, end: null, timer: null, resolveWait: null };
    const root = document.createElement('div');
    root.className = 'ls-strip-root s11-root';
    root.innerHTML = `<div class="s11-heading" id="s11-progress"></div><div class="ls-strip-row" id="s11-info"><p class="ls-strip-text" id="s11-explanation"></p><button class="ls-tick" id="s11-confirm" aria-label="Bilgiyi onayla">✓</button></div><div class="s11-task" id="s11-task" hidden><p class="ls-strip-text" id="s11-prompt"></p><div id="s11-question" hidden><button class="ls-strip-btn" id="s11-real">Gerçek göz</button><button class="ls-strip-btn" id="s11-false">Yalancı göz</button></div><div class="s05-feedback-row"><p class="s05-feedback" id="s11-feedback" role="status"></p><button class="ls-strip-btn" id="s11-sequence" hidden>Devamı izle</button><button class="ls-strip-btn" id="s11-next" disabled>Devam</button></div></div>`;
    context.container.append(root); s.root = root;
    const el = id => root.querySelector('#'+id), board = context.boardAdapter;
    function clearVisuals() { board.clearMovePreview(); board.clearLiberties(); board.clearIllegalHints(); board.clearRegionMarks(); }
    function render() {
      s.off?.(); s.off = null; s.offHover?.(); s.offHover = null; s.tried.clear(); s.locked = true; s.queryAnswered = false;
      const m = s.moments[s.index]; s.board = buildTwoEyesBoard(m);
      root.dataset.stepIndex = m.curriculumStepIndex; root.dataset.exampleIndex = m.exampleIndex;
      el('s11-progress').textContent = `${m.curriculumStepIndex+1} / 8 · ${m.title}${m.exampleCount > 1 ? ' · '+(m.label || m.title)+' ('+(m.exampleIndex+1)+'/'+m.exampleCount+')' : ''}`;
      el('s11-explanation').textContent = m.body; el('s11-question').hidden = !m.query;
      el('s11-info').hidden = false; el('s11-task').hidden = true;
      el('s11-confirm').disabled = false; el('s11-next').disabled = true; el('s11-sequence').hidden = true;
      el('s11-feedback').textContent = ''; el('s11-prompt').textContent = m.prompt;
      board.setInputEnabled(false); board.setSize(m.size); board.reset(); clearVisuals();
      for (const stone of m.board) {
        const result = board.playMove({row:stone.y,col:stone.x,color:stone.color === 'B' ? 'black' : 'white'});
        if (!result.ok) throw new Error('TWO_EYES_INVALID_SEED');
      }
      board.focus('center');
      board.focusPoints([...m.board.map(p=>({row:p.y,col:p.x})),...points(m.targets)],{presetName:'center',minZoom:160});
      if(m.eyes) board.showLiberties(points(m.eyes));
      if(m.marks) board.showIllegalHints(points(m.marks));
    }
    function finishItem() {
      s.done.add(s.index); s.locked = true; board.setInputEnabled(false);
      el('s11-next').disabled = false;
      if(s.done.size === s.moments.length) context.emit('scene_completion_unlocked',{});
    }
    function tap(hit) {
      if(s.locked || !s.alive) return;
      const m = s.moments[s.index];
      if(m.query && !s.queryAnswered) { el('s11-feedback').textContent='Önce gerçek göz / yalancı göz kararını ver.'; return; }
      const r = evaluateTwoEyesTap(s.board,m,hit);
      const key = `${hit.col},${hit.row}`;
      if(r.correct && s.tried.has(key)) return;
      context.emit('scene_assessment_answered',{stepIndex:m.curriculumStepIndex,exampleIndex:m.exampleIndex,assessmentIndex:s.index,assessmentType:'board_tap',concept:CONCEPT,correct:r.correct,legal:r.legal,row:hit.row,col:hit.col});
      el('s11-feedback').textContent = r.feedback;
      if(!r.correct) return;
      s.tried.add(key);
      if(m.kind === 'observe') {
        if(s.tried.size < m.targets.length) { el('s11-feedback').textContent = `${r.feedback} ${s.tried.size}/${m.targets.length} nokta denendi.`; return; }
      } else {
        const result = board.playMove({row:hit.row,col:hit.col,color:m.turn});
        if(!result.ok) throw new Error('TWO_EYES_MOVE_MISMATCH');
        s.board = r.newState; clearVisuals();
        if(m.afterEyes) board.showLiberties(points(m.afterEyes));
      }
      el('s11-feedback').textContent = m.success;
      if(m.continuation) { s.locked=true;board.setInputEnabled(false);el('s11-sequence').hidden=false; }
      else finishItem();
    }
    el('s11-real').onclick=()=>{el('s11-feedback').textContent='Siyah komşular birbirine bağlı mı? Son nefesi kalan parçayı incele.';};
    el('s11-false').onclick=()=>{s.queryAnswered=true;el('s11-feedback').textContent='Doğru. Şimdi beyaz olarak A’ya oyna ve alınan taşı gör.';};
    el('s11-confirm').onclick = () => {
      if(!s.alive || !el('s11-task').hidden) return;
      el('s11-confirm').disabled=true;el('s11-info').hidden=true;el('s11-task').hidden=false;s.locked=false;
      board.setInputEnabled(true);s.off = board.onIntersectionTap(tap);
      s.offHover=board.onIntersectionHover(hit=>{const m=s.moments[s.index];if(!hit || s.locked || !isValidMove(s.board,hit.col,hit.row,m.turn).valid) board.clearMovePreview();else board.setMovePreview({...hit,color:m.turn});});
      const m=s.moments[s.index];if(s.index===0) context.emit('scene_intro_confirmed',{});context.emit('scene_assessment_presented',{assessmentIndex:s.index,assessmentCount:s.moments.length,stepIndex:m.curriculumStepIndex,exampleIndex:m.exampleIndex,concept:CONCEPT,assessmentType:'board_tap'});
    };
    el('s11-sequence').onclick = async () => {
      if(!s.alive || el('s11-sequence').disabled) return;
      el('s11-sequence').disabled=true;
      for(const move of s.moments[s.index].continuation) {
        if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve=>{s.resolveWait=resolve;s.timer=setTimeout(()=>{s.resolveWait=null;s.timer=null;resolve()},350)});
        if(!s.alive) return;
        if(!isValidMove(s.board,move.x,move.y,move.color).valid) throw new Error('TWO_EYES_INVALID_CONTINUATION');
        s.board=applyMove(s.board,move.x,move.y,move.color).newState;
        const result=board.playMove({row:move.y,col:move.x,color:move.color});if(!result.ok) throw new Error('TWO_EYES_CONTINUATION_MISMATCH');
      }
      el('s11-feedback').textContent='Örnek devam tamamlandı: dıştan çevrili siyah grup yakalandı.';el('s11-sequence').hidden=true;finishItem();
    };
    el('s11-next').onclick = () => {
      if(!s.alive || !s.done.has(s.index)) return;
      s.off?.();s.off=null;board.setInputEnabled(false);
      if(s.index < s.moments.length-1) { const from=s.index++;el('s11-sequence').disabled=false;context.emit('scene_assessment_advanced',{fromIndex:from,toIndex:s.index});render(); }
      else if(!s.end) {root.hidden=true;s.end=mountTopicEndControls(context,{summaryText:'Tek göz ile sahte gözü ayırt ettin; kenar ve köşede iki ayrı gerçek göz oluşturarak grubu yaşattın.'});}
    };
    render();
  },
  unmount(context) {
    if(!active) return;
    active.alive=false;active.off?.();active.offHover?.();clearTimeout(active.timer);active.resolveWait?.();active.end?.destroy();active.root.remove();
    context.boardAdapter.setInputEnabled(false);context.boardAdapter.clearLiberties();context.boardAdapter.clearIllegalHints();context.boardAdapter.clearMovePreview();active=null;
  },
  canComplete() { return !!active && active.done.size === active.moments.length; },
  complete() {},
};
