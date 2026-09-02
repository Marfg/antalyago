/**
 * scenes/capturePolicy.js
 *
 * Sahne #6'nın ("Taş Alma") üç iç anı için TEK doğruluk kaynağı.
 * `core/curriculum.js`'in `l3` dersindeki kullanıcıya görünen 1., 2. ve
 * 3. adımları (sıfır tabanlı `steps[0..2]`) HAM veriden okur — bu üç
 * adımın metni/board seed'i/doğru cevabı/geri bildirimi BURADA TEKRAR
 * YAZILMAZ veya icat EDİLMEZ (bkz. görev talimatı Bölüm 1 ve 4).
 *
 * Kritik ilke (scenes/libertyAssessmentPolicy.js ile AYNI): "doğru nokta"
 * ve "yakalanan taş sayısı" HER ZAMAN core/ruleEngine.js'in (getGroup/
 * getLiberties/applyMove) GERÇEK sonucundan TÜRETİLİR — curriculum'daki
 * statik `answer`/`capture` alanları yalnız BAŞLANGIÇ verisi (board seed,
 * metin, feedback) ve çapraz-doğrulama için okunur.
 *
 * ANCHOR TESPİTİ — libertyAssessmentPolicy.js'in "board seed'indeki İLK
 * taş = sorulan grup" varsayımı BURADA GEÇERLİ DEĞİL: `l3` dersinin
 * `steps[2]`'sinde (3 taşlı grup örneği) board dizilimi SALDIRAN siyah
 * taşlarla BAŞLAR, hedef beyaz grup dizilimde SONRA gelir (bkz. curriculum.js
 * steps[2] — `board:[{color:'B',...},...,{color:'W',...}]`). Bu üç adımın
 * HER BİRİNDE tam olarak TEK beyaz grup vardır (doğrulandı — bkz. dosya
 * altı testler) ve oyuncu her zaman siyahtır; bu yüzden hedef grup "board
 * seed'indeki İLK beyaz taş" olarak GÜVENLE bulunur — dizilim SIRASINDAN
 * bağımsız.
 */
import { CAM, CURRICULUM } from '../core/curriculum.js?v=2026-09-02.1';
import { BoardState } from '../core/boardState.js?v=2026-09-02.1';
import { getGroup, getLiberties, applyMove } from '../core/ruleEngine.js?v=2026-09-02.1';

const LESSON_ID = 'l3';
const BOARD_SIZE = 9;
/** l3'ün varsayılan Student Model kavramı — core/conceptMap.js'in
    `LESSON_DEFAULT_CONCEPT.l3` değeriyle AYNI GERÇEK ('capture'). Sahne #5'in
    DEFAULT_CONCEPT deseniyle AYNI gerekçeyle core/conceptMap.js buraya
    içe aktarılmadı (bkz. scenes/libertyAssessmentPolicy.js dosya başı notu) —
    tests/capturePolicy.test.js bu sabitin core/conceptMap.js'in GERÇEK
    sonucuyla senkron kaldığını çapraz doğrular. */
const DEFAULT_CONCEPT = 'capture';
/** Kullanıcıya görünen 1./2./3. adımların sıfır-tabanlı curriculum
    index'leri (bkz. görev talimatı keşif bölümü — l3'ün steps[0..2]'si). */
export const MOMENT_STEP_INDICES = [0, 1, 2];
export const MOMENT_COUNT = MOMENT_STEP_INDICES.length; // 3

function getLesson() {
  const lesson = CURRICULUM.flatMap(chapter => chapter.lessons).find(l => l.id === LESSON_ID);
  if (!lesson) throw new Error(`capturePolicy: '${LESSON_ID}' dersi curriculum'da bulunamadı`);
  return lesson;
}

function seedBoardState(boardSeed, size = BOARD_SIZE) {
  const bs = new BoardState(size);
  for (const stone of boardSeed) {
    bs.placeStone(stone.x, stone.y, stone.color === 'B' ? 'black' : 'white');
  }
  return bs;
}

/** Board seed'indeki hedef (beyaz) grubun ÇAPA taşı — bkz. dosya başı
    "ANCHOR TESPİTİ" notu. Dizilimdeki İLK beyaz taş kullanılır; üç gerçek
    adımın hepsinde tek bir bağlı beyaz grup olduğu için hangi beyaz taş
    seçilirse seçilsin AYNI grubu döndürür. */
function findTargetAnchor(boardSeed) {
  return (boardSeed ?? []).find(s => s.color === 'W') ?? null;
}

/** Hedef grubun GERÇEK (RuleEngine) boyutu ve son nefes noktaları —
    curriculum'un `capture`/`answer` alanlarından DEĞİL, canlı hesaptan. */
export function computeTargetGroup(boardSeed, size = BOARD_SIZE) {
  const anchor = findTargetAnchor(boardSeed);
  if (!anchor) return { size: 0, libertyPoints: [] };
  const bs = seedBoardState(boardSeed, size);
  const group = getGroup(bs, anchor.x, anchor.y);
  if (!group.size) return { size: 0, libertyPoints: [] };
  const libs = getLiberties(bs, group);
  const libertyPoints = [...libs].map(key => {
    const [x, y] = key.split(',').map(Number);
    return { row: y, col: x };
  });
  return { size: group.size, libertyPoints };
}

/** Bir anın GERÇEK Student Model kavramı — hedef grubun GERÇEK nefes
    sayısından türetilir (bkz. libertyAssessmentPolicy.js computeAssessmentConcept
    ile AYNI ilke): tam olarak 1 nefes noktası kalan bir grup ATARİ'dedir.
    Üç gerçek adımın hepsi zaten bu dalı tetikler (curriculum verisi HER
    ÜÇÜNDE de "son nefes" senaryosu seçer) — statik bir "hepsi atari"
    varsayımı YOK, HER çağrıda board seed'inden yeniden hesaplanır. */
