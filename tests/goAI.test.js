import { AI_PROFILES, __test, finalScore, getBestMoveByIterations, getBestMoveForProfile, refineEndgameMove } from '../core/goAI.js';
import { BoardState } from '../core/boardState.js';
import { isValidMove } from '../core/ruleEngine.js';

let passed=0, failed=0;
function test(name,fn){try{fn();console.log('  ✓',name);passed++}catch(error){console.error('  ✗',name,'-',error.message);failed++}}
function ok(value,message='assertion failed'){if(!value)throw new Error(message)}
function equal(actual,expected,message){if(actual!==expected)throw new Error(message||`expected ${expected}, got ${actual}`)}

function position(size,stones=[],ko=-1){
  const grid=new Int8Array(size*size);
  for(const [color,x,y] of stones) grid[y*size+x]=color;
  return {grid,ko,size};
}

test('yakalama rakip taşı kaldırır',()=>{
  const board=position(5,[[2,2,2],[1,1,2],[1,2,1],[1,3,2]]);
  const result=__test.play(board,1,2,3);
  ok(result);
  equal(result.captured.length,1);
  equal(result.grid[2*5+2],0);
});

test('intihar hamlesi reddedilir',()=>{
  const board=position(5,[[2,1,2],[2,2,1],[2,3,2],[2,2,3]]);
  equal(__test.play(board,1,2,2),null);
});

test('basit ko hemen geri almayı engeller',()=>{
  const board=position(5,[[1,1,0],[1,0,1],[1,1,2],[2,1,1],[2,2,0],[2,2,2],[2,3,1]]);
  const capture=__test.play(board,1,2,1);
  ok(capture);
  equal(capture.ko,6);
  equal(__test.play({grid:capture.grid,ko:capture.ko,size:5},2,1,1),null);
});

test('rakip pas geçti ve güvenli hamle kalmadıysa robot pas geçer',()=>{
  const stones=[];for(let y=0;y<3;y++)for(let x=0;x<3;x++)stones.push([1,x,y]);
  equal(refineEndgameMove({...position(3,stones),previousPass:true,moveCount:40},1,{x:1,y:1}),'pass');
});

test('rakip pas geçti ama açık dame varsa robot oynar',()=>{
  const board={...position(5,[[1,0,0],[2,4,4]]),previousPass:true,moveCount:40};
  ok(refineEndgameMove(board,1,'pass')!=='pass');
});

test('yakalanabilir rakip taş varken robot pas geçmez',()=>{
  const board={...position(5,[[2,2,2],[1,1,2],[1,2,1],[1,3,2]]),previousPass:true,moveCount:40};
  equal(JSON.stringify(refineEndgameMove(board,1,'pass')),JSON.stringify({x:2,y:3}));
});

test('kurtarılabilir kendi grup varken robot pas geçmez',()=>{
  const board={...position(5,[[1,2,2],[2,1,2],[2,2,1],[2,3,2]]),previousPass:true,moveCount:40};
  equal(JSON.stringify(refineEndgameMove(board,1,'pass')),JSON.stringify({x:2,y:3}));
});

test('ko açıkken robot pas geçmez',()=>{
  const board={...position(5),ko:0,previousPass:true,moveCount:40};
  ok(refineEndgameMove(board,1,'pass')!=='pass');
});

test('kazanan robot kendi güvenli bölgesini gereksiz doldurmaz',()=>{
  const ring=[[1,0,0],[1,1,0],[1,2,0],[1,0,1],[1,2,1],[1,0,2],[1,1,2],[1,2,2]];
  const board={...position(3,ring),komi:.5,previousPass:true,moveCount:40};
  equal(refineEndgameMove(board,1,{x:1,y:1}),'pass');
});

test('kaybeden robot erken pas geçmez',()=>{
  const board={...position(5),komi:6.5,previousPass:false,moveCount:40};
  ok(refineEndgameMove(board,1,'pass')!=='pass');
});

test('atarideki grup uzayarak kurtulabilir',()=>{
  const board=position(5,[[1,2,2],[2,1,2],[2,2,1],[2,3,2]]);
  const escape=__test.play(board,1,2,3);
  ok(escape,'atari kaçışı yasal olmalı');
  equal(JSON.stringify(__test.pickMove(board,1,3)),JSON.stringify({x:2,y:3}));
});

test('rollout zorunlu yakalamayı önceliklendirir',()=>{
  const board=position(3,[[2,1,1],[1,0,1],[1,1,0],[1,2,1],[2,0,0],[2,2,0],[2,0,2],[2,2,2]]);
  const move=getBestMoveByIterations(board,1,40,{seed:9});
  ok(move!=='pass');
  equal(move.x,1); equal(move.y,2);
});

