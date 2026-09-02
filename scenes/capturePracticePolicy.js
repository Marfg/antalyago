/**
 * scenes/capturePracticePolicy.js
 *
 * Sahne #7'nin ("Taş Alma Uygulamaları") altı iç anı için TEK doğruluk
 * kaynağı. `core/curriculum.js`'in `l3` dersindeki kullanıcıya görünen
 * 4., 5., 6., 7., 8. ve 9. adımları (sıfır tabanlı `steps[3..8]`) HAM
 * veriden okur — bu altı adımın metni/board seed'i/doğru cevabı/geri
 * bildirimi BURADA TEKRAR YAZILMAZ veya icat EDİLMEZ (bkz. görev talimatı
 * Bölüm 1). `scenes/capturePolicy.js` (Sahne #6) ile AYNI temel ilkeler
 * geçerlidir — "doğru nokta" ve "yakalanan taş sayısı" HER ZAMAN
 * core/ruleEngine.js'in GERÇEK sonucundan türetilir.
 *
 * ANCHOR TESPİTİ — GENELLEŞTİRİLDİ (bkz. görev talimatı Bölüm 8): Sahne
 * #6'nın "board seed'indeki İLK beyaz taş" varsayımı burada YETERLİ
 * DEĞİL — altı adımın hiçbirinde bugün birden fazla beyaz grup yok, ama
 * policy'nin KENDİSİ bu varsayıma güvenmemeli (bkz. dosya altı testler:
 * "birden fazla beyaz grup", "birden fazla atari grubu" edge-case'leri).
 * Bunun yerine `resolveTargetGroup()`:
 *   1) Tahtadaki TÜM bağlı beyaz grupları bulur (getGroup/getLiberties,
 *      dizilim SIRASINDAN bağımsız — bkz. findAllGroupsByColor),
 *   2) Tam olarak 1 nefesi kalan ("atari'deki") adayları filtreler,
 *   3) Tek aday varsa onu döner,
 *   4) Birden fazla aday varsa curriculum `answer` hamlesini GERÇEKTEN
 *      simüle eder ve o hamlenin GERÇEKTEN kaldırdığı taş kümesiyle TAM
 *      eşleşen adayı seçer (curriculum'un "hangi grup soruluyor" niyetini
 *      TAHMİN etmez, GERÇEK RuleEngine sonucundan okur),
 *   5) Hiç aday yoksa veya eşleşme bulunamazsa AÇIK, tanımlayıcı bir
 *      Error fırlatır — sessizce yanlış bir grup DÖNMEZ (bkz. görev
 *      talimatı Bölüm 14: "çökmek yerine açık diagnostics issue").
 *      Bu throw'lar Teacher Studio Diagnostics ve testler tarafından
 *      try/catch ile yakalanıp okunabilir bir satıra çevrilir — mevcut
 *      scenes/libertyAssessmentPolicy.js/capturePolicy.js "getLesson()
 *      throws if not found" deseniyle AYNI disiplin.
 */
import { CAM, CURRICULUM } from '../core/curriculum.js?v=2026-09-02.1';
import { BoardState } from '../core/boardState.js?v=2026-09-02.1';
import { getGroup, getLiberties, applyMove, isValidMove } from '../core/ruleEngine.js?v=2026-09-02.1';

const LESSON_ID = 'l3';
const BOARD_SIZE = 9;
/** l3'ün varsayılan Student Model kavramı — core/conceptMap.js'in
    `LESSON_DEFAULT_CONCEPT.l3` değeriyle AYNI GERÇEK ('capture') — bkz.
    scenes/capturePolicy.js AYNI sabit/gerekçe. */
const DEFAULT_CONCEPT = 'capture';
/** Kullanıcıya görünen 4./5./6./7./8./9. adımların sıfır-tabanlı curriculum
    index'leri (bkz. görev talimatı keşif tablosu — l3.steps[3..8]; repo
    üzerinden bağımsız doğrulandı, l3.steps.length === 9). */
export const MOMENT_STEP_INDICES = [3, 4, 5, 6, 7, 8];
export const MOMENT_COUNT = MOMENT_STEP_INDICES.length; // 6

export const HINT_MODES = Object.freeze({
  IMMEDIATE: 'immediate',
  AFTER_MISTAKE: 'after_mistake',
  ON_REQUEST: 'on_request',
  NONE_UNTIL_REQUEST: 'none_until_request',
});
const KNOWN_HINT_MODES = Object.values(HINT_MODES);

