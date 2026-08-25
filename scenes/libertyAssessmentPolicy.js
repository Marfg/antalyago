/**
 * scenes/libertyAssessmentPolicy.js
 *
 * Sahne #5'in ("Nefes Noktalarını Değerlendir") beş iç değerlendirmesi için
 * TEK doğruluk kaynağı. `core/curriculum.js`'in `l2` dersindeki kullanıcıya
 * görünen 4., 5., 6., 7. ve 8. adımları (sıfır tabanlı `steps[3..7]`) HAM
 * veriden okur — bu beş adımın metni/board seed'i/doğru cevabı BURADA
 * TEKRAR YAZILMAZ veya icat EDİLMEZ (bkz. görev talimatı Bölüm 1).
 *
 * Kritik ilke (scenes/groupLibertyPolicy.js ile AYNI): "doğru cevap" HER
 * ZAMAN core/ruleEngine.js'in (getGroup/getLiberties) GERÇEK sonucundan
 * TÜRETİLİR — curriculum'daki statik `correct:true`/`answers` alanları
 * yalnız BAŞLANGIÇ verisi (board seed, metin, feedback) için okunur; hangi
 * seçeneğin/noktanın doğru olduğu HER ZAMAN yeniden hesaplanır. Bu, curriculum
 * verisi değişse bile Sahne #5'in asla yanlış bir "doğru" cevap göstermemesini
 * garanti eder.
 *
 * Adım türleri (ham veriden ayırt edilir):
 *   - `miniQuestion` alanı olan adımlar (steps[3], steps[4]) → 'choice'
 *     (çoktan seçmeli — gerçek nefes SAYISI hesaplanır, metni eşleşen
 *     seçenek doğru kabul edilir).
 *   - `answer`/`answers` alanı olan adımlar (steps[5], steps[6], steps[7])
 *     → 'board_tap' (gerçek nefes noktaları KÜMESİ hesaplanır, kümedeki
 *     HERHANGİ bir noktaya dokunmak kabul edilir — steps[7]'nin atari
 *     senaryosunda bu küme doğal olarak TEK noktaya indirgenir, ayrı bir
 *     "capture" kod yolu GEREKMEZ: core/ruleEngine.js zaten o tek noktaya
 *     oynanan hamlenin GERÇEK yakalamayı ürettiğini garanti eder — bkz.
 *     adapters/sceneBoardAdapter.js playMove()).
 */
import { CAM, CURRICULUM } from '../core/curriculum.js?v=2026-08-25.1';
import { BoardState } from '../core/boardState.js?v=2026-08-25.1';
import { getGroup, getLiberties, applyMove } from '../core/ruleEngine.js?v=2026-08-25.1';

const LESSON_ID = 'l2';
const BOARD_SIZE = 9;
/** l2'nin varsayılan Student Model kavramı — core/conceptMap.js'in
    `LESSON_DEFAULT_CONCEPT.l2` değeriyle AYNI GERÇEK — core/captureObservation.js
    (`findAtariGroups`) VE core/conceptMap.js (`defaultConceptForLesson`) BİLEREK
    buraya (sahne graph'ına) içe aktarılmadı: bu iki modül şu an yalnız
    core/teacherPanelBridge.js'in ActionHandler-şekilli `result.effects`
    sözleşmesiyle çalışıyor (bkz. teacherPanelBridge.js resolveActiveConcept) ve
    henüz versioned release graph'ının (bkz. scripts/stamp-scene-release.mjs)
    bir parçası değiller — onları buraya eklemek gereksiz bir graph-genişletme
    riski taşırdı. Bunun yerine SAHNE #5'in zaten kullandığı GERÇEK RuleEngine
    ilkelinden (getGroup/getLiberties — bkz. computeAssessmentConcept altta)
    AYNI "1 nefes noktası kalan grup atari'dedir" kuralı türetilir — algoritma
    İKİ KERE FARKLI biçimde YAZILMAZ. tests/libertyAssessmentPolicy.test.js
    bu sabitin ve computeAssessmentConcept'in core/conceptMap.js VE
    core/captureObservation.js'in GERÇEK sonucuyla senkron kaldığını çapraz
    doğrular (bkz. görev talimatı Bölüm 3, "ikinci seçenek"). */