test('yasal nokta kalmadığında pas seçilir',()=>{
  const stones=[];
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)stones.push([1,x,y]);
  equal(getBestMoveByIterations(position(3,stones),2,5,{seed:1}),'pass');
});

test('iki ardışık pas rollout oyununu bitirir',()=>{
  const stones=[];
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)stones.push([1,x,y]);
  const result=__test.rollout(position(3,stones),2,{seed:2,previousPass:true});
  ok(result.endedByPasses);
  equal(result.ply,1);
});

test('doğal pas dolu ve güvenli tahtada MAX_PLY öncesi oyun sonu üretir',()=>{
  const stones=[];
  for(let y=0;y<5;y++)for(let x=0;x<5;x++)if(!(x===2&&y===2))stones.push([1,x,y]);
  const result=__test.rollout(position(5,stones),1,{seed:7});
  ok(result.endedByPasses);
  ok(result.ply<200);
});

test('Tromp-Taylor puanlama alanı ve komiyi uygular',()=>{
  const board=position(3,[[1,0,0],[1,1,0],[1,2,0],[1,0,1],[1,2,1],[1,0,2],[1,1,2],[1,2,2]]);
  equal(__test.score(board),2.5);
  const score=finalScore(board);
  equal(score.winner,'black');
  equal(score.margin,2.5);
  equal(score.blackTerritory.length,1);
});

test('geri yayılım değeri her düğümde hamleyi yapan oyuncuya aittir',()=>{
  const values=__test.backpropProbe(1,3,1);
  equal(values.join(','),'0,1,0,1');
});

test('aynı seed ve pozisyon aynı sabit iterasyon sonucunu verir',()=>{
  const board=position(5,[[1,1,1],[2,3,3]]);
  const a=getBestMoveByIterations(board,1,80,{seed:12345});
  const b=getBestMoveByIterations(board,1,80,{seed:12345});
  equal(JSON.stringify(a),JSON.stringify(b));
  equal(a.iters,80);
});

test('profil bütçeleri Başlangıç < Orta < Güçlü sırasındadır',()=>{
  ok(AI_PROFILES.beginner.iterations<AI_PROFILES.medium.iterations);
  ok(AI_PROFILES.medium.iterations<AI_PROFILES.strong.iterations);
  ok(AI_PROFILES.beginner.thinkingTimeMs<AI_PROFILES.medium.thinkingTimeMs);
  ok(AI_PROFILES.medium.thinkingTimeMs<AI_PROFILES.strong.thinkingTimeMs);
  ok(AI_PROFILES.beginner.temperature>AI_PROFILES.medium.temperature);
  ok(AI_PROFILES.medium.topK>AI_PROFILES.strong.topK);
});

test('Kulüp Robotu profili sabit yayın ayarlarını kullanır',()=>{
  equal(JSON.stringify(AI_PROFILES.club),JSON.stringify({
    id:'club',name:'Kulüp Robotu',iterations:600,topK:1,temperature:0.08,thinkingTimeMs:1600
  }));
});

test('aynı profil ve seed aynı hamleyi üretir',()=>{
  const board=position(5,[[1,1,1],[2,3,3]]);
  for(const profile of Object.keys(AI_PROFILES)){
    const a=getBestMoveForProfile(board,1,profile,{seed:2026});
    const b=getBestMoveForProfile(board,1,profile,{seed:2026});
    equal(JSON.stringify(a),JSON.stringify(b),profile+' deterministik olmalı');
    equal(a.profile,profile);
  }
});

test('Başlangıç profili yasal ve makul adaylar dışına çıkmaz',()=>{
  const selfAtari=position(5,[[2,1,2],[2,2,1],[2,3,2],[2,2,3]]);
  for(const seed of [1,2,3]){
    const move=getBestMoveForProfile(selfAtari,1,'beginner',{seed});
    ok(move!=='pass');
    ok(!(move.x===2&&move.y===2),'bariz self-atari seçilmemeli');
    ok(__test.play(selfAtari,1,move.x,move.y),'seçilen hamle yasal olmalı');
  }

  const stones=[];
  for(let y=0;y<5;y++)for(let x=0;x<5;x++)if(!(x===2&&y===2))stones.push([1,x,y]);
  equal(getBestMoveForProfile(position(5,stones),1,'beginner',{seed:4}),'pass','kendi gözünü doldurmak yerine pas geçmeli');
});

test('özel komi puanlamaya aktarılır ve varsayılan 6.5 kalır',()=>{
  const board={grid:new Int8Array(9),size:3,ko:-1}; equal(finalScore(board).komi,6.5); equal(finalScore({...board,komi:.5}).margin,.5);
});


console.log(`
Toplam: ${passed+failed}  ✓ ${passed}  ✗ ${failed}`);
if(failed)process.exit(1);
