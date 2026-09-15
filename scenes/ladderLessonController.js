import {isValidMove} from '../core/ruleEngine.js?v=2026-09-15.v0-text1';
import {LADDER_STEPS,createLadderScenario,seedBoard,whiteGroup,firstAtariTrial,goPoint} from './ladderLessonPolicy.js?v=2026-09-15.v0-text1';

export function mountLadderLesson({board,overlay,document,initialStep=0,onStepComplete=()=>{},onPresented=()=>{},onAllComplete=()=>{}}){
const $=id=>document.getElementById(id);
const basic=createLadderScenario(),breaker=createLadderScenario({breaker:{x:6,y:5}});
const longBasic=createLadderScenario({long:true}),longBreaker=createLadderScenario({long:true,breaker:{x:9,y:4}});
const state={step:0,scenario:basic,frame:0,limit:7,live:null,playing:false,waiting:false,timer:null,done:new Set(),attemptDone:false,found:new Set(),showLibs:false,showRoute:false,trial:false,practiceCount:0,predicted:false,picked:false,longSeen:new Set()};
const mode=()=>LADDER_STEPS[state.step].mode;
function stop(){clearTimeout(state.timer);state.timer=null;state.playing=false;state.waiting=false;$('play').textContent='Oynat';overlay.clear();refreshInput()}
function feedback(text,good=false){$('feedback').textContent=text;$('feedback').classList.toggle('good',good)}
function finish(){state.attemptDone=true;state.done.add(state.step);onStepComplete(state.step,state.done.size);$('next').disabled=false;refreshInput();refreshDots()}
function refreshDots(){for(const btn of $('steps').children){const index=Number(btn.dataset.index);btn.setAttribute('aria-pressed',index===state.step);btn.classList.toggle('done',state.done.has(index))}}
function inputColor(){
 if(state.playing||state.waiting||state.trial||state.attemptDone)return null;
 if(mode()==='first'||mode()==='practice')return 'black';
 if(mode()==='escape'||mode()==='support'&&!state.picked)return 'white';
 if(mode()==='capture'&&state.frame===basic.moves.length-1)return 'black';
 return null;
}
function refreshInput(){board.setInputEnabled(!!inputColor()||mode()==='liberties'&&!state.attemptDone||mode()==='escape'&&state.attemptDone);board.clearMovePreview();$('play').textContent=state.playing?'Duraklat':'Oynat'}
function marks(){
 board.clearLiberties();board.clearRegionMarks();
 if(mode()==='support'&&!state.picked)board.showLiberties([{col:6,row:5},{col:6,row:2}]);
 else if(state.showLibs||mode()==='escape'&&state.frame>=2)board.showLiberties(whiteGroup(state.live,state.scenario.anchor).liberties.map(p=>({col:p.x,row:p.y})));
 else if(mode()==='liberties')board.showLiberties([...state.found].map(k=>{const [col,row]=k.split(',').map(Number);return {col,row}}));
}
function badge(){const group=whiteGroup(state.live,state.scenario.anchor),last=state.scenario.frames[state.frame];$('badge').textContent=state.scenario.size+'×'+state.scenario.size+' · '+(group.count?'Beyaz: '+group.count+' nefes':last.captures.length?last.captures.length+' beyaz taş yakalandı':'Beyaz grup tahtada değil')}
function snapshot(stones){board.reset();board.clearMovePreview();for(const p of stones){const result=board.playMove({col:p.x,row:p.y,color:p.color});if(!result.ok)throw new Error('PROTOTYPE_BOARD_SNAPSHOT_'+result.reason)}state.live=seedBoard(stones,state.scenario.size)}
function frame(index,animate=false){
 index=Math.max(0,Math.min(state.limit,index));const target=state.scenario.frames[index];
 if(animate&&index===state.frame+1){const m=target.move;const result=board.playMove({col:m.x,row:m.y,color:m.color});if(!result.ok)throw new Error('PROTOTYPE_MOVE_'+result.reason);state.live=seedBoard(target.stones,state.scenario.size)}else snapshot(target.stones);
 state.frame=index;marks();badge();$('scrub').max=state.limit;$('scrub').value=index;$('counter').textContent=index+' / '+state.limit;$('frame-back').disabled=index===0;$('frame-next').disabled=index===state.limit;
 if(animate){const clip=state.scenario.blueprint.clips[index],pulse=clip?.steps.find(s=>s.type==='pulse-move'),capture=clip?.steps.find(s=>s.type==='lift-captured-stones');overlay.pulse({move:pulse?{...pulse.point,color:pulse.color}:null,captures:capture?.stones||[]})}
 if(['rhythm','breaker','support','long'].includes(mode()))feedback(index===0?'Diziyi oynatabilir veya tek tek ilerletebilirsin.':target.comment,target.group.count===0||state.scenario.outcome==='broken'&&index===state.limit);
 refreshInput();if(index===state.limit)motionEnd();
}
function motionEnd(){
 if(mode()==='rhythm')finish();
 else if(mode()==='breaker'&&state.predicted)finish();
 else if(mode()==='support'&&state.picked){
  if(state.scenario.outcome==='broken'){finish();feedback('Bu destek taşı kaçan gruba bağlandı. Beyazın üç nefesi var; merdiven ritmi bozuldu.',true)}
  else feedback('Bu destek taşı rotaya bağlanmadı. Merdiven yine 12 taşı yakaladı. Yeni denemede diğer noktayı seç.');
 }else if(mode()==='long'){
  state.longSeen.add(state.scenario.outcome);if(state.longSeen.size===2){finish();feedback('İki sonuç da görüldü: kırıcı olmadan 17 taş yakalanıyor; destek taşıyla beyazın nefesi üçe çıkıyor.',true)}
 }
}
function scenario(s,limit,initial=0){
 stop();state.scenario=s;state.limit=limit;state.frame=-1;board.setSize(s.size);overlay.setScenario(s);overlay.setRoute(state.showRoute);$('scrub').max=limit;
 frame(initial);board.focus('connections');board.focusPoints([{row:0,col:0},{row:0,col:s.size-1},{row:s.size-1,col:0},{row:s.size-1,col:s.size-1}],{presetName:'connections',minZoom:120,padding:s.size===9?24:18});
}
function play(){
 if(state.playing){stop();return}
 if(state.frame===state.limit)frame(0);
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){frame(state.limit);return}
 state.playing=true;refreshInput();
 const advance=()=>{
  if(!state.playing)return;
  if(state.frame>=state.limit){state.playing=false;refreshInput();return}
  frame(state.frame+1,true);
  const delay=state.scenario.storyboard.timeline[state.frame-1]?.durationMs||1200;
  state.timer=setTimeout(advance,delay);
 };
 state.timer=setTimeout(advance,350);
}
function choices(items){$('choices').replaceChildren();for(const item of items){const button=document.createElement('button');button.textContent=item.label;if(item.selected!==undefined)button.setAttribute('aria-pressed',item.selected);button.onclick=item.click;$('choices').append(button)}}
function longChoices(){choices([
 {label:'Kırıcı olmadan',selected:state.scenario===longBasic,click(){scenario(longBasic,longBasic.moves.length);longChoices()}},
 {label:'Kırıcı taşla',selected:state.scenario===longBreaker,click(){scenario(longBreaker,longBreaker.moves.length);longChoices()}}
])}
function mountStep(index){
 stop();state.step=index;state.attemptDone=false;state.found.clear();state.trial=false;state.practiceCount=0;state.predicted=false;state.picked=false;
 $('heading').textContent=(index+1)+' / '+LADDER_STEPS.length+' · '+LADDER_STEPS[index].title;$('story').textContent=LADDER_STEPS[index].text;
 $('next').disabled=!state.done.has(index);$('next').textContent=index===8?'Konuyu tamamla':'Devam →';$('previous').disabled=index===0;choices([]);
 $('transport').hidden=!['rhythm','breaker','support','long','capture'].includes(mode());
 if(mode()==='escape')scenario(basic,basic.moves.length,1);
 else if(mode()==='practice')scenario(basic,basic.moves.length,2);
 else if(mode()==='capture')scenario(basic,basic.moves.length-1,0);
 else if(mode()==='breaker'){
  scenario(breaker,breaker.moves.length);$('transport').hidden=true;
  choices([{label:'Siyah yine yakalar',click(){feedback('İlk atari yeterli bilgi vermiyor. Beyazın ilerideki destek taşına ulaşacağı yolu kontrol et.')}},{label:'Destek taşı merdiveni kırar',click(){state.predicted=true;choices([]);$('transport').hidden=false;feedback('Tahminini şimdi hamlelerle sınayalım.');play()}}]);
 }else if(mode()==='long'){scenario(longBasic,longBasic.moves.length);longChoices()}
 else scenario(basic,mode()==='rhythm'?7:basic.moves.length);
 if(mode()==='support'){$('transport').hidden=true;marks()}
 if(mode()==='first')feedback('Siyah oynuyorsun. İlk atarinin yönünü seç.');
 if(mode()==='liberties')feedback('İki boş nefes noktasını tahtada bul.');
 if(mode()==='escape')feedback('Beyaz oynuyorsun. Grubun tek nefesinden uzat.');
 if(mode()==='practice')feedback('Siyah oynuyorsun. Beyazın iki nefesinden doğru olanı kapat.');
 if(mode()==='capture')feedback('Merdiveni başından izleyelim. Son kaçıştan sonra beyaz zincirin son nefesini siyah olarak kapat.');
 refreshDots();refreshInput();
 if(mode()==='capture')play();
}
function tap(hit){
 if(state.playing||state.waiting||state.trial||state.attemptDone)return;
 const x=hit.col,y=hit.row;
 if(mode()==='liberties'){
  if(!whiteGroup(state.live,basic.anchor).liberties.some(p=>p.x===x&&p.y===y)){feedback('Bu kesişim beyaz grubun nefesi değil. Taşa yatay veya dikey komşu boş noktalara bak.');return}
  state.found.add(x+','+y);marks();feedback(state.found.size+' / 2 nefes bulundu.',state.found.size===2);if(state.found.size===2)finish();return;
 }
 const color=inputColor();if(!color)return;
 if(!isValidMove(state.live,x,y,color).valid){feedback('Bu noktada yasal hamle yok. Boş bir kesişim seç.');return}
 if(mode()==='first'){
  const trial=firstAtariTrial(basic,x,y);
  if(trial.correct){frame(1,true);finish();feedback('Doğru yönden atariye aldın: beyazın tek nefesi kaldı. Sonraki adımda kaçışı sen oynayacaksın.',true)}
  else {
   state.trial=true;snapshot(trial.board.stones);marks();badge();refreshInput();
   feedback(trial.reply?'Beyazı atariye aldın; fakat beyaz kaçınca '+trial.group.count+' nefese ulaştı. Bu yön merdiven ritmini kurmuyor. Yeni denemeyle diğer yönü karşılaştır.':'Bu hamle beyazı tek nefese indirmedi. Yeni denemede iki başlangıç nefesinden birini kapat.');
  }return;
 }
 if(mode()==='support'){
  if(!(x===6&&(y===5||y===2))){feedback('Bu denemede iki işaretli destek noktasından birini seç.');return}
  state.picked=true;scenario(x===6&&y===5?breaker:createLadderScenario({breaker:{x,y}}),x===6&&y===5?breaker.moves.length:basic.moves.length);$('transport').hidden=false;play();return;
 }
 const expected=state.scenario.moves[state.frame];
 if(x!==expected.x||y!==expected.y){feedback(mode()==='escape'?'Bu hamle tehdit altındaki grubu uzatmıyor. Grubun tek nefesini bul.':'Bu yönde merdivenin zorunlu atarisi sürmüyor. Beyazın nefeslerini ve önceki siyah taşları birlikte kontrol et.');return}
 if(mode()==='capture'){state.limit=basic.moves.length;frame(state.limit,true);finish();feedback('Son nefes kapandı: 12 beyaz taş tek zincir olarak yakalandı.',true);return}
 frame(state.frame+1,true);
 if(mode()==='escape'){finish();feedback('Beyaz uzadı ve iki nefese ulaştı. Şimdi siyahın bu iki nefesten doğru olanını kapatması gerekiyor.',true)}
 else if(mode()==='practice'){
  state.practiceCount++;feedback(state.practiceCount+' / 3 doğru atari.',true);
  if(state.practiceCount===3)finish();
  else{state.waiting=true;refreshInput();state.timer=setTimeout(()=>{state.waiting=false;frame(state.frame+1,true);feedback('Beyaz tek nefesinden kaçtı. Siyah olarak sonraki atariyi bul.');refreshInput()},850)}
 }
}
const offTap=board.onIntersectionTap(tap);
const offHover=board.onIntersectionHover(hit=>{if(mode()==='escape'&&state.frame>=2){marks();board.clearMovePreview();return}const color=inputColor();if(!hit||!color||!isValidMove(state.live,hit.col,hit.row,color).valid)board.clearMovePreview();else board.setMovePreview({...hit,color})});
$('play').onclick=play;
$('frame-back').onclick=()=>{stop();frame(state.frame-1)};
$('frame-next').onclick=()=>{stop();frame(state.frame+1,true)};
$('scrub').oninput=()=>{stop();frame(Number($('scrub').value))};
$('previous').onclick=()=>mountStep(state.step-1);
$('next').onclick=()=>{if(!state.done.has(state.step))return;if(state.step===8){if(state.done.size===9){stop();onAllComplete();return}mountStep(LADDER_STEPS.findIndex((_,i)=>!state.done.has(i)));return}mountStep(state.step+1)};
$('reset').onclick=()=>{state.done.delete(state.step);mountStep(state.step)};
$('libs').onclick=()=>{state.showLibs=!state.showLibs;$('libs').setAttribute('aria-pressed',state.showLibs);$('libs').textContent=state.showLibs?'Nefesleri gizle':'Nefesleri göster';marks()};
$('route').onclick=()=>{state.showRoute=!state.showRoute;$('route').setAttribute('aria-pressed',state.showRoute);$('route').textContent=state.showRoute?'Rotayı gizle':'Rotayı göster';overlay.setRoute(state.showRoute)};
LADDER_STEPS.forEach((s,index)=>{const button=document.createElement('button');button.textContent=index+1;button.title=s.title;button.setAttribute('aria-label',(index+1)+'. '+s.title);button.dataset.index=index;button.onclick=()=>mountStep(index);$('steps').append(button)});
mountStep(initialStep);
return {get canComplete(){return state.done.size===9},destroy(){stop();offTap?.();offHover?.();board.setInputEnabled(false);board.clearMovePreview();board.clearLiberties();board.clearRegionMarks();overlay.destroy()}};
}
