/**
 * scenes/endgameCountingPolicy.js
 *
 * Sahne #10'un ("Oyun Sonu ve Sayım") TEK iç anı için TEK doğruluk kaynağı.
 * `core/curriculum.js`'in `l6` ("Oyun Sonu ve Sayım") dersinin kullanıcıya
 * görünen 1. adımını (sıfır tabanlı `steps[0]` — bu görevde repo üzerinden
 * bağımsız doğrulandı: `l6.steps[0]`'ın `text`i "Her iki oyuncu da art arda
 * pas geçince oyun biter..." ile başlıyor ve curriculum'da BAŞKA hiçbir adım
 * bundan ÖNCE yok, bu yüzden kullanıcıya görünen 1. adım GERÇEKTEN
 * `stepIndex:0`'dır) HAM veriden okur — bu adımın metni/board seed'i BURADA
 * TEKRAR YAZILMAZ veya icat EDİLMEZ (bkz. scenes/koRulePolicy.js/
 * illegalMovePolicy.js İLE AYNI temel ilke).
 *
 * BÖLGE (TERRITORY) HESABI — GERÇEK flood-fill, kopya koordinat listesi
 * DEĞİL (bkz. görev talimatı Bölüm 6): `computeRegions()` `core/boardState.js`
 * üzerinden HER boş kesişimin bağlı bileşenini (flood-fill/BFS) bulur, her
 * bileşenin sınırındaki taş renklerini toplar — YALNIZ tek bir renkle
 * tamamen çevrili bir bileşen o renge ait sayılır; hem siyah hem beyazla
 * temas eden (veya renksiz bir sınırı olan, teorik olarak boş bir tahtada
 * oluşabilecek) bir bileşen NÖTR kalır, hiçbir renge YANLIŞLIKLA atanmaz.
 * Curriculum'un kendi `blackTerritory`/`whiteTerritory` dizileri VARSA
 * (bu adımda var) yalnız BAŞLANGIÇ/ÇAPRAZ-DOĞRULAMA verisi olarak okunur —
 * `getEndgameCountingMoment()` bu iki dizinin GERÇEK flood-fill sonucuyla
 * BİREBİR eşleştiğini build-time doğrular (bkz. scenes/koRulePolicy.js
 * `boardSignature` karşılaştırması İLE AYNI disiplin); asıl kullanılan
 * `blackRegionPoints`/`whiteRegionPoints` HER ZAMAN flood-fill'in kendi
 * sonucudur, curriculum dizisi DEĞİL.
 *
 * TERS RENK HATASI (bkz. görev talimatı Bölüm 2): bu görev kapsamında AYRICA
 * `core/curriculum.js`'teki `l6.steps[0].fb.t` metni ("Siyah sol (20 puan) ·
 * Beyaz sağ (22 puan) — beyaz önde!") düzeltildi — flood-fill GERÇEKTEN
 * ispatladı ki SOL (20 nokta) bölge BEYAZA, SAĞ (22 nokta) bölge SİYAHA
 * aittir (curriculum'un kendi `whiteTerritory`/`blackTerritory` dizileri
 * ZATEN doğruydu, yalnız `fb.t` metni renkleri ters yazmıştı) — düzeltilmiş
 * metin "Beyaz sol (20 puan) · Siyah sağ (22 puan) — siyah önde!"dir (ham
 * sayı karşılaştırması: 22>20, komi henüz BİR SONRAKİ adımda tanıtıldığı
 * için burada hesaba katılmadı). `moment.infoText` bu metni curriculum'dan
 * CANLI okur — burada AYRICA bir kopyası TUTULMAZ.
 *
 * KAVRAM: scene-seviyesi concept `'territory'` — Sahne #8/#9 İLE AYNI
 * bilinçli desen (bkz. scenes/illegalMovePolicy.js/koRulePolicy.js dosya
 * başı notları): `core/conceptMap.js`'e KASITLI olarak EKLENMEZ — Teacher
 * Studio Diagnostics bunu bilinen-olmayan concept olarak raporlar (bilinçli,
 * gizlenmeyen boşluk).
 */