function getLesson() {
  const lesson = CURRICULUM.flatMap(chapter => chapter.lessons).find(l => l.id === LESSON_ID);
  if (!lesson) throw new Error(`capturePracticePolicy: '${LESSON_ID}' dersi curriculum'da bulunamadı`);
  return lesson;
}

/** Board seed'ini güvenli biçimde normalize eder — geçersiz veri (bilinmeyen
    renk, duplicate koordinat) SESSİZCE yutulmaz, AÇIK bir Error fırlatılır
    (bkz. görev talimatı Bölüm 14 edge-case'leri: "dolu answer noktası",
    "duplicate board noktası", "yanlış renk/sıra"). */
export function normalizeBoardSeed(rawSeed) {
  const seed = Array.isArray(rawSeed) ? rawSeed : [];
  const seen = new Set();
  const normalized = [];
  for (const s of seed) {
    if (!s || (s.color !== 'B' && s.color !== 'W')) {
      throw new Error(`capturePracticePolicy: geçersiz taş rengi: ${JSON.stringify(s)}`);
    }
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) {
      throw new Error(`capturePracticePolicy: geçersiz koordinat: ${JSON.stringify(s)}`);
    }
    const key = `${s.x},${s.y}`;
    if (seen.has(key)) {
      throw new Error(`capturePracticePolicy: duplicate board noktası: (${s.x},${s.y})`);
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

/** Tahtadaki, verilen renkteki TÜM bağlı grupları döner — board seed
    dizilim SIRASINDAN bağımsız (bkz. dosya başı "ANCHOR TESPİTİ" notu).
    @returns {Array<{points:Array<{x,y}>, liberties:Array<{x,y}>}>} */
function findAllGroupsByColor(bs, boardSeed, color) {
  const seen = new Set();
  const groups = [];
  for (const s of boardSeed) {
    if (s.color !== color) continue;
    const key = `${s.x},${s.y}`;
    if (seen.has(key)) continue;
    const group = getGroup(bs, s.x, s.y);
    group.forEach(k => seen.add(k));
    const libs = getLiberties(bs, group);
    groups.push({
      points: [...group].map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; }),
      liberties: [...libs].map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; }),
    });
  }
  return groups;
}

/**
 * Hedef (atari'deki) beyaz grubu GERÇEKTEN belirler — bkz. dosya başı
 * "ANCHOR TESPİTİ" notu için tam algoritma açıklaması.
 * @returns {{points:Array<{x,y}>, liberties:Array<{x,y}>}}
 */
export function resolveTargetGroup(boardSeed, size = BOARD_SIZE, answer = null) {
  const bs = seedBoardState(boardSeed, size);
  const whiteGroups = findAllGroupsByColor(bs, boardSeed, 'W');
  const atariCandidates = whiteGroups.filter(g => g.liberties.length === 1);
  if (atariCandidates.length === 1) return atariCandidates[0];
  if (atariCandidates.length === 0) {
    throw new Error('capturePracticePolicy: atari\'de beyaz grup bulunamadı (hedef grup yok veya tek nefeste değil)');
  }
  // Birden fazla atari adayı — curriculum answer'ın GERÇEKTEN hangi grubu
  // kaldırdığını simüle ederek çöz (tahmin YOK, gerçek applyMove sonucu VAR).
  if (!answer) {
    throw new Error('capturePracticePolicy: birden fazla atari adayı var ama curriculum answer yok — hedef belirlenemiyor');
  }
  const check = isValidMove(bs, answer.x, answer.y, 'black');
  if (!check.valid) {
    throw new Error(`capturePracticePolicy: curriculum answer (${answer.x},${answer.y}) yasal değil: ${check.reason}`);
  }
  const { captured } = applyMove(bs, answer.x, answer.y, 'black');
  const capturedKeys = new Set(captured.map(c => `${c.x},${c.y}`));
  const match = atariCandidates.find(g =>
    g.points.length === captured.length && g.points.every(p => capturedKeys.has(`${p.x},${p.y}`)));
  if (!match) {
    throw new Error('capturePracticePolicy: curriculum answer hiçbir atari adayının TAMAMINI kaldırmıyor — hedef grup belirsiz');
  }
  return match;
}

