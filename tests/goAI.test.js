import { AI_PROFILES, __test, choosePolicyMove, finalScore, getBestMoveByIterations, getBestMoveForProfile } from '../core/goAI.js';
import { BoardState } from '../core/boardState.js';
import { isValidMove } from '../core/ruleEngine.js';
import { ADAPTIVE_VERSION,HANDICAP_9X9,createAdaptiveState,getAdaptiveGameSettings,loadAdaptiveState,recordCompletedGame,resetAdaptiveState,serializeAdaptiveState } from '../core/adaptiveAI.js';

let passed=0, failed=0;
function test(name,fn){try{fn();console.log('  ✓',name);passed++}catch(error){console.error('  ✗',name,'-',error.message);failed++}}
function ok(value,message='assertion failed'){if(!value)throw new Error(message)}
function equal(actual,expected,message){if(actual!==expected)throw new Error(message||`expected ${expected}, got ${actual}`)}

function position(size,stones=[],ko=-1){
  const grid=new Int8Array(size*size);
  for(const [color,x,y] of stones) grid[y*size+x]=color;
  return {grid,ko,size};
}
function adaptiveSequence(state,outcomes){for(const outcome of outcomes)state=recordCompletedGame(state,{completed:true,outcome,endReason:'score'}).state;return state}
function policy(entries=[],pass=0){const values=new Float32Array(362).fill(.001);for(const[x,y,p]of entries)values[y*19+x]=p;values[361]=pass;return values}

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

test('politika seçimi yakalamayı zayıf hamleden üstün tutar',()=>{
  const board=position(5,[[2,2,2],[1,1,2],[1,2,1],[1,3,2]]);
  equal(JSON.stringify(choosePolicyMove(board,1,policy([[0,0,.8],[2,3,.03]]))),JSON.stringify({x:2,y:3}));
});

test('politika seçimi atarideki taşı kurtarır',()=>{
  const board=position(5,[[1,2,2],[2,1,2],[2,2,1],[2,3,2]]);
  equal(JSON.stringify(choosePolicyMove(board,1,policy([[0,0,.8],[2,3,.03]]))),JSON.stringify({x:2,y:3}));
});

test('politika seçimi ayrı dost grupları bağlar',()=>{
  const board=position(5,[[1,1,2],[1,3,2]]);
  equal(JSON.stringify(choosePolicyMove(board,1,policy([[0,0,.5],[2,2,.08]]))),JSON.stringify({x:2,y:2}));
});

test('politika seçimi ko noktasını eler',()=>{
  const koBoard={...position(5),ko:0};
  equal(JSON.stringify(choosePolicyMove(koBoard,1,policy([[0,0,.9],[4,4,.2]]))),JSON.stringify({x:4,y:4}));
});

test('politika seçimi intihar adayını eler',()=>{
  const suicide=position(5,[[2,1,2],[2,2,1],[2,3,2],[2,2,3]]);
  equal(JSON.stringify(choosePolicyMove(suicide,1,policy([[2,2,.9],[4,4,.2]]))),JSON.stringify({x:4,y:4}));
});

test('politika seçimi boş tahtada yüksek pas olasılığına rağmen erken pas geçmez',()=>{
  const move=choosePolicyMove(position(9),1,policy([[4,4,.01]],.99));
  ok(move!=='pass');
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

test('uyarlanabilir profil terfi, düşme ve üç oyun bekleme uygular',()=>{
  let state=adaptiveSequence(createAdaptiveState(),['win','loss','win','win','loss','win']);
  equal(state.profile,'medium'); equal(state.gamesSinceChange,0); equal(state.games.length,0);
  state=adaptiveSequence(state,['loss','loss','loss']); equal(state.profile,'medium');
  state=adaptiveSequence(state,['loss','win','win']); equal(state.profile,'beginner');
});

test('eski sonuçlar profil değişiminden üç oyun sonra ani geri dönüş üretmez',()=>{
  let state=adaptiveSequence(createAdaptiveState(),['win','win','win','win','loss','loss']);
  equal(state.profile,'medium'); equal(state.games.length,0);
  state=adaptiveSequence(state,['loss','loss','loss']);
  equal(state.profile,'medium'); equal(state.games.length,3);
});

test('yalnız tamamlanan skor ve teslim oyunları uyarlanabilir geçmişe girer',()=>{
  const state=createAdaptiveState();
  equal(recordCompletedGame(state,{completed:false,outcome:'win',endReason:'score'}).state.games.length,0);
  equal(recordCompletedGame(state,{completed:true,outcome:'win',endReason:'restart'}).state.games.length,0);
  equal(recordCompletedGame(state,{completed:true,outcome:'loss',endReason:'resign'}).state.games.length,1);
});

test('profil sınırı komi ve handikapla küçük ayar yapar',()=>{
  let top=adaptiveSequence({...createAdaptiveState(),profile:'strong'},['win','win','win','win','loss','loss']);
  equal(top.edgeAdjustment,1); equal(getAdaptiveGameSettings(top,'white').handicap.length,2); equal(getAdaptiveGameSettings(top,'black').komi,7.5);
  const bottom=adaptiveSequence(createAdaptiveState(),['loss','loss','loss','loss','win','win']);
  equal(bottom.edgeAdjustment,-1); equal(getAdaptiveGameSettings(bottom,'black').handicap.length,2);
});

test('özel komi puanlamaya aktarılır ve varsayılan 6.5 kalır',()=>{
  const board={grid:new Int8Array(9),size:3,ko:-1}; equal(finalScore(board).komi,6.5); equal(finalScore({...board,komi:.5}).margin,.5);
});

test('9x9 handikap yerleşimleri benzersiz ve yasaldır',()=>{
  for(const [count,points] of Object.entries(HANDICAP_9X9)){
    equal(points.length,Number(count)); equal(new Set(points.map(p=>`${p.x},${p.y}`)).size,points.length);
    const board=new BoardState(9); for(const point of points){ok(isValidMove(board,point.x,point.y,'black').valid);board.placeStone(point.x,point.y,'black')}
  }
});

test('uyarlanabilir ilerleme sıfırlanır, bozuk ve eski veri güvenle reddedilir',()=>{
  equal(resetAdaptiveState().profile,'beginner');
  for(const raw of ['{bozuk',JSON.stringify({version:ADAPTIVE_VERSION+1}),JSON.stringify({version:ADAPTIVE_VERSION,profile:'x',games:[]})])equal(loadAdaptiveState(raw).profile,'beginner');
  const state=adaptiveSequence(createAdaptiveState(),['win','loss']); equal(loadAdaptiveState(serializeAdaptiveState(state)).games.length,2);
});

console.log(`\nToplam: ${passed+failed}  ✓ ${passed}  ✗ ${failed}`);
if(failed)process.exit(1);