import { CAM, CURRICULUM } from '../core/curriculum.js?v=2026-09-13.8';
import { BoardState } from '../core/boardState.js?v=2026-09-13.8';

export const LESSON_ID = 'l6';
export const STEP_INDEX = 0;
const BOARD_SIZE = 9;
/** Sahne #10'un scene-seviyesi kavramı — bkz. dosya başı "KAVRAM" notu. */
export const CONCEPT = 'territory';

export const MOMENT_KINDS = Object.freeze({
  REGION_IDENTIFY: 'region_identify',
});

function getLesson() {
  const lesson = CURRICULUM.flatMap(chapter => chapter.lessons).find(l => l.id === LESSON_ID);
  if (!lesson) throw new Error(`endgameCountingPolicy: '${LESSON_ID}' dersi curriculum'da bulunamadı`);
  return lesson;
}

/** Ham `l6.steps[0]` — YALNIZ Diagnostics/testlerin authored veriyle çapraz
    doğrulama yapabilmesi için (bkz. scenes/illegalMovePolicy.js benzer
    ihtiyaç — teacher-studio.html Diagnostics'in `rawStep` okuması). */
export function getRawStep() {
  const lesson = getLesson();
  const step = lesson.steps[STEP_INDEX];
  if (!step) throw new Error(`endgameCountingPolicy: '${LESSON_ID}'.steps[${STEP_INDEX}] bulunamadı`);
  return step;
}

/** Board seed'ini güvenli biçimde normalize eder — geçersiz veri (bilinmeyen
    renk, geçersiz koordinat, duplicate koordinat) SESSİZCE yutulmaz, AÇIK
    bir Error fırlatılır (bkz. scenes/koRulePolicy.js/illegalMovePolicy.js
    AYNI desen). */
export function normalizeBoardSeed(rawSeed) {
  const seed = Array.isArray(rawSeed) ? rawSeed : [];
  const seen = new Set();
  const normalized = [];
  for (const s of seed) {
    if (!s || (s.color !== 'B' && s.color !== 'W')) {
      throw new Error(`endgameCountingPolicy: geçersiz taş rengi: ${JSON.stringify(s)}`);
    }
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) {
      throw new Error(`endgameCountingPolicy: geçersiz koordinat: ${JSON.stringify(s)}`);
    }
    const key = `${s.x},${s.y}`;
    if (seen.has(key)) {
      throw new Error(`endgameCountingPolicy: duplicate board noktası: (${s.x},${s.y})`);
    }
    seen.add(key);
    normalized.push({ color: s.color, x: s.x, y: s.y });
  }
  return normalized;
}

function seedBoardState(boardSeed, size = BOARD_SIZE) {
  const bs = new BoardState(size);
  for (const stone of boardSeed) {
    bs.placeStone(stone.x, stone.y, stone.color === 'B' ? 'black' : 'white');
  }
  return bs;
}

function cameraPresetName(cameraRef) {
  if (!cameraRef) return null;
  const entry = Object.entries(CAM).find(([, val]) => val === cameraRef);
  return entry ? entry[0] : null;
}

/** `{row,col}`'dan deterministik bir string anahtar üretir (bkz.
    scenes/illegalMovePolicy.js/koRulePolicy.js `pointKey` AYNI amaç). */
export function pointKey(point) {
  return `${point.row},${point.col}`;
}

/** Bir nokta dizisinin deterministik, sıradan bağımsız imzası — event
    payload'ında "hangi bölge" sorusunu sabit koordinat listesi yerine tek
    bir string'le taşımak için (bkz. görev talimatı Bölüm 8: "ilgili bölgenin
    ... deterministik imzası"). */
export function regionSignature(points) {
  return points.map(pointKey).sort().join('|');
}

/** Board seed'inin (taş listesinin) deterministik imzası — çapraz doğrulama
    için (bkz. scenes/koRulePolicy.js `boardSignature` AYNI amaç). */
export function boardSignature(boardSeed) {
  return boardSeed.map(s => `${s.color}${s.x},${s.y}`).sort().join('|');
}

