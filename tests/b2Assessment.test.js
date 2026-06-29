import { CURRICULUM } from '../core/curriculum.js';
import { auditCurriculum, buildAssessmentBlueprint } from '../core/learningContext.js';
import { BoardState } from '../core/boardState.js';
import { getGroup, getLiberties, isValidMove, applyMove } from '../core/ruleEngine.js';

let passed=0, failed=0;
function test(name,fn){try{fn();console.log('  ✓',name);passed++}catch(error){console.error('  ✗',name,'-',error.message);failed++}}
function ok(value,message='assertion failed'){if(!value)throw new Error(message)}
function equal(actual,expected,message){if(actual!==expected)throw new Error(message||('expected '+expected+', got '+actual))}

const chapter=CURRICULUM.find(item=>item.id==='c2');
const lesson=chapter.lessons.find(item=>item.id==='l2_deg');
const blueprint=buildAssessmentBlueprint(lesson,chapter);

function boardFrom(step){
  const board=new BoardState(step.size);
  for(const stone of step.board||[]) board.placeStone(stone.x,stone.y,stone.color==='B'?'black':'white');
  return board;
}

test('B2 değerlendirmesi 12 puanlanan sorudan oluşur',()=>{
  equal(lesson.steps.length,12);
  equal(blueprint.length,12);
  ok(lesson.steps.every(step=>step.answer||step.answers||step.miniQuestion));
});

test('altı B2 kazanımı dengeli biçimde iki kez ölçülür',()=>{
  const counts={life_and_death:0,connection:0,atari:0,ladder:0,net:0,snapback:0};
  for(const step of lesson.steps) for(const concept of step.concepts||[]) if(concept in counts) counts[concept]++;
  equal(counts.life_and_death,2);
  equal(counts.connection,2);
  equal(counts.atari,2);
  equal(counts.ladder,3);
  equal(counts.net,2);
  equal(counts.snapback,2);
});

test('tüm sorular kaynak ve zorluk metadatası taşır',()=>{
  ok(lesson.steps.every(step=>Array.isArray(step.sourceRefs)&&step.sourceRefs.length));
  ok(lesson.steps.every(step=>Number.isInteger(step.difficulty)&&step.difficulty>=1&&step.difficulty<=4));
});

test('değerlendirme içinde pasif açıklama adımı yoktur',()=>{
  const audit=auditCurriculum(CURRICULUM);
  const b2Items=audit.items.filter(item=>item.lessonId==='l2_deg');
  equal(b2Items.filter(item=>item.stage==='assessment_explanation').length,0);
  equal(b2Items.filter(item=>item.stage==='assessment').length,12);
});

test('tahta hamlesi gerektiren bütün cevaplar yasal hamledir',()=>{
  for(const step of lesson.steps.filter(item=>item.answer)){
    const board=boardFrom(step);
    const result=isValidMove(board,step.answer.x,step.answer.y,step.turn);
    ok(result.valid,'yasadışı cevap: '+step.text.replace(/<[^>]+>/g,' '));
  }
});

test('çift atari sorusu iki ayrı beyaz grubu atariye indirir',()=>{
  const step=lesson.steps[2];
  const board=boardFrom(step);
  const {newState}=applyMove(board,step.answer.x,step.answer.y,'black');
  const groups=[getGroup(newState,4,3),getGroup(newState,3,4)];
  ok(groups.every(group=>getLiberties(newState,group).size===1));
});

test('merdiven eşlenik çifti yalnızca kırıcı taşla ayrışır',()=>{
  const withBreaker=lesson.steps[3];
  const withoutBreaker=lesson.steps[9];
  equal(withBreaker.board.filter(stone=>stone.color==='W').length,2);
  equal(withoutBreaker.board.filter(stone=>stone.color==='W').length,1);
  ok(withBreaker.miniQuestion.options.find(option=>option.correct).text.includes('kaçar'));
  ok(withoutBreaker.miniQuestion.options.find(option=>option.correct).text.includes('yakalanır'));
});

test('snapback soruları farklı yönlerde aynı diziyi ölçer',()=>{
  const snapbacks=lesson.steps.filter(step=>(step.concepts||[]).includes('snapback'));
  equal(snapbacks.length,2);
  ok(snapbacks.every(step=>step.movesAfterAnswer?.length===2));
  ok(snapbacks[0].answer.x!==snapbacks[1].answer.x||snapbacks[0].answer.y!==snapbacks[1].answer.y);
});


test('snapback dizileri kurban, tek taş alımı ve büyük geri alım üretir',()=>{
  for(const step of lesson.steps.filter(item=>(item.concepts||[]).includes('snapback'))){
    let state=boardFrom(step);
    const first=applyMove(state,step.answer.x,step.answer.y,'black');
    equal(first.captured.length,0);
    const reply=step.movesAfterAnswer[0];
    const second=applyMove(first.newState,reply.x,reply.y,'white');
    equal(second.captured.length,1);
    const recapture=step.movesAfterAnswer[1];
    const third=applyMove(second.newState,recapture.x,recapture.y,'black');
    ok(third.captured.length>=3,'snapback daha büyük grubu yakalamalı');
  }
});

test('soru kökleri cevabı koordinatla ele vermez',()=>{
  for(const step of lesson.steps){
    const text=String(step.text||'').replace(/<[^>]+>/g,' ');
    ok(!/\b[A-T][1-9]\b/.test(text),'koordinat sızıntısı: '+text);
    ok(!/noktasına tıkla/i.test(text),'doğrudan cevap yönlendirmesi: '+text);
  }
});

console.log('\nToplam: '+(passed+failed)+'  ✓ '+passed+'  ✗ '+failed);
if(failed)process.exit(1);
