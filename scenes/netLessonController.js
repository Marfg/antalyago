import {isValidMove} from '../core/ruleEngine.js?v=2026-09-13.8';
import {NET_FORMS,NET_STEPS,seedBoard,targetGroup,netSequence,permutations,goPoint} from './netLessonPolicy.js?v=2026-09-13.8';

export function mountNetLesson({board,overlay,document,initialStep=0,onPresented=()=>{},onStepComplete=()=>{},onAllComplete=()=>{}}){
 const $=id=>document.getElementById(id);
 const variants=Object.fromEntries(Object.entries(NET_FORMS).map(([name,f])=>[name,permutations(f.exits).map(order=>netSequence(name,order))]));
 const state={step:0,frame:0,scenario:variants.basic[0],done:new Set(),attemptDone:false,showLibs:false,found:new Set(),order:[],routes:new Set(),term:null};
 const mode=()=>NET_STEPS[state.step].mode,form=()=>NET_FORMS[NET_STEPS[state.step].form];
 const same=(a,b)=>a.x===b.x&&a.y===b.y;
 let live,alive=true;
 function color(){
  if(state.attemptDone||mode()==='liberties')return null;
  return state.scenario.moves[state.frame]?.color||null;
 }
 function input(){board.clearMovePreview();board.setInputEnabled(alive&&(!!color()||mode()==='liberties'&&!state.attemptDone));badge()}
 function badge(){const g=targetGroup(live,state.scenario.anchor),last=state.scenario.frames[state.frame],turn=color();$('badge').textContent=(g.count?'Beyaz: '+g.count+' nefes':last.captures.length+' beyaz taş yakalandı')+(turn?' · '+(turn==='white'?'Beyaz oynuyorsun':'Siyah oynuyorsun'):'')}
 function message(text,good=false){$('feedback').textContent=text;$('feedback').classList.toggle('good',good)}
 function marks(){board.clearLiberties();board.clearRegionMarks();const g=targetGroup(live,state.scenario.anchor);if(state.showLibs||state.scenario.frames[state.frame].move?.color==='white'&&color()==='black')board.showLiberties(g.liberties.map(p=>({col:p.x,row:p.y})));else if(mode()==='liberties')board.showLiberties([...state.found].map(k=>{const [col,row]=k.split(',').map(Number);return {col,row}}))}
 function dots(){for(const btn of $('steps').children){btn.setAttribute('aria-pressed',Number(btn.dataset.index)===state.step);btn.classList.toggle('done',state.done.has(Number(btn.dataset.index)))}}
 function finish(){state.done.add(state.step);onStepComplete(state.step,state.done.size);state.attemptDone=true;$('next').disabled=false;input();dots()}
 function stop(){overlay.clear();if(live)input()}
 function seed(stones){board.reset();board.clearMovePreview();for(const p of stones){if(!board.playMove({col:p.x,row:p.y,color:p.color}).ok)throw new Error('NET_SEED_MISMATCH')}live=seedBoard(stones)}
 function setFrame(index,animate=false){
  index=Math.max(0,Math.min(state.scenario.moves.length,index));const f=state.scenario.frames[index];
  if(animate&&index===state.frame+1){if(!board.playMove({col:f.move.x,row:f.move.y,color:f.move.color}).ok)throw new Error('NET_PLAY_MISMATCH');live=seedBoard(f.stones)}else seed(f.stones);
  state.frame=index;marks();input();
  if(animate){const c=state.scenario.blueprint.clips[index],p=c.steps.find(s=>s.type==='pulse-move'),capture=c.steps.find(s=>s.type==='lift-captured-stones');overlay.pulse({move:p?{...p.point,color:p.color}:null,captures:capture?.stones||[]})}
  if(index===state.scenario.moves.length)end();
 }
 function mountScenario(s,frame=0){stop();state.scenario=s;state.frame=-1;board.setSize(9);overlay.setScenario(s);overlay.setRoute(false);setFrame(frame);board.focus('connections');board.focusPoints([{col:0,row:0},{col:8,row:0},{col:0,row:8},{col:8,row:8}],{presetName:'connections',minZoom:120,padding:24})}
 function choices(items){$('choices').replaceChildren();for(const item of items){const b=document.createElement('button');b.textContent=item.label;if(item.selected!==undefined)b.setAttribute('aria-pressed',item.selected);b.onclick=item.click;$('choices').append(b)}}
 function resetRoute(){state.attemptDone=false;state.order=[];mountScenario(variants[NET_STEPS[state.step].form][0],1);choices([]);message('Beyaz oynuyorsun. Başlangıçtaki diğer çıkışı seç.');input()}
 function end(){
  if(['branches','edge'].includes(mode())){
   state.routes.add(state.order[0].x+','+state.order[0].y);
   if(state.routes.size===2){finish();choices([]);message('İki başlangıç kaçışı da yakalamayla bitti. Beyazın uzadığı taraftaki yeni nefes kapatılmalı.',true)}
   else{state.attemptDone=true;input();message('İlk kaçışta '+state.scenario.frames.at(-1).captures.length+' beyaz taş yakalandı. Şimdi diğer başlangıç çıkışını sına.',true);choices([{label:'Diğer çıkışı dene',click:resetRoute}])}
  }else{finish();message('Ağ üç çıkışı da kapattı: beş beyaz taş birlikte yakalandı.',true)}
 }
 function mountStep(index){
  stop();state.step=index;state.attemptDone=false;state.found.clear();state.order=[];state.routes.clear();state.term=null;$('term-info').hidden=true;$('term-geta').setAttribute('aria-pressed',false);
  $('heading').textContent=(index+1)+' / '+NET_STEPS.length+' · '+NET_STEPS[index].title;$('story').textContent=NET_STEPS[index].text;$('next').disabled=!state.done.has(index);$('next').textContent=index===NET_STEPS.length-1?'Dersi tamamla':'Devam →';$('previous').disabled=index===0;choices([]);
  mountScenario(variants[NET_STEPS[index].form][0],mode()==='branches'?1:0);
  message(mode()==='liberties'?'İki nefes noktasını tahtada bul.':mode()==='branches'?'Beyaz oynuyorsun. Bir çıkıştan uzat.':'Siyah oynuyorsun. Ağ hamlesini tahtada bul.');input();marks();dots();onPresented(index);
 }
 function tap(hit){
  if(!alive||state.attemptDone)return;const p={x:hit.col,y:hit.row},g=targetGroup(live,state.scenario.anchor);
  if(mode()==='liberties'){if(!g.liberties.some(q=>same(q,p))){message('Bu nokta beyazın nefesi değil. Yatay veya dikey komşu boş kesişimleri kontrol et.');return}state.found.add(p.x+','+p.y);marks();message(state.found.size+' / 2 nefes bulundu.',true);if(state.found.size===2)finish();return}
  const turn=color();if(!turn)return;if(!isValidMove(live,p.x,p.y,turn).valid){message('Burada yasal hamle yok. Boş bir kesişim seç.');return}
  if(turn==='white'){
   const exits=form().exits,remaining=exits.filter(q=>!state.order.some(a=>same(a,q)));
   if(!remaining.some(q=>same(q,p))){message('Bu denemede hedef zincire bağlı bir kaçış oyna. Yeni çıkışları beyaz taşların nefeslerinden bul.');return}
   if(['branches','edge'].includes(mode())&&state.order.length===0&&state.routes.has(p.x+','+p.y)){message('Bu başlangıç kaçışını zaten sınadın. Diğer çıkıştan uzat.');return}
   state.order.push(p);state.scenario=variants[NET_STEPS[state.step].form].find(v=>state.order.every((q,i)=>same(v.moves[2*i+1],q)));
  }
  const expected=state.scenario.moves[state.frame];if(!same(expected,p)){message(turn==='black'?(state.frame===0?'Bu hamle ağın iki kolunu tamamlamıyor. Rakibe bitişmek yerine çıkışların önüne yerleş.':'İçerideki nefesi değil, uzayan taşın dışarı açtığı yeni nefesi kapat.'):'Hedef grubu boş nefesinden uzat.');return}
  setFrame(state.frame+1,true);
  if(mode()==='build'){finish();message('Ağ kuruldu. Beyazın iki nefesi duruyor; ilk hamle atari değil. Bir sonraki adımda kaçışların neden işe yaramadığını sınayacaksın.',true);return}
  if(state.frame===state.scenario.moves.length)return;
  message(color()==='white'?'Beyaz oynuyorsun. Kalan çıkıştan uzat.':'Siyah oynuyorsun. Beyazın yeni dış nefesini kapat.');marks();
 }
 const offTap=board.onIntersectionTap(tap),offHover=board.onIntersectionHover(hit=>{const turn=color();if(!hit||!turn||!isValidMove(live,hit.col,hit.row,turn).valid)board.clearMovePreview();else board.setMovePreview({...hit,color:turn})});
 $('previous').onclick=()=>mountStep(state.step-1);$('next').onclick=()=>{if(!state.done.has(state.step))return;if(state.step<NET_STEPS.length-1){mountStep(state.step+1);return}if(state.done.size!==NET_STEPS.length){mountStep(NET_STEPS.findIndex((_,i)=>!state.done.has(i)));return}stop();message('Beş adım tamamlandı. Küçük ağ, iki taşlı ağ ve kenar ağının kaçışlarını yakalamaya kadar sınadın.',true);onAllComplete()};
 $('reset').onclick=()=>mountStep(state.step);$('libs').onclick=()=>{state.showLibs=!state.showLibs;$('libs').setAttribute('aria-pressed',state.showLibs);$('libs').textContent=state.showLibs?'Nefesleri gizle':'Nefesleri göster';marks()};
 const terms={geta:'Geta (ゲタ): ağ. Kaçan zincirin çıkışlarını önden kapatan tesuji. İlk hamlenin rakibi atariye alması gerekmez.'};
 for(const [key,text] of Object.entries(terms))$('term-'+key).onclick=()=>{state.term=state.term===key?null:key;for(const k of Object.keys(terms))$('term-'+k).setAttribute('aria-pressed',state.term===k);$('term-info').textContent=text;$('term-info').hidden=state.term===null};
 NET_STEPS.forEach((s,index)=>{const b=document.createElement('button');b.textContent=index+1;b.dataset.index=index;b.title=s.title;b.setAttribute('aria-label',(index+1)+'. '+s.title);b.onclick=()=>mountStep(index);$('steps').append(b)});
 mountStep(initialStep);
 return {get canComplete(){return state.done.size===NET_STEPS.length},destroy(){alive=false;stop();offTap?.();offHover?.();overlay.destroy();board.setInputEnabled(false);board.clearMovePreview();board.clearLiberties()}};
}
