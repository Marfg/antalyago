import { BoardState } from '../core/boardState.js?v=2026-09-22.illegal-native2';
import { isValidMove, applyMove, getGroup, getLiberties } from '../core/ruleEngine.js?v=2026-09-22.illegal-native2';

// LS-owned positions preserving the previous scene's four shapes and both
// five-stone captures. No runtime dependency on curriculum/page/lesson data.
const W=(x,y)=>({x,y,color:'white'}), B=(x,y)=>({x,y,color:'black'});
export const DISCOVERY_STONES=[W(4,0),W(6,0),W(4,1),W(5,1),W(6,1),W(0,3),W(1,4),W(4,4),W(0,5),W(3,5),W(5,5),W(4,6),W(8,7),W(7,8)];
const captureBlack=[W(3,0),W(5,0),W(3,1),W(4,1),W(5,1),B(2,0),B(6,0),B(2,1),B(6,1),B(3,2),B(4,2),B(5,2)];
const captureWhite=[W(3,6),W(4,6),W(5,6),W(2,7),W(6,7),W(2,8),W(6,8),B(3,7),B(4,7),B(5,7),B(3,8),B(5,8)];
export const STAGES=[
 {key:'discover',mode:'discover',title:'Boş bir yer her zaman oynanabilir mi?',color:'black',stones:DISCOVERY_STONES,
  prompt:'Beyazların çevrelediği boşlukları dene. Siyah taşın yerleşemediği dört yeri keşfet.',
  context:'Az önce nefes noktası kalmayan taşları aldın. Şimdi taşı koyduğun anda hiç nefes noktası oluşmazsa ne olduğunu araştır.',
  targets:[
   {row:0,col:5,label:'Kenardaki cep',detail:'Üç komşu kesişim beyazlarla dolu; tahta dışında bir nefes noktası yok. Beyaz grup dışarıdan nefes noktalarına sahip olduğu için de alınmıyor.'},
   {row:4,col:0,label:'Diğer kenar',detail:'Burada da üç komşu dolu. Kenar boş bir kesişim değildir; yeni siyah taşın nefes noktası oluşmuyor.'},
   {row:5,col:4,label:'Tahtanın içi',detail:'Dört yöndeki beyazlar bütün komşu kesişimleri kapatıyor. Çapraz boşluklar nefes noktası sayılmaz.'},
   {row:8,col:8,label:'Köşe',detail:'Köşede yalnız iki komşu kesişim var; ikisi de dolu. İki beyaz taş bu noktayı kapatmaya yetiyor.'}],
  hints:['Merkez, kenar ve köşedeki kapalı boşlukları karşılaştır.','Yeni taşın yatay ve dikey komşularını say. Tahta dışına ve çaprazlara gidemez.','Henüz denemediğin kapalı boşluklar işaretlendi.'],
  conclusion:'Yasak hamle: Rakip taş almadan kendi taşını veya grubunu nefes noktası olmadan bırakamazsın.'},
 {key:'same_point_white',mode:'single',title:'Aynı boşluk, başka renk',color:'white',stones:DISCOVERY_STONES,
  targets:[{row:5,col:4}],expected:'connect',
  prompt:'Bu kez beyaz oynuyorsun. Tahtanın içindeki dört beyazın ortasına bir taş koy.',
  context:'Siyahın yerleşemediği noktayı şimdi beyazla dene. Aynı tahtada yalnız oynayan renk değişti.',
  hints:['Dört beyaz taşın ortasındaki boşluğu ara.','Beyaz oynayınca çevredeki taşlarla tek bir grup oluşacak.','Denenen ortak nokta işaretlendi.'],
  consequence:'Beyaz taş yerleşti. Dört komşusuna bağlandı; grubun çevresindeki sekiz nefes noktasını paylaşıyor.',
  conclusion:'Nokta her iki renk için birden yasak değildir. Yeni taşın tek başına değil, bağlandığı bütün grubun nefes noktalarına bak.'},
 {key:'own_group',mode:'single',title:'Bir taş daha ekleyince',color:'black',
  stones:[B(4,4),B(5,4),W(4,3),W(5,3),W(3,4),W(6,4),W(5,5),W(3,5),W(4,6)],
  targets:[{row:5,col:4}],expected:'reject',
  prompt:'Siyah grubun son nefes noktasına bir taş daha eklemeyi dene.',
  context:'Bir önceki örnekte bağlanmak işe yaradı. Burada bağlı iki siyah taşın yalnız bir nefes noktası var.',
  hints:['İki siyah taşı tek bir grup olarak düşün.','Grubun yatay ve dikey boş komşusunu ara.','Grubun son nefes noktası işaretlendi.'],
  consequence:'Hamle oynanmadı. Eklenen taş bütün grubun son nefes noktasını kapatacaktı; hiçbir beyaz taş da alınmıyor.',
  conclusion:'Bağlanmak tek başına yeterli değildir. Hamle sonunda oluşan grubun en az bir nefes noktası kalmalı.'},
 {key:'capture_before',mode:'single',title:'Bu cepte ne değişebilir?',color:'black',stones:captureBlack.filter(s=>!(s.x===4&&s.y===2)),
  targets:[{row:0,col:4}],expected:'reject',opponent:{row:1,col:4},
  prompt:'Beş beyaz taşın içindeki kenar boşluğuna siyah koymayı dene.',
  context:'Beyaz grubun biri cebin içinde, biri dışarıda iki nefes noktası var. Hamleden sonra hangisi açık kalacak?',
  hints:['Beyazların birleştiği grubu izle.','Cebin dışında açık kalan kesişim de beyaz grubun nefes noktası.','Cebin içindeki nokta işaretlendi.'],
  consequence:'Siyah yerleşemedi. Beyazın dışarıdaki nefes noktası açık kaldığı için beş beyaz taş alınmadı. Siyahın ise nefes noktası oluşmuyor.',
  conclusion:'Rakip grubun başka bir nefes noktası varsa, cebin içine oynayarak onu alamazsın.',nextLabel:'Dışarıdaki nefes noktasını kapat'},
 {key:'capture_after',mode:'single',title:'Aynı cep, bir taş farkı',color:'black',stones:captureBlack,
  targets:[{row:0,col:4}],expected:'capture',opponent:{row:1,col:4},
  prompt:'Aynı kenar boşluğunu yeniden dene. Beş beyaz taşı alabilir misin?',
  context:'Dışarıdaki nefes noktasına bir siyah eklendi. Beyazın yalnız cebin içindeki nefes noktası kaldı.',
  hints:['Az önceki konumla aradaki tek siyah taşı fark et.','Beyaz grubun son nefes noktasını kapatırsan ne olur?','Beyaz grubun son nefes noktası işaretlendi.'],
  consequence:'Beş beyaz taş kalktı. Boşalan üç komşu kesişim, oynadığın siyah taşın nefes noktaları oldu.',
  conclusion:'Taş alma önce değerlendirilir. Rakip taşlar kaldırılınca kendi taşının nefes noktaları oluştuğu için bu hamle yasaldır.'},
 {key:'white_capture',mode:'transfer',title:'Şimdi beyazla dene',color:'white',stones:captureWhite,
  targets:[{row:8,col:4}],expected:'capture',opponent:{row:7,col:4},
  prompt:'Beyaz oynuyorsun. Beş siyah taşı tek hamlede al.',
  context:'Aynı düşünceyi diğer kenarda uygula: Hamleden sonra hangi taşlar kalkacak, beyazın nefes noktaları nerede oluşacak?',
  hints:['Beş siyah taşı tek bir grup olarak oku.','Grubun son nefes noktası kenardaki cebin içinde.','Son nefes noktası işaretlendi.'],
  consequence:'Beş siyah taş kalktı. Beyazın üç nefes noktası açıldı; kural her iki renk için de aynı.',
  conclusion:'Önce rakip taşların alınıp alınmadığına, sonra kendi grubunun kalan nefes noktalarına bak. Çevrili görünen bir yere bazen oynanabilir.'},
];
export const coord=p=>'ABCDEFGHJ'[p.col]+(9-p.row);
export const key=p=>`${p.row},${p.col}`;
export function createBoard(stage){const b=new BoardState(9);stage.stones.forEach(s=>b.placeStone(s.x,s.y,s.color));return b;}
export function liberties(board,point){return [...getLiberties(board,getGroup(board,point.col,point.row))].map(k=>{const[col,row]=k.split(',').map(Number);return{row,col};});}
export function attempt(board,point,color='black'){
 const check=isValidMove(board,point.col,point.row,color);
 if(!check.valid)return{ok:false,reason:check.reason,capturedCount:0};
 const result=applyMove(board,point.col,point.row,color);
 return{ok:true,...result,capturedCount:result.captured.length,liberties:liberties(result.newState,point)};
}
