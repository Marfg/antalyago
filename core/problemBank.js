/** AntalyaGo Problem Havuzu -> 3D LessonEngine adaptörü. */
export const PROBLEM_SCHEMA_VERSION = '1.0.0';
export const INTERACTION_TYPES = Object.freeze(['point_select','multi_point_select','stone_select','binary_judgement','choice_on_board','numeric_count','sequence','construct_shape','capture_goal','save_goal']);
const SIZES=new Set([9,13,19]), STAGES=new Set(['guided_practice','variable_practice','assessment','diagnostic']), COLORS=new Set(['B','W']);
const copy=v=>JSON.parse(JSON.stringify(v));
const isPoint=(p,size)=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<size&&p.y<size;

export function validateProblem(p){
 const errors=[];
 if(!p||typeof p!=='object') return {valid:false,errors:['Problem nesnesi yok.']};
 if(p.schemaVersion!==PROBLEM_SCHEMA_VERSION) errors.push('schemaVersion 1.0.0 olmalı.');
 if(!/^[a-z0-9][a-z0-9-]+$/.test(p.id||'')) errors.push('id kebab-case olmalı.');
 if(!p.title?.trim()) errors.push('title zorunlu.');
 if(!p.curriculum?.chapter||!p.curriculum?.lesson) errors.push('Müfredat eşlemesi zorunlu.');
 if(!STAGES.has(p.stage)) errors.push('stage geçersiz.');
 if(!INTERACTION_TYPES.includes(p.interactionType)) errors.push('interactionType geçersiz.');
 if(!SIZES.has(p.board?.size)) errors.push('board.size 9, 13 veya 19 olmalı.');
 if(!COLORS.has(p.board?.toPlay)) errors.push('board.toPlay B veya W olmalı.');
 if(!Array.isArray(p.board?.stones)) errors.push('board.stones dizi olmalı.');
 const size=p.board?.size, occupied=new Set();
 (p.board?.stones||[]).forEach(s=>{if(!isPoint(s,size))errors.push('Taş koordinatı tahta dışında.');if(!COLORS.has(s.color))errors.push('Taş rengi geçersiz.');const k=`${s.x},${s.y}`;if(occupied.has(k))errors.push(`Çakışan taş: ${k}.`);occupied.add(k)});
 const points=[...(p.board?.markers||[]),...(p.solution?.acceptedMoves||[]),...(p.goal?.targetPoints||[]),...(p.goal?.targetGroup||[])];
 points.forEach(x=>{if(!isPoint(x,size))errors.push('Koordinat tahta dışında.')});
 if(!p.solution) errors.push('solution zorunlu.');
 if(['point_select','capture_goal','save_goal','construct_shape'].includes(p.interactionType)&&!p.solution?.acceptedMoves?.length) errors.push('acceptedMoves zorunlu.');
 if(p.interactionType==='sequence'&&!p.solution?.sequence?.length) errors.push('sequence zorunlu.');
 if(['binary_judgement','choice_on_board','numeric_count'].includes(p.interactionType)&&!p.question?.options?.length) errors.push('question.options zorunlu.');
 if(!p.rights?.status) errors.push('rights.status zorunlu.');
 return {valid:!errors.length,errors};
}

function point(p,size,t){let{x,y}=p,r=((t.rotate||0)%360+360)%360;if(r===90)[x,y]=[size-1-y,x];else if(r===180)[x,y]=[size-1-x,size-1-y];else if(r===270)[x,y]=[y,size-1-x];if(t.mirrorX)x=size-1-x;if(t.mirrorY)y=size-1-y;x+=t.translateX||0;y+=t.translateY||0;return{...p,x,y}}
function mapFields(p,fn){const map=a=>Array.isArray(a)?a.map(fn):a;p.board.stones=map(p.board.stones);p.board.markers=map(p.board.markers);p.solution.acceptedMoves=map(p.solution.acceptedMoves);if(p.solution.sequence)p.solution.sequence=p.solution.sequence.map(n=>({...n,move:fn(n.move)}));if(p.goal?.targetPoints)p.goal.targetPoints=map(p.goal.targetPoints);if(p.goal?.targetGroup)p.goal.targetGroup=map(p.goal.targetGroup)}