const DEFAULT_CONCEPT = 'liberty';
/** Kullanıcıya görünen 4./5./6./7./8. adımların sıfır-tabanlı curriculum
    index'leri — bkz. görev talimatı keşif bölümü ve
    tests/studentModelLiberty.test.js (steps[5]/steps[6] zaten bu index'lerle
    doğrulanmış durumda). */
export const ASSESSMENT_STEP_INDICES = [3, 4, 5, 6, 7];
export const ASSESSMENT_COUNT = ASSESSMENT_STEP_INDICES.length; // 5

function getLesson() {
  const lesson = CURRICULUM.flatMap(chapter => chapter.lessons).find(l => l.id === LESSON_ID);
  if (!lesson) throw new Error(`libertyAssessmentPolicy: '${LESSON_ID}' dersi curriculum'da bulunamadı`);
  return lesson;
}

function seedBoardState(boardSeed, size = BOARD_SIZE) {
  const bs = new BoardState(size);
  for (const stone of boardSeed) {
    bs.placeStone(stone.x, stone.y, stone.color === 'B' ? 'black' : 'white');
  }
  return bs;
}

/** Board seed'indeki İLK taşın ait olduğu grubun GERÇEK nefes noktaları
    (core/ruleEngine.js üzerinden) — sahnenin "hangi taş/grup sorulüyor"
    varsayımı BURADA, curriculum'un board dizilim SIRASINA (soru her zaman
    ilgili taş/grubu İLK yazar) dayanır; steps[3..7]'nin hepsinde doğrulanmış
    bir düzendir (bkz. dosya başı görsel doğrulama). */
export function computeRealLiberties(boardSeed, size = BOARD_SIZE) {
  const norm = boardSeed ?? [];
  if (!norm.length) return [];
  const bs = seedBoardState(norm, size);
  const anchor = norm[0];
  const group = getGroup(bs, anchor.x, anchor.y);
  if (!group.size) return [];
  const libs = getLiberties(bs, group);
  return [...libs].map(key => {
    const [x, y] = key.split(',').map(Number);
    return { row: y, col: x };
  });
}

/** Bir öğenin GERÇEK Student Model kavramı — curriculum'un hangi lessonId
    altında yaşadığından (`l2`/"liberty") DEĞİL, ANCHOR grubun GERÇEK nefes
    sayısından türetilir: tam olarak 1 nefes noktası kalan bir grup, tanım
    gereği ATARİ'dedir (bkz. core/captureObservation.js findAtariGroups'un
    AYNI "liberties.length===1" kuralı — bkz. dosya başı DEFAULT_CONCEPT
    notu). steps[3..6] için anchor grubunun ASLA 1 nefesi olmaz (curriculum
    verisi 2/3/4/4 nefesli örnekler seçer) — yalnız steps[7]'nin atari
    senaryosu bu dalı tetikler. Statik "item 5 = atari" varsayımı YOK; bu
    HER çağrıda board seed'inden yeniden hesaplanır. */
export function computeAssessmentConcept(boardSeed, size = BOARD_SIZE) {
  return computeRealLiberties(boardSeed, size).length === 1 ? 'atari' : DEFAULT_CONCEPT;
}

/** 'board_tap' tipi bir öğenin DOĞRU cevabı oynandığında board'un GERÇEKTEN
    hangi kavrama dönüştüğü — core/ruleEngine.js'in applyMove()'u ile GERÇEK
    bir hamle simüle edilip `captured` sonucuna bakılarak belirlenir (curriculum
    metninden veya statik bir "item 5 → capture" varsayımından DEĞİL). Yakalama
    ÜRETMEYEN doğru cevaplar (steps[5]/[6]) için `null` döner — gereksiz
    `resultConcept:null` gürültüsü çağıranda (normalizeStep) süzülür. */
function computeExpectedResultConcept(boardSeed, size, targets) {
  if (!targets.length) return null;
  const bs = seedBoardState(boardSeed, size);
  const target = targets[0];
  const { captured } = applyMove(bs, target.col, target.row, 'black');
  return captured.length > 0 ? 'capture' : null;
}

