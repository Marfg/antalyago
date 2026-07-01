export const ADAPTIVE_STORAGE_KEY='antalyago.adaptiveAI.v1';
export const ADAPTIVE_VERSION=1;
export const PROFILE_ORDER=Object.freeze(['beginner','medium','strong']);
export const HANDICAP_9X9=Object.freeze({
  2:Object.freeze([{x:2,y:2},{x:6,y:6}]),
  3:Object.freeze([{x:2,y:2},{x:6,y:6},{x:6,y:2}]),
  4:Object.freeze([{x:2,y:2},{x:6,y:6},{x:6,y:2},{x:2,y:6}]),
});

export function createAdaptiveState(){
  return {version:ADAPTIVE_VERSION,profile:'beginner',games:[],gamesSinceChange:3,edgeAdjustment:0,lastReason:'Yeni oyuncu Başlangıç profilinde başlatıldı.'};
}

function validGame(game){return game&&['win','loss'].includes(game.outcome)&&['score','resign'].includes(game.endReason)}
export function loadAdaptiveState(raw){
  try{
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(!value||value.version!==ADAPTIVE_VERSION||!PROFILE_ORDER.includes(value.profile)||!Array.isArray(value.games))return createAdaptiveState();
    if(!value.games.every(validGame)||!Number.isInteger(value.gamesSinceChange)||!Number.isInteger(value.edgeAdjustment))return createAdaptiveState();
    return {...createAdaptiveState(),...value,games:value.games.slice(-6),edgeAdjustment:Math.max(-2,Math.min(2,value.edgeAdjustment))};
  }catch{return createAdaptiveState()}
}
export function serializeAdaptiveState(state){return JSON.stringify(loadAdaptiveState(state))}
export function resetAdaptiveState(){return createAdaptiveState()}

export function recordCompletedGame(state,game){
  const current=loadAdaptiveState(state);
  if(!game?.completed||!validGame(game))return {state:current,changed:false};
  let next={...current,games:[...current.games,{outcome:game.outcome,endReason:game.endReason}].slice(-6),gamesSinceChange:current.gamesSinceChange+1};
  if(next.games.length<6||next.gamesSinceChange<3)return {state:next,changed:false};

  const wins=next.games.filter(item=>item.outcome==='win').length;
  const losses=next.games.filter(item=>item.outcome==='loss').length;
  const index=PROFILE_ORDER.indexOf(next.profile);
  if(wins>=4){
    if(index<PROFILE_ORDER.length-1){
      const profile=PROFILE_ORDER[index+1];
      next={...next,profile,games:[],edgeAdjustment:0,gamesSinceChange:0,lastReason:`Son 6 oyunda ${wins} galibiyet: ${profile} profiline yükseltildi.`};
    }else if(next.edgeAdjustment<2){
      next={...next,games:[],edgeAdjustment:next.edgeAdjustment+1,gamesSinceChange:0,lastReason:`Güçlü profil sınırında ${wins} galibiyet: AI avantajı küçük ölçüde artırıldı.`};
    }else return {state:next,changed:false};
    return {state:next,changed:true};
  }
  if(losses>=4){
    if(index>0){
      const profile=PROFILE_ORDER[index-1];
      next={...next,profile,games:[],edgeAdjustment:0,gamesSinceChange:0,lastReason:`Son 6 oyunda ${losses} yenilgi: ${profile} profiline düşürüldü.`};
    }else if(next.edgeAdjustment>-2){
      next={...next,games:[],edgeAdjustment:next.edgeAdjustment-1,gamesSinceChange:0,lastReason:`Başlangıç profil sınırında ${losses} yenilgi: kullanıcı avantajı küçük ölçüde artırıldı.`};
    }else return {state:next,changed:false};
    return {state:next,changed:true};
  }
  return {state:next,changed:false};
}

export function getAdaptiveGameSettings(state,playerColor='black'){
  const safe=loadAdaptiveState(state);
  const aiColor=playerColor==='black'?'white':'black';
  const adjustment=safe.edgeAdjustment;
  let komi=6.5+adjustment*(aiColor==='white'?1:-1);
  let handicap=[];
  const blackBeneficiary=adjustment>0&&aiColor==='black'||adjustment<0&&playerColor==='black';
  if(blackBeneficiary){
    handicap=HANDICAP_9X9[Math.min(3,Math.abs(adjustment)+1)];
    komi=6.5;
  }
  return {profile:safe.profile,komi,handicap:[...(handicap||[])],reason:safe.lastReason};
}