export function createProblemVariant(source,transform={}){const p=copy(source),size=p.board.size;mapFields(p,x=>point(x,size,transform));if(transform.swapColors){p.board.toPlay=p.board.toPlay==='B'?'W':'B';p.board.stones.forEach(s=>s.color=s.color==='B'?'W':'B')}const check=validateProblem(p);if(!check.valid)throw new Error(check.errors.join(' | '));p.variant={canonicalId:source.id,...transform};return p}

function mini(p){return{text:p.question.prompt,options:p.question.options.map(o=>({text:o.text,correct:!!o.correct,feedback:o.feedback||(o.correct?'Doğru!':'Tekrar düşün.')}))}}
export function problemToLessonStep(source,{transform=null,revealHints=false}={}){
 const p=transform?createProblemVariant(source,transform):copy(source),check=validateProblem(p);if(!check.valid)throw new Error(`Geçersiz problem ${p.id}: ${check.errors.join(' | ')}`);
 const accepted=p.solution.acceptedMoves||[],seq=p.solution.sequence||[];
 const step={text:`<p><strong>${p.title}</strong></p><p>${p.question.prompt}</p>`,board:p.board.stones.map(s=>({color:s.color,x:s.x,y:s.y})),markers:(p.board.markers||[]).map(x=>({...x})),turn:p.board.toPlay==='B'?'black':'white',size:p.board.size,camera:p.presentation?.camera,fb:{t:p.feedback?.initial||p.question.prompt,c:'info'},fb_ok:p.feedback?.correct||'Doğru!',fb_err:p.feedback?.incorrect||'Bu hamle hedefi karşılamıyor.',problemMeta:{id:p.id,canonicalId:p.variant?.canonicalId||p.id,concepts:p.concepts,curriculum:p.curriculum,stage:p.stage,interactionType:p.interactionType,difficulty:p.difficulty,source:p.source,solutionTree:p.solution.tree||null,terminalChecks:p.solution.terminalChecks||[],hints:revealHints?(p.hints||[]):[]}};
 if(['binary_judgement','choice_on_board','numeric_count'].includes(p.interactionType)){step.auto=true;step.miniQuestion=mini(p)}else if(p.interactionType==='sequence'){if(seq[0]?.move)step.answer=seq[0].move;step.movesAfterAnswer=seq.slice(1).map(n=>({color:n.color,...n.move}))}else if(accepted.length===1)step.answer=accepted[0];else if(accepted.length>1)step.answers=accepted;
 return step;
}
export const buildLessonFromProblems=(problems,{id,title})=>({id,title,steps:problems.map(p=>problemToLessonStep(p))});
export function selectProblemEntries(index,f={}){return(index.problems||[]).filter(e=>(!f.chapter||e.curriculum?.chapter===f.chapter)&&(!f.lesson||e.curriculum?.lesson===f.lesson)&&(!f.stage||e.stage===f.stage)&&(!f.status||e.status===f.status)&&(!f.concept||(e.concepts||[]).includes(f.concept)))}
export async function loadProblemBank(indexUrl='./content/problem-bank/index.json',fetchImpl=globalThis.fetch){if(!fetchImpl)throw new Error('fetch bulunamadı.');const ir=await fetchImpl(indexUrl);if(!ir.ok)throw new Error(`İndeks yüklenemedi: ${ir.status}`);const index=await ir.json(),base=new URL(indexUrl,globalThis.location?.href||'http://localhost/'),problems=[];for(const e of index.problems||[]){const r=await fetchImpl(new URL(e.path,base));if(!r.ok)throw new Error(`Problem yüklenemedi: ${e.path}`);const p=await r.json(),c=validateProblem(p);if(!c.valid)throw new Error(c.errors.join(' | '));problems.push(p)}return{index,problems}}