/** curriculum'un `camera: CAM.xyz` alanı (bir OBJE referansı) sceneBoardAdapter'ın
    `focus(presetName)`'ının beklediği STRING anahtara çevrilir — CAM.js'teki
    AYNI obje referansıyla eşleştirilir (curriculum.js `camera:CAM.corner_tl` gibi
    doğrudan CAM'in kendi export'unu kullanıyor, bu yüzden referans eşitliği
    güvenilir). Eşleşme yoksa null (çağıran varsayılan preset'i kullanır). */
function cameraPresetName(cameraRef) {
  if (!cameraRef) return null;
  const entry = Object.entries(CAM).find(([, val]) => val === cameraRef);
  return entry ? entry[0] : null;
}

function normalizeStep(step, curriculumStepIndex) {
  const board = (step.board ?? []).map(s => ({ ...s }));
  const size = step.size ?? BOARD_SIZE;
  const shared = {
    curriculumStepIndex,
    board,
    size,
    cameraPreset: cameraPresetName(step.camera),
    // steps[3]/[4] (choice) curriculum'da showLiberties:true taşır — sayma
    // sorusu için görsel yardım MEŞRUDUR (cevabı BEDAVA vermez, kullanıcı
    // yine de işaretleri SAYIP doğru seçeneği bulmalı). steps[5]/[6]/[7]
    // (board_tap) BİLEREK showLiberties taşımaz — dokunulacak GERÇEK
    // hedefi ÖNCEDEN göstermek değerlendirmeyi anlamsızlaştırır (bkz. görev
    // talimatı Bölüm 5 "Board soruları").
    showLibertiesBeforeAnswer: !!step.showLiberties,
    // Bu ÖĞENİN GERÇEK değerlendirdiği Student Model kavramı — sahnenin
    // primary `concept:'liberty'`sinden AYRI (bkz. scene05LibertyAssessment.js
    // dosya başı notu ve görev talimatı Bölüm 2/6). steps[7] için 'atari'
    // döner; steps[3..6] için 'liberty'.
    assessmentConcept: computeAssessmentConcept(board, size),
  };
  if (step.miniQuestion && typeof step.miniQuestion === 'object') {
    return {
      ...shared,
      type: 'choice',
      // step.text (★ çerçeveli tam yönerge) ana metin — miniQuestion.text
      // ("Bu taşın nefes sayısı?") daha kısa bir ETİKETTİR, seçenek
      // grubunun aria-label'ı için ayrıca saklanır.
      promptText: step.text,
      questionLabel: step.miniQuestion.text,
      options: step.miniQuestion.options.map(o => ({ text: o.text, feedback: o.feedback })),
      // choice tipinde hiçbir hamle OYNANMAZ — board bir sonuç kavramına
      // asla dönüşmez (bkz. görev talimatı: "gereksiz capture:null
      // kalabalığı üretme"), bu yüzden expectedResultConcept BİLEREK YOK.
    };
  }
  const rawAnswers = Array.isArray(step.answers) ? step.answers : step.answer ? [step.answer] : [];
  const realTargets = computeRealLiberties(board, size);
  const expectedResultConcept = computeExpectedResultConcept(board, size, realTargets);
  return {
    ...shared,
    type: 'board_tap',
    promptText: step.text,
    // Ham curriculum answer(s) — YALNIZ ön koşul/sağlamlık doğrulaması için
    // saklanır (bkz. tests/libertyAssessmentPolicy.test.js "curriculum'un
    // kendi answers'ı GERÇEK RuleEngine kümesiyle uyuşuyor"). Runtime kabul
    // kararı HER ZAMAN computeRealLiberties()'ten gelir, bundan DEĞİL.
    curriculumStatedAnswers: rawAnswers,
    feedbackOk: step.fb_ok ?? null,
    feedbackErr: step.fb_err ?? null,
    // Doğru cevap board'u GERÇEKTEN bir yakalamaya dönüştürüyorsa ('atari'
    // → 'capture', steps[7]) taşınır; dönüştürmüyorsa (steps[5]/[6]) alan
    // HİÇ EKLENMEZ — bkz. computeExpectedResultConcept.
    ...(expectedResultConcept ? { expectedResultConcept } : {}),
  };
}

/** Beş değerlendirmeyi curriculum'daki GERÇEK sırayla, normalize edilmiş
    biçimde döner. */