function cameraPresetName(cameraRef) {
  if (!cameraRef) return null;
  const entry = Object.entries(CAM).find(([, val]) => val === cameraRef);
  return entry ? entry[0] : null;
}

/** Bir anın hedef grubunun GERÇEK son nefes noktaları — `{row,col}`
    biçiminde (getGroup/getLiberties/x,y'den dönüştürülür). */
function toRowColPoints(points) {
  return points.map(p => ({ row: p.y, col: p.x }));
}

/** momentIndex + GERÇEK hedef grup boyutuna göre bu anın ipucu davranışı
    (bkz. görev talimatı Bölüm 5). Curriculum'un altı adımı zorluk artan
    sırayla authored (hedef grup boyutu 1,1,2,2,2,5 — RuleEngine ile
    doğrulandı, bkz. dosya altı testler) — ipucu desteği bu GERÇEK sırayı
    izleyerek kademeli AZALIR, yalnız momentIndex=4'te (köşe geometrisi
    daha zor algılanan 2 taşlı grup — "Sağ üst köşedeki iki beyazı yakala")
    bilinçli olarak after_mistake'e GERİ döner. Bu tek bir opak dizi
    DEĞİL — her dal GERÇEK momentIndex/targetGroupSize ile birlikte
    gerekçelendirilmiş, test edilebilir (bkz. tests/capturePracticePolicy.test.js
    "hintMode momentIndex+targetGroupSize'a göre..."). */
export function computeHintMode(momentIndex, targetGroupSize) {
  if (momentIndex === 0) {
    // Adım 4 (görünen) — ilk alıştırma, targetGroupSize=1 (tek taş, köşe).
    // Kullanıcı henüz bağımsız pratik yapmadı — ipucu doğrudan görünür.
    return HINT_MODES.IMMEDIATE;
  }
  if (momentIndex === 1) {
    // Adım 5 — targetGroupSize=1 (tek taş, kenar). Kullanıcı önce kendi
    // dener; yanlışsa ipucu otomatik açılır (düşük risk, hâlâ tek taş).
    return HINT_MODES.AFTER_MISTAKE;
  }
  if (momentIndex === 2 || momentIndex === 3) {
    // Adım 6/7 — targetGroupSize=2 (ilk grup örnekleri). Kavram geçişi:
    // otomatik açılış YOK, yalnız istemli "Nefes noktasını göster".
    return HINT_MODES.ON_REQUEST;
  }
  if (momentIndex === 4) {
    // Adım 8 — targetGroupSize=2 AMA köşe geometrisi ("Sağ üst köşedeki
    // iki beyazı yakala") daha yanıltıcı algılanır — after_mistake'e
    // BİLİNÇLİ olarak geri dönülür (hem otomatik hem istemli açılış).
    return HINT_MODES.AFTER_MISTAKE;
  }
  // Adım 9 (momentIndex=5) — targetGroupSize=5, L-şekil, bağımsız final
  // uygulaması. Hiçbir otomatik açılış YOK — yalnız AÇIK kullanıcı isteği.
  return HINT_MODES.NONE_UNTIL_REQUEST;
}

/** Bu anın GERÇEK Student Model kavramı — hedef grubun GERÇEK nefes
    sayısından türetilir (bkz. scenes/capturePolicy.js computeMomentConcept
    ile AYNI ilke). Altı gerçek adımın hepsi zaten "son nefes" senaryosu
    seçer (RuleEngine ile doğrulandı) — statik bir "hepsi atari" varsayımı
    YOK, HER çağrıda board seed'inden yeniden hesaplanır. */
export function computeMomentConcept(boardSeed, size, answer) {
  const target = resolveTargetGroup(boardSeed, size, answer);
  return target.liberties.length === 1 ? 'atari' : DEFAULT_CONCEPT;
}

function computeExpectedResultConcept(boardSeed, size, targetPoint) {
  if (!targetPoint) return null;
  const bs = seedBoardState(boardSeed, size);
  const { captured } = applyMove(bs, targetPoint.col, targetPoint.row, 'black');
  return captured.length > 0 ? 'capture' : null;
}