export function computeMomentConcept(boardSeed, size = BOARD_SIZE) {
  const { libertyPoints } = computeTargetGroup(boardSeed, size);
  return libertyPoints.length === 1 ? 'atari' : DEFAULT_CONCEPT;
}

/** Bu anın DOĞRU cevabı oynandığında board'un GERÇEKTEN hangi kavrama
    dönüştüğü — curriculum metninden veya statik bir varsayımdan DEĞİL,
    core/ruleEngine.js'in applyMove() sonucundan (`captured` uzunluğu)
    okunur (bkz. libertyAssessmentPolicy.js computeExpectedResultConcept
    ile AYNI teknik). Üç gerçek anın hepsi zaten bir yakalama üretir, ama
    bu HER ZAMAN yeniden hesaplanır — sabit 'capture' ATANMAZ. */
function computeExpectedResultConcept(boardSeed, size, targetPoint) {
  if (!targetPoint) return null;
  const bs = seedBoardState(boardSeed, size);
  const { captured } = applyMove(bs, targetPoint.col, targetPoint.row, 'black');
  return captured.length > 0 ? 'capture' : null;
}

function cameraPresetName(cameraRef) {
  if (!cameraRef) return null;
  const entry = Object.entries(CAM).find(([, val]) => val === cameraRef);
  return entry ? entry[0] : null;
}

function normalizeMoment(step, curriculumStepIndex) {
  const board = (step.board ?? []).map(s => ({ ...s }));
  const size = step.size ?? BOARD_SIZE;
  const target = computeTargetGroup(board, size);
  return {
    momentIndex: MOMENT_STEP_INDICES.indexOf(curriculumStepIndex),
    curriculumStepIndex,
    board,
    size,
    cameraPreset: cameraPresetName(step.camera),
    promptText: step.text,
    feedbackOk: step.fb_ok ?? null,
    feedbackErr: step.fb_err ?? null,
    targetGroupSize: target.size,
    // 'board_tap' kabul kümesi — libertyAssessmentPolicy.js'in board_tap
    // deseniyle AYNI: kümedeki HERHANGİ bir noktaya dokunmak kabul edilir.
    // Üç gerçek adımın hepsinde bu küme doğal olarak TEK noktaya iner
    // (son nefes noktası) — sabit/tekil bir varsayım KODLANMAZ.
    lastLibertyPoints: target.libertyPoints,
    assessmentConcept: computeMomentConcept(board, size),
    // Doğru cevabın GERÇEK sonucu — yalnız yakalama üretiyorsa taşınır
    // (bkz. computeExpectedResultConcept); üretmiyorsa alan HİÇ EKLENMEZ
    // (libertyAssessmentPolicy.js ile AYNI "gereksiz null gürültüsü
    // üretme" ilkesi).
    ...(computeExpectedResultConcept(board, size, target.libertyPoints[0]) === 'capture'
      ? { expectedResultConcept: 'capture' }
      : {}),
    // Ham curriculum answer — YALNIZ ön koşul/sağlamlık doğrulaması için
    // saklanır (bkz. tests/capturePolicy.test.js). Runtime kabul kararı
    // HER ZAMAN computeTargetGroup()'tan gelir, bundan DEĞİL.
    curriculumStatedAnswer: step.answer ? { row: step.answer.y, col: step.answer.x } : null,
  };
}

/** Üç anı curriculum'daki GERÇEK sırayla, normalize edilmiş biçimde döner. */
export function getCaptureMoments() {
  const lesson = getLesson();
  return MOMENT_STEP_INDICES.map(idx => normalizeMoment(lesson.steps[idx], idx));
}

/** `point`in bu anın GERÇEK kabul kümesinde (hedef grubun son nefes
    noktaları) olup olmadığı — sabit koordinat KARŞILAŞTIRMASI değil. */
export function isValidCapturePoint(moment, point) {
  if (!point) return false;
  return moment.lastLibertyPoints.some(p => p.row === point.row && p.col === point.col);
}

/**
 * `point`teki hamleyi HAM board seed'i üzerinde GERÇEKTEN simüle eder
 * (core/ruleEngine.js applyMove) ve hedef grubun GERÇEKTEN tahtadan
 * kalkıp kalkmadığını/kaç taş alındığını döner — curriculum'un statik
 * `capture` alanından veya varsayılan bir grup-boyutu eşleşmesinden DEĞİL.
 * YALNIZ isValidCapturePoint() ile ÖNCEDEN doğrulanmış bir `point` için
 * çağrılmalıdır (bkz. scenes/scene06CaptureBasics.js — libertyAssessmentPolicy.js
 * computeResultAfterMove ile AYNI çağrı sözleşmesi, yasallık burada TEKRAR
 * KONTROL EDİLMEZ).
 *
 * @param {object} moment — getCaptureMoments()'in döndürdüğü bir an
 * @param {{row:number,col:number}} point — GERÇEKTEN oynanan (doğrulanmış) nokta
 * @returns {{captured:Array<{row:number,col:number}>, capturedCount:number, targetRemovedFromBoard:boolean}}
 */
export function computeCaptureResult(moment, point) {
  const bs = seedBoardState(moment.board, moment.size);
  const { captured: capturedRaw } = applyMove(bs, point.col, point.row, 'black');
  const captured = capturedRaw.map(c => ({ row: c.y, col: c.x }));
  return {
    captured,
    capturedCount: captured.length,
    targetRemovedFromBoard: captured.length === moment.targetGroupSize && captured.length > 0,
  };
}
