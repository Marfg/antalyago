import { STAGES, createBoard, attempt, liberties, coord, key } from './illegalNativePolicy.js?v=2026-09-22.illegal-native2';
import { mountTopicEndControls } from './topicEndControls.js?v=2026-09-22.illegal-native2';

let dispose, completed=false;
export const scene08IllegalMoves={
 id: 'scene-08-illegal-moves',version:5,title:'Yasak Hamleler',
 curriculumRef:{lessonId:'l4',concept:'forbidden_move',stepIndex:0},
 mount(context){
  completed=false;
  const a=context.boardAdapter, timers=new Set();
  let index=0, board, active=true, busy=false, ready=false, hints=0, tries=0, found=new Set(), resultView=null, showingBefore=false, end;
  const root=document.createElement('div');root.className='ls-strip-root illegal-native-root';
  root.innerHTML=`<style>
   body:has(.illegal-native-root){--narration-h:260px}
   #ls-scene-host:has(.illegal-native-root){max-width:760px;justify-content:flex-start}
   .illegal-native{display:flex;flex-direction:column;gap:7px;padding:4px 0;text-align:left}
   .illegal-native[hidden],.illegal-native [hidden]{display:none!important}
   .illegal-native p{margin:0;line-height:1.45;font-size:14px}
   .illegal-native .in-heading{font-size:19px;font-weight:650;color:var(--text)}
   .illegal-native .in-progress{font-size:12px;color:var(--gold2)}
   .illegal-native .in-context{color:#bdbbc1}
   .illegal-native .in-prompt{font-weight:600}
   .illegal-native .in-evidence{color:#7dddc7;font-size:13px}
   .illegal-native .in-concept{color:var(--gold2);font-size:13px}
   .illegal-native .in-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:3px}
   .illegal-native .ls-strip-btn{width:auto;min-height:36px;padding:6px 12px;font-size:13px}
   @media(max-width:480px){body:has(.illegal-native-root){--narration-h:320px}.illegal-native .in-heading{font-size:17px}.illegal-native p{font-size:13px}}
   @media(max-height:520px){body:has(.illegal-native-root){--narration-h:190px}}
  </style><section class="illegal-native" aria-label="Tahta deneyi">
   <p class="in-progress"></p><h2 class="in-heading" style="margin:0"></h2>
   <p class="in-context"></p><p class="in-prompt"></p>
   <p class="in-feedback" role="status" aria-live="polite"></p>
   <p class="in-evidence"></p><p class="in-concept"></p>
   <div class="in-actions">
    <button class="ls-strip-btn ls-strip-btn--ghost" data-action="hint">İpucu</button>
    <button class="ls-strip-btn ls-strip-btn--ghost" data-action="retry" hidden>Geri al ve sürdür</button>
    <button class="ls-strip-btn ls-strip-btn--ghost" data-action="compare" hidden>Hamleden önce</button>
    <button class="ls-strip-btn" data-action="next" hidden>Devam</button>
   </div></section>`;
  context.container.appendChild(root);
  const panel=root.querySelector('section'), $=name=>root.querySelector(name);
  const progress=$('.in-progress'), heading=$('.in-heading'), intro=$('.in-context'), prompt=$('.in-prompt'), feedback=$('.in-feedback'), evidence=$('.in-evidence'), concept=$('.in-concept');
  const hint=$('[data-action="hint"]'), retry=$('[data-action="retry"]'), compare=$('[data-action="compare"]'), next=$('[data-action="next"]');
  const stage=()=>STAGES[index];
  function emit(type,data={}){context.emit(type,{concept:'forbidden_move',assessmentIndex:index,momentKey:stage().key,...data});}
  function phase(value){panel.dataset.phase=value;emit('scene_phase_changed',{phase:value});}
  function later(fn,ms){const id=setTimeout(()=>{timers.delete(id);if(!active)return;if(context.container.hidden){later(fn,100);return;}fn();},ms);timers.add(id);}
  function clear(){a.clearLiberties();a.clearMovePreview();a.clearIllegalHints();a.clearIllegalMoves();}
  function seed(state=board){a.reset();state.stones.forEach(s=>a.playMove({row:s.y,col:s.x,color:s.color}));}
  function marks(){a.showIllegalMoves(stage().mode==='discover'?stage().targets.filter(p=>found.has(key(p))):[]);}
  function lock(value){busy=value;a.setInputEnabled(!value&&!ready&&!completed);hint.disabled=value||hints===3||ready;}
  function updateProgress(){progress.textContent=`${index+1} / ${STAGES.length} · ${stage().color==='black'?'Siyah':'Beyaz'} oynar${stage().mode==='discover'?` · ${found.size} / 4 yer keşfedildi`:''}`;}
  function load(){
   board=createBoard(stage());found=new Set();hints=0;tries=0;ready=false;resultView=null;showingBefore=false;
   clear();seed();a.focus('overview');
   a.focusPoints([...stage().stones.map(s=>({row:s.y,col:s.x})),...stage().targets],{presetName:'overview',minZoom:160,padding:24,motion:false});
   panel.dataset.moment=stage().key;heading.textContent=stage().title;intro.textContent=stage().context;intro.hidden=false;prompt.textContent=stage().prompt;
   feedback.textContent=evidence.textContent=concept.textContent='';hint.hidden=false;hint.textContent='İpucu';retry.hidden=compare.hidden=next.hidden=true;
   next.textContent=stage().nextLabel||(index===STAGES.length-1?'Tamamla':'Devam');updateProgress();phase('observe');lock(false);
   // Only the independent transfer exercise provides an assessment result.
   emit(stage().mode==='transfer'?'scene_assessment_presented':'scene_experiment_presented',{assessmentCount:STAGES.length,assessmentType:'board_tap',mode:stage().mode});
  }
  function renderResult(result,point){
   if(result.ok){a.showLiberties(result.liberties);evidence.textContent=`Alınan rakip taş: ${result.capturedCount} · ${stage().color==='black'?'Siyah':'Beyaz'} grubun nefes noktası: ${result.liberties.length}`;}
   else{
    a.showIllegalMoves([...stage().targets.filter(p=>found.has(key(p))),point]);
    evidence.textContent='Hamle oynanmadı · Rakip taş alınmıyor · Yeni grubun nefes noktası oluşmuyor';
    if(stage().opponent){
     const remaining=liberties(board,stage().opponent).filter(p=>key(p)!==key(point));a.showLiberties(remaining);
     evidence.textContent=`Hamle oynanmadı · Rakip grubun açık kalacak nefes noktası: ${remaining.length} (${remaining.map(coord).join(', ')})`;
    }
   }
  }
  function onTap(point){
   if(!active||busy||ready||context.container.hidden)return;
   const s=stage(), result=attempt(board,point,s.color), target=s.targets.find(p=>key(p)===key(point));
   const observed=!!target&&(s.mode==='discover'||s.expected==='reject' ? !result.ok&&result.reason==='SUICIDE' : result.ok&&(s.expected!=='capture'||result.capturedCount===5));
   if(result.reason==='OCCUPIED'){
    feedback.textContent='Bu kesişimde zaten bir taş var. Boş bir kesişim seç.';emit('scene_move_rejected',{...point,color:s.color,reason:result.reason});return;
   }
   tries++;clear();marks();lock(true);phase('act');intro.hidden=true;feedback.textContent=evidence.textContent=concept.textContent='';
   if(result.ok)a.playMove({...point,color:s.color,animateCapture:true});else a.showIllegalMoves([...s.targets.filter(p=>found.has(key(p))),point]);
   emit('scene_illegal_move_attempted',{...point,color:s.color,legal:result.ok,reason:result.reason||null,boardChanged:result.ok,capturedCount:result.capturedCount,isSceneTarget:!!target,attemptNumber:tries,hintLevel:hints,alreadyAttempted:found.has(key(point))});
   if(s.mode==='transfer')emit('scene_assessment_answered',{...point,assessmentConcept:'capture',correct:observed,attemptNumber:tries,hintRequested:hints>0,hintLevel:hints,capturedCount:result.capturedCount,...(observed?{resultConcept:'capture'}:{})});
   later(()=>{
    phase('consequence');renderResult(result,point);
    if(!observed){
     feedback.textContent=result.ok?'Taş burada yerleşebiliyor. İşaretler bu grubun nefes noktaları. Sonucu incele; sonra başlangıca dönüp görevdeki şekli araştır.':'Bu hamle oynanamıyor. Başlangıca dönüp görevdeki şeklin nefes noktalarını incele.';
     retry.hidden=false;hint.hidden=true;return;
    }
    feedback.textContent=s.mode==='discover'?`${target.label}: ${target.detail}`:s.consequence;
    if(s.mode==='discover')found.add(key(point));
    updateProgress();resultView={result,point};
    later(()=>{
     phase('concept');concept.textContent=s.conclusion;
     if(s.mode==='discover'){
      heading.textContent='Yasak hamleler';ready=found.size===s.targets.length;
      prompt.textContent=ready?'Dört farklı yerde aynı sonucu gördün. Şimdi aynı noktayı beyazla deneyeceğiz.':'Diğer kapalı boşlukları da dene. Merkez, kenar ve köşeyi karşılaştır.';
      marks();
     }else{ready=true;prompt.textContent='';compare.hidden=false;compare.textContent='Hamleden önce';}
     hint.hidden=ready;next.hidden=!ready;lock(false);
     emit('scene_experiment_observed',{...point,legal:result.ok,capturedCount:result.capturedCount,hintLevel:hints,uniqueTargetsFound:found.size,completionBasis:'observed'});
    },650);
   },750);
  }
  function onRetry(){
   if(retry.hidden||context.container.hidden)return;
   seed();clear();marks();retry.hidden=true;hint.hidden=false;feedback.textContent=evidence.textContent=concept.textContent='';intro.hidden=false;
   emit('scene_move_undone',{reason:'experiment_reset'});phase('observe');lock(false);
  }
  function onHint(){
   if(busy||ready||hints===3||context.container.hidden)return;
   hints++;feedback.textContent=stage().hints[hints-1];
   if(hints===3)a.showIllegalHints(stage().targets.filter(p=>!found.has(key(p))));
   hint.textContent=`İpucu ${hints} / 3`;hint.disabled=hints===3;emit('scene_hint_revealed',{hintLevel:hints,hintRequested:true});
  }
  function onCompare(){
   if(!ready||!resultView||context.container.hidden)return;
   showingBefore=!showingBefore;clear();
   seed(showingBefore?board:resultView.result.newState||board);
   if(showingBefore){
    evidence.textContent=stage().opponent?`Hamleden önce · Rakip grubun nefes noktası: ${liberties(board,stage().opponent).length}`:'Hamleden önce · Başlangıç konumu';
    if(stage().opponent)a.showLiberties(liberties(board,stage().opponent));
   }else renderResult(resultView.result,resultView.point);
   compare.textContent=showingBefore?'Hamleden sonra':'Hamleden önce';
   emit('scene_comparison_viewed',{view:showingBefore?'before':'after'});
  }
  function onNext(){
   if(!ready||completed||context.container.hidden)return;
   if(index<STAGES.length-1){emit('scene_assessment_advanced',{fromAssessmentIndex:index,toAssessmentIndex:index+1});index++;load();}
   else{completed=true;clear();lock(true);panel.hidden=true;emit('scene_completion_unlocked',{completionBasis:'experiments_and_transfer'});end=mountTopicEndControls(context,{summaryText:'Boş bir nokta her zaman oynanabilir değildir. Önce nefes noktası kalmayan rakip taşlar kaldırılır; ardından kendi grubunun en az bir nefes noktası kalmalıdır. Bu kural merkezde, kenarda, köşede ve iki renk için de aynıdır.'});}
  }
  a.setSize(9);load();const off=a.onIntersectionTap(onTap);
  const listeners=[[hint,onHint],[retry,onRetry],[compare,onCompare],[next,onNext]];listeners.forEach(([el,fn])=>el.addEventListener('click',fn));
  dispose=()=>{active=false;timers.forEach(clearTimeout);timers.clear();off();listeners.forEach(([el,fn])=>el.removeEventListener('click',fn));a.setInputEnabled(false);clear();end?.destroy();root.remove();};
 },
 unmount(){dispose?.();dispose=null;completed=false;},canComplete(){return completed;},complete(){},
};