function normalizeMoment(step, curriculumStepIndex, momentIndex) {
  const board = normalizeBoardSeed(step.board);
  const size = step.size ?? BOARD_SIZE;
  const rawAnswer = step.answer ?? null;
  const target = resolveTargetGroup(board, size, rawAnswer);
  const lastLibertyPoints = toRowColPoints(target.liberties);
  const targetGroupSize = target.points.length;
  const hintMode = computeHintMode(momentIndex, targetGroupSize);
  return {
    momentIndex,
    curriculumStepIndex,
    board,
    size,
    cameraPreset: cameraPresetName(step.camera),
    promptText: step.text,
    feedbackOk: step.fb_ok ?? null,
    feedbackErr: step.fb_err ?? null,
    targetGroupSize,
    // Kabul kümesi — libertyAssessmentPolicy.js/capturePolicy.js'in
    // board_tap deseniyle AYNI: kümedeki HERHANGİ bir noktaya dokunmak
    // kabul edilir. Altı gerçek adımın hepsinde bu küme TEK noktaya iner
    // (son nefes noktası) — sabit/tekil bir varsayım KODLANMAZ.
    lastLibertyPoints,
    assessmentConcept: lastLibertyPoints.length === 1 ? 'atari' : DEFAULT_CONCEPT,
    ...(computeExpectedResultConcept(board, size, lastLibertyPoints[0]) === 'capture'
      ? { expectedResultConcept: 'capture' }
      : {}),
    hintMode,
    // İlk an (immediate) açılışta YALNIZ neon nefes işareti otomatik
    // gösterilir — taş silüeti DEĞİL (aşırı yönlendirmeyi sadeleştirme).
    // Diğer TÜM anlarda (after_mistake'in otomatik açılışı VEYA
    // on_request/none_until_request'in manuel düğme tetiklemesi) mevcut
    // iki katmanlı (neon + silüet) davranış KORUNUR. immediate dışında
    // hiçbir moment bu alanı false almaz; index'e göre AYRI bir dal YOK —
    // tek kaynak zaten yukarıdaki hintMode'dur.
    showAutomaticMovePreview: hintMode !== HINT_MODES.IMMEDIATE,
    // Ham curriculum answer — YALNIZ ön koşul/sağlamlık doğrulaması için
    // saklanır. Runtime kabul kararı HER ZAMAN resolveTargetGroup()/
    // lastLibertyPoints'ten gelir, bundan DEĞİL.
    curriculumStatedAnswer: rawAnswer ? { row: rawAnswer.y, col: rawAnswer.x } : null,
  };
}

/** Altı anı curriculum'daki GERÇEK sırayla, normalize edilmiş biçimde
    döner. */
export function getCapturePracticeMoments() {
  const lesson = getLesson();
  return MOMENT_STEP_INDICES.map((idx, i) => normalizeMoment(lesson.steps[idx], idx, i));
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
 * kalkıp kalkmadığını/kaç taş alındığını döner. YALNIZ
 * isValidCapturePoint() ile ÖNCEDEN doğrulanmış bir `point` için
 * çağrılmalıdır (bkz. scenes/capturePolicy.js computeCaptureResult ile
 * AYNI çağrı sözleşmesi).
 * @returns {{captured:Array<{row:number,col:number}>, capturedCount:number, targetRemovedFromBoard:boolean}}
 */
export function computePracticeResult(moment, point) {
  const bs = seedBoardState(moment.board, moment.size);
  const { captured: capturedRaw } = applyMove(bs, point.col, point.row, 'black');
  const captured = capturedRaw.map(c => ({ row: c.y, col: c.x }));
  return {
    captured,
    capturedCount: captured.length,
    targetRemovedFromBoard: captured.length === moment.targetGroupSize && captured.length > 0,
  };
}

/** Doğru yakalama sonrası kullanıcıya gösterilecek sonuç metni — GERÇEK
    `capturedCount`'tan üretilir, statik şablondan DEĞİL (bkz. görev
    talimatı Bölüm 7: "Sayı statik metinden değil capturedCount
    sonucundan gelmeli"). Tek taş için özel ifade, grup için gerçek
    sayıyla birleşik ifade kullanılır. */
export function buildResultText(capturedCount) {
  if (capturedCount === 1) return 'Doğru. Taşın son nefes noktası kapandı ve taş alındı.';
  return `Doğru. ${capturedCount} taşlık grup tahtadan alındı.`;
}

/** `hintMode` geçerli bilinen bir değer mi — Diagnostics'in "hintMode
    geçerli" kontrolü bunu kullanır. */
export function isKnownHintMode(mode) {
  return KNOWN_HINT_MODES.includes(mode);
}