/** Verilen board üzerindeki TÜM boş kesişimlerin bağlı bileşenlerini
    (flood-fill/BFS, `core/boardState.js`'in `neighbors()`/`isEmpty()`
    ÜZERİNDEN) bulur — her bileşen için sınırdaki GERÇEK taş renklerinin
    kümesini de taşır. Board taş SIRASINDAN bağımsızdır (yalnız NİHAİ
    dizilime bakar) — bkz. tests/endgameCountingPolicy.test.js "taş sırası
    değişse de aynı sonuç" kontrolü.
 * @returns {Array<{points:Array<{row:number,col:number}>, borderColors:string[]}>}
 */
function computeEmptyRegions(bs, size) {
  const visited = new Set();
  const regions = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = `${x},${y}`;
      if (visited.has(key) || !bs.isEmpty(x, y)) continue;
      const region = new Set();
      const queue = [{ x, y }];
      const borderColors = new Set();
      while (queue.length) {
        const cur = queue.pop();
        const k = `${cur.x},${cur.y}`;
        if (region.has(k) || !bs.isEmpty(cur.x, cur.y)) continue;
        region.add(k);
        visited.add(k);
        for (const n of bs.neighbors(cur.x, cur.y)) {
          if (bs.isEmpty(n.x, n.y)) {
            if (!region.has(`${n.x},${n.y}`)) queue.push(n);
          } else {
            borderColors.add(bs.colorAt(n.x, n.y));
          }
        }
      }
      regions.push({
        points: [...region].map(k => {
          const [px, py] = k.split(',').map(Number);
          return { row: py, col: px };
        }),
        borderColors: [...borderColors],
      });
    }
  }
  return regions;
}

/** GERÇEK board seed'inden siyah/beyaz/nötr bölge noktalarını hesaplar
    (bkz. dosya başı "BÖLGE HESABI" notu) — sabit koordinat listesi
    kopyalanmaz, HER çağrıda board'dan yeniden türetilir.
 * @param {Array<{color:'B'|'W',x:number,y:number}>} boardSeed
 * @param {number} [size]
 * @returns {{blackPoints:Array<{row:number,col:number}>, whitePoints:Array<{row:number,col:number}>, neutralPoints:Array<{row:number,col:number}>}}
 */
export function computeRegions(boardSeed, size = BOARD_SIZE) {
  const bs = seedBoardState(boardSeed, size);
  const regions = computeEmptyRegions(bs, size);
  const blackPoints = [];
  const whitePoints = [];
  const neutralPoints = [];
  for (const r of regions) {
    if (r.borderColors.length === 1 && r.borderColors[0] === 'black') blackPoints.push(...r.points);
    else if (r.borderColors.length === 1 && r.borderColors[0] === 'white') whitePoints.push(...r.points);
    else neutralPoints.push(...r.points); // sahipsiz (tahta sınırı) VEYA iki renkle de temas eden (dame)
  }
  return { blackPoints, whitePoints, neutralPoints };
}

/** `l6.steps[0]`'ı normalize eder — TEK doğruluk kaynağı. Siyah/beyaz bölge
    kümelerinin BOŞ OLMADIĞI, birbirinden AYRIK olduğu ve (varsa) curriculum'un
    kendi authored `blackTerritory`/`whiteTerritory` dizileriyle TAM eşleştiği
    build-time doğrulanır — herhangi biri karşılanmazsa AÇIK bir Error
    fırlatılır (sessizce yanlış bir sahneye devam EDİLMEZ). */
