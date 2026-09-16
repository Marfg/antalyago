import {isValidMove} from '../core/ruleEngine.js?v=2026-09-16.v0-intersections1';
import {SNAP_STEPS,seedBoard,buildScenario,groupAt} from './snapbackLessonPolicy.js?v=2026-09-16.v0-intersections1';
export function mountSnapbackLesson({board,overlay,document,initialStep=0,onPresented=()=>{},onStepComplete=()=>{},onAllComplete=()=>{}}){
 const $=id=>document.getElementById(id),scenarios=SNAP_STEPS.map(buildScenario),done=new Set();
 let step=0,frame=0,live,ended=false,libs=false,term=null,alive=true;
 const current=()=>SNAP_STEPS[step],scenario=()=>scenarios[step],last=()=>scenario().frames[frame];
 const turn=()=>ended?null:scenario().moves[frame]?.color||null;
 const same=(a,b)=>a.x===b.x&&a.y===b.y;
 function message(t,good=false){$('feedback').textContent=t;$('feedback').classList.toggle('good',good)}
 function group(){return frame?groupAt(live,last().move):{count:0,liberties:[]}}
 function choices(items){$('choices').replaceChildren();for(const item of items){const b=document.createElement('button');b.textContent=item.label;b.onclick=item.click;$('choices').append(b)}}
 function dots(){for(const b of $('steps').children){b.setAttribute('aria-pressed',Number(b.dataset.index)===step);b.classList.toggle('done',done.has(Number(b.dataset.index)))}}
 function input(){board.clearMovePreview();board.setInputEnabled(alive&&!ended&&!!turn());const c=turn(),g=group();$('badge').textContent=(c?(c==='white'?'Beyaz':'Siyah')+' oynuyorsun':'Dizi tamamlandı')+(frame?' · '+g.count+' taş, '+g.liberties.length+' nefes':'')}
 function marks(){board.clearLiberties();if(libs||frame===2)board.showLiberties(group().liberties.map(p=>({col:p.x,row:p.y})))}
 function finish(t){ended=true;done.add(step);onStepComplete(step,done.size);$('next').disabled=false;choices([]);message(t,true);input();dots()}

 function load(index){overlay.clear();step=index;frame=0;ended=false;term=null;$('term-info').hidden=true;for(const k of ['snapback'])$('term-'+k).setAttribute('aria-pressed',false);board.setSize(9);board.reset();live=seedBoard(scenario().seed);for(const p of scenario().seed)if(!board.playMove({col:p.x,row:p.y,color:p.color}).ok)throw new Error('SNAPBACK_SEED');overlay.setScenario(scenario());overlay.setRoute(false);board.focus('connections');board.focusPoints([{row:0,col:0},{row:0,col:8},{row:8,col:0},{row:8,col:8}],{presetName:'connections',minZoom:120,padding:24});$('heading').textContent=(index+1)+' / '+SNAP_STEPS.length+' · '+current().title;$('story').textContent=current().text;$('previous').disabled=index===0;$('next').disabled=!done.has(index);$('next').textContent=index===SNAP_STEPS.length-1?'Dersi tamamla':'Devam →';choices([]);message('Kurban hamlesini tahtada bul. İpucu için “Sıradaki noktayı göster”i kullanabilirsin.');input();marks();dots();onPresented(index)}
 function tap(hit){if(!alive||ended)return;const p={x:hit.col,y:hit.row};
  const m=scenario().moves[frame],c=turn();if(!m||!c)return;if(!isValidMove(live,p.x,p.y,c).valid){message('Bu noktada yasal hamle yok. Boş bir kesişim seç.');return}if(!same(m,p)){message(frame===0?'Bu hamle tanımlı diziyi başlatmıyor. Kurban taşının yalnız bir nefesi kalacak noktayı ara.':frame===1?'Kurban taşını son nefesinden al.':'Kurbanın boşalttığı noktadan geri al.');return}
  const f=scenario().frames[++frame];if(!board.playMove({row:m.y,col:m.x,color:c}).ok)throw new Error('SNAPBACK_MOVE');live=seedBoard(f.stones);live.koPoint=f.koPoint;overlay.pulse({move:m,captures:f.captures});input();marks();
  if(frame===scenario().moves.length){finish('Snapback tamamlandı: bir taş kurban edildi, '+f.captures.length+' rakip taşı geri alındı.');return}
  message(frame===1?(turn()==='white'?'Beyaz':'Siyah')+' oynuyorsun. Kurban taşını al.':(turn()==='white'?'Beyaz':'Siyah')+' oynuyorsun. Rakibin tek nefesi işaretlendi; geri al.');
 }
 const offTap=board.onIntersectionTap(tap),offHover=board.onIntersectionHover(hit=>{const c=turn();if(!hit||!c||!isValidMove(live,hit.col,hit.row,c).valid)board.clearMovePreview();else board.setMovePreview({...hit,color:c})});
 $('previous').onclick=()=>load(step-1);$('reset').onclick=()=>load(step);$('next').onclick=()=>{if(!done.has(step))return;if(step<SNAP_STEPS.length-1)return load(step+1);if(done.size!==SNAP_STEPS.length)return load(SNAP_STEPS.findIndex((_,i)=>!done.has(i)));message('Dört adım tamamlandı. Kurbanı almadan önce ve aldıktan sonra nefesleri say.',true);onAllComplete()};
 $('libs').onclick=()=>{libs=!libs;$('libs').setAttribute('aria-pressed',libs);$('libs').textContent=libs?'Nefesleri gizle':'Nefesleri göster';marks()};
 $('hint').onclick=()=>{const p=scenario().moves[frame];if(p)board.showLiberties([{row:p.y,col:p.x}]);message('Sıradaki nokta işaretlendi. Hamleyi tahtada kendin oyna.')};
 const terms={snapback:'Snapback · uttegaeshi (ウッテガエシ): kurban taşının alınmasından sonra boşalan noktadan daha büyük rakip grubu geri alma tesujisi.'};for(const [k,t]of Object.entries(terms))$('term-'+k).onclick=()=>{term=term===k?null:k;for(const key of Object.keys(terms))$('term-'+key).setAttribute('aria-pressed',term===key);$('term-info').textContent=t;$('term-info').hidden=term===null};
 SNAP_STEPS.forEach((s,i)=>{const b=document.createElement('button');b.textContent=i+1;b.dataset.index=i;b.setAttribute('aria-label',(i+1)+'. '+s.title);b.onclick=()=>load(i);$('steps').append(b)});load(initialStep);
 return {get canComplete(){return done.size===SNAP_STEPS.length},destroy(){alive=false;offTap?.();offHover?.();overlay.destroy();board.setInputEnabled(false);board.clearMovePreview();board.clearLiberties()}};
}