export function getAssessmentSteps() {
  const lesson = getLesson();
  return ASSESSMENT_STEP_INDICES.map(idx => normalizeStep(lesson.steps[idx], idx));
}

/** 'choice' tipi bir assessment için GERÇEK (RuleEngine hesaplı) doğru
    seçenek index'i — curriculum'un `correct:true` bayrağı DEĞİL. */
export function computeChoiceCorrectIndex(assessment) {
  const realCount = computeRealLiberties(assessment.board, assessment.size).length;
  return assessment.options.findIndex(o => o.text === String(realCount));
}

/** 'board_tap' tipi bir assessment için GERÇEK geçerli hedef noktalar. */
export function computeTapTargets(assessment) {
  return computeRealLiberties(assessment.board, assessment.size);
}

export function isValidTapAnswer(assessment, point) {
  if (!point) return false;
  return computeTapTargets(assessment).some(p => p.row === point.row && p.col === point.col);
}

/**
 * v2 — kök neden düzeltmesi: DOĞRU cevap oynandıktan SONRA gösterilen
 * turkuaz nefes işaretleri eskiden `computeTapTargets(assessment)`'i
 * TEKRAR çağırıyordu — bu fonksiyon HER ZAMAN `assessment.board`'un
 * (curriculum'dan gelen, ASLA mutate edilmeyen) HAM/hamle-ÖNCESİ diziliminden
 * hesap yapar, bu yüzden "sonuç" highlight'ı aslında hâlâ eski taşın/grubun
 * hamle-ÖNCESİ nefes noktalarıydı — board'da artık YENİ bir taş ve YENİ
 * (genelde daha büyük) bir grup varken (bkz. görev talimatı Bölüm 1).
 *
 * Bu fonksiyon, `point`teki DOĞRU hamleyi HAM board seed'i üzerinde GERÇEKTEN
 * simüle eder (core/ruleEngine.js applyMove — computeExpectedResultConcept
 * ile AYNI teknik) ve hamle SONRASI nihai bağlı grubun TÜM gerçek/tekil
 * nefes noktalarını döner — sabit koordinat listesinden, curriculum'un
 * answers alanından veya hamle-öncesi state'ten DEĞİL.
 *
 * `point` genelde computeTapTargets()'in kabul ettiği noktalardan biridir,
 * ama bu fonksiyon ÖZELLİKLE HANGİ nokta seçilirse seçilsin (item 4'ün dört
 * kabul edilen yönü FARKLI koordinat kümeleri ama item 3'te AYNI sayıyı
 * üretebilir — bkz. görev talimatı Bölüm 2 "seçilen yön değişse bile") doğru
 * sonucu verir; sabit/tek bir yön varsayılmaz.
 *
 * @param {object} assessment — normalizeStep()'in döndürdüğü 'board_tap' öğesi
 * @param {{row:number,col:number}} point — GERÇEKTEN oynanan (doğru) nokta
 * @returns {{groupSizeBeforeMove:number, libertyCountBeforeMove:number, groupSizeAfterMove:number, libertyCountAfterMove:number, resultLibertyPoints:Array<{row:number,col:number}>}}
 */
export function computeResultAfterMove(assessment, point) {
  const bs = seedBoardState(assessment.board, assessment.size);
  const anchor = assessment.board[0];
  const beforeGroup = getGroup(bs, anchor.x, anchor.y);
  const libertyCountBeforeMove = getLiberties(bs, beforeGroup).size;
  const groupSizeBeforeMove = beforeGroup.size;

  const { newState } = applyMove(bs, point.col, point.row, 'black');
  const afterGroup = getGroup(newState, point.col, point.row);
  const afterLibs = getLiberties(newState, afterGroup);
  const resultLibertyPoints = [...afterLibs].map(key => {
    const [x, y] = key.split(',').map(Number);
    return { row: y, col: x };
  });

  return {
    groupSizeBeforeMove,
    libertyCountBeforeMove,
    groupSizeAfterMove: afterGroup.size,
    libertyCountAfterMove: resultLibertyPoints.length,
    resultLibertyPoints,
  };
}

export function isValidChoiceAnswer(assessment, optionIndex) {
  return optionIndex === computeChoiceCorrectIndex(assessment);
}