export function getEndgameCountingMoment() {
  const step = getRawStep();
  const board = normalizeBoardSeed(step.board);
  const size = step.size ?? BOARD_SIZE;
  const { blackPoints, whitePoints, neutralPoints } = computeRegions(board, size);

  if (!blackPoints.length) {
    throw new Error(`endgameCountingPolicy: steps[${STEP_INDEX}] siyah bölge BOŞ — curriculum verisi beklenen ayrık iki bölgeyi karşılamıyor`);
  }
  if (!whitePoints.length) {
    throw new Error(`endgameCountingPolicy: steps[${STEP_INDEX}] beyaz bölge BOŞ — curriculum verisi beklenen ayrık iki bölgeyi karşılamıyor`);
  }
  const blackKeys = new Set(blackPoints.map(pointKey));
  if (whitePoints.some(p => blackKeys.has(pointKey(p)))) {
    throw new Error(`endgameCountingPolicy: steps[${STEP_INDEX}] siyah/beyaz bölge kümeleri KESİŞİYOR — beklenmedik`);
  }

  // Curriculum'un KENDİ authored dizileriyle çapraz doğrulama (varsa) — bkz.
  // dosya başı not, scenes/koRulePolicy.js AYNI disiplin.
  if (Array.isArray(step.blackTerritory)) {
    const authored = step.blackTerritory.map(p => ({ row: p.y, col: p.x }));
    if (regionSignature(authored) !== regionSignature(blackPoints)) {
      throw new Error(`endgameCountingPolicy: steps[${STEP_INDEX}] curriculum'un authored blackTerritory'si GERÇEK flood-fill sonucuyla eşleşmiyor`);
    }
  }
  if (Array.isArray(step.whiteTerritory)) {
    const authored = step.whiteTerritory.map(p => ({ row: p.y, col: p.x }));
    if (regionSignature(authored) !== regionSignature(whitePoints)) {
      throw new Error(`endgameCountingPolicy: steps[${STEP_INDEX}] curriculum'un authored whiteTerritory'si GERÇEK flood-fill sonucuyla eşleşmiyor`);
    }
  }

  return {
    curriculumStepIndex: STEP_INDEX,
    kind: MOMENT_KINDS.REGION_IDENTIFY,
    board,
    size,
    cameraPreset: cameraPresetName(step.camera),
    promptText: step.text,
    // Düzeltilmiş info metni — curriculum'dan CANLI okunur, burada AYRICA
    // bir kopyası TUTULMAZ (bkz. dosya başı "TERS RENK HATASI" notu).
    infoText: step.fb?.t ?? null,
    blackRegionPoints: blackPoints,
    whiteRegionPoints: whitePoints,
    neutralRegionPoints: neutralPoints,
    assessmentConcept: CONCEPT,
  };
}

/** Verilen (row,col) noktasının bu anda NEYİ temsil ettiğini belirler —
    dolu bir kesişimse (`isOccupied:true`) hiçbir bölgeye ait SAYILMAZ;
    sahipsiz/karışık (dame) bir nötr noktaysa `regionColor:null,isTarget:false`
    döner. Sahne modülü board state'ini BURADAN asla mutate ETMEZ — yalnız
    saf bir sınıflandırma.
 * @param {ReturnType<typeof getEndgameCountingMoment>} moment
 * @param {{row:number,col:number}} point
 * @returns {{regionColor:'B'|'W'|null, isOccupied:boolean, isTarget:boolean}}
 */
export function evaluateRegionTap(moment, point) {
  if (!point) return { regionColor: null, isOccupied: false, isTarget: false };
  const occupied = moment.board.some(s => s.x === point.col && s.y === point.row);
  if (occupied) return { regionColor: null, isOccupied: true, isTarget: false };
  const key = pointKey(point);
  if (moment.blackRegionPoints.some(p => pointKey(p) === key)) {
    return { regionColor: 'B', isOccupied: false, isTarget: true };
  }
  if (moment.whiteRegionPoints.some(p => pointKey(p) === key)) {
    return { regionColor: 'W', isOccupied: false, isTarget: true };
  }
  return { regionColor: null, isOccupied: false, isTarget: false };
}

/** `kind` geçerli bilinen bir değer mi — Diagnostics'in "kind geçerli"
    kontrolü bunu kullanır (bkz. scenes/illegalMovePolicy.js/koRulePolicy.js
    `isKnownMomentKind` AYNI amaç). */
export function isKnownMomentKind(kind) {
  return kind === MOMENT_KINDS.REGION_IDENTIFY;
}
