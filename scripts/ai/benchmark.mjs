import { AI_PROFILES, __test, finalScore, getBestMoveForProfile } from '../../core/goAI.js';

const arg=(name,fallback)=>{
  const i=process.argv.indexOf(name);
  return i>=0?Number(process.argv[i+1]):fallback;
};
const gamesPerColor=Math.max(1,arg('--games',1));
const maxPly=Math.max(2,arg('--max-ply',120));
const baseSeed=arg('--seed',20260701)>>>0;
const ids=Object.keys(AI_PROFILES);

function playGame(blackProfile,whiteProfile,seed){
  let board={grid:new Int8Array(81),ko:-1,size:9};
  let color=1,passes=0,ply=0;
  const started=performance.now();
  while(passes<2&&ply<maxPly){
    const profile=color===1?blackProfile:whiteProfile;
    const move=getBestMoveForProfile(board,color,profile,{seed:(seed+ply*2654435761)>>>0});
    if(move==='pass'){
      passes++; board={...board,ko:-1};
    }else{
      const result=__test.play(board,color,move.x,move.y);
      if(!result)throw new Error(`${profile} yasadışı hamle üretti: ${move.x},${move.y}`);
      passes=0;
      board={grid:result.grid,ko:result.ko,size:9};
    }
    color=color===1?2:1;
    ply++;
  }
  const score=finalScore(board);
  return {black:blackProfile,white:whiteProfile,winner:score.winner,margin:score.margin,ply,endedByPasses:passes>=2,elapsedMs:Math.round(performance.now()-started)};
}

const games=[];
let sequence=0;
for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){
  for(let n=0;n<gamesPerColor;n++){
    games.push(playGame(ids[a],ids[b],(baseSeed+sequence++)>>>0));
    games.push(playGame(ids[b],ids[a],(baseSeed+sequence++)>>>0));
  }
}

const standings=Object.fromEntries(ids.map(id=>[id,{games:0,wins:0,losses:0}]));
for(const game of games){
  const winner=game.winner==='black'?game.black:game.white;
  const loser=game.winner==='black'?game.white:game.black;
  standings[winner].games++; standings[winner].wins++;
  standings[loser].games++; standings[loser].losses++;
}

console.log(JSON.stringify({generatedAt:new Date().toISOString(),boardSize:9,gamesPerColor,maxPly,baseSeed,profiles:AI_PROFILES,standings,games},null,2));
