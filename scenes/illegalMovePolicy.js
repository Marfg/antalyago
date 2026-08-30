/**
 * scenes/illegalMovePolicy.js
 *
 * Sahne #8'in ("Yasak Hamleler") iki iç anı için TEK doğruluk kaynağı.
 * `core/curriculum.js`'in `l4` ("Yasak Hamleler") dersinin kullanıcıya
 * görünen 1. ve 2. adımlarını (sıfır tabanlı `steps[0..1]` — repo
 * üzerinden bağımsız doğrulandı, `l4.steps.length === 4`) HAM veriden
 * okur — bu iki adımın metni/board seed'i/gerçek yasak-nokta veya hamle
 * verisi BURADA TEKRAR YAZILMAZ veya icat EDİLMEZ (bkz. görev talimatı
 * Bölüm 2). `scenes/capturePracticePolicy.js` (Sahne #7) ile AYNI temel
 * ilke geçerlidir — "hedef" ve "sonuç" HER ZAMAN `core/ruleEngine.js`'in
 * GERÇEK sonucundan türetilir, koordinat karşılaştırmasından DEĞİL.
 *
 * GERÇEK İÇERİK — İKİ FARKLI DURUM (bkz. görev talimatı: "gerçek içerik
 * neyse onu uygula, tahmin etme"; "iki durumu ayırt et"): `l4.steps[0]`
 * ve `steps[1]` AYNI türde bir "dene ve her zaman reddedilsin" alıştırması
 * DEĞİL — RuleEngine ile bağımsızca doğrulandı:
 *
 *   - `steps[0]` ("öz-yakalama yasağı" / suicide rule): board'da GERÇEKTEN
 *     4 farklı nokta var — curriculum'un KENDİ `forbidden` dizisi. Dördü
 *     de `isValidMove(...)`'a göre GERÇEKTEN intihar (`SUICIDE`) —
 *     `normalizeRejectedMoment` bunu curriculum'un TAM 14 taşlı board'unda
 *     doğrular. Curriculum'un KENDİ metni "4 farklı yasak nokta... fark et"
 *     dediği için `targetPoints` DÖRDÜNÜ de taşır — kullanıcı dördünü de
 *     SERBEST sırada bulup dener (bkz. scenes/scene08IllegalMoves.js,
 *     `attemptedForbiddenPoints` Set'i). Kamera/mobil kadraj gerekçesiyle
 *     içerik TEK hedefe indirilmedi (bkz. önceki revizyon notu — o yaklaşım
 *     bu revizyonda TERK EDİLDİ): `minZoom:160` (bkz. scene08IllegalMoves.js
 *     seedMoment) dört hedefin TAMAMINI + TÜM 14 bağlamsal taşı 1280×720/
 *     768×1024/390×844/360×800/844×390 viewport'larının HEPSİNDE
 *     `safe:true, worstViolationPx:0` ile kadrajlar (ölçüldü, bkz. görev
 *     talimatı hata ayıklaması). Kullanıcı hedeflerden birini dener,
 *     RuleEngine reddeder, taş yerleşmez. → `kind:'rejected'`.
 *
 *   - `steps[1]` ("yakalama istisnası" / capture exception): curriculum'un
 *     kendi `moves[0]` hamlesi (siyah `(4,0)`) İNTİHAR GİBİ GÖRÜNÜR (tüm
 *     komşular beyazla dolu) AMA GERÇEKTE YASALDIR — çünkü aynı anda 5
 *     beyaz taşı YAKALAR (`computeCaptures`'ın "önce yakalama, sonra
 *     intihar" sırası — bkz. core/ruleEngine.js `isValidMove`). Bu,
 *     BİRİNCİ durumun kendi curriculum metnindeki İSTİSNASIdır ("İstisna:
 *     intihar gibi görünen hamle rakip grubu yakalıyorsa geçerlidir").
 *     Kullanıcı bu noktayı dener, RuleEngine KABUL eder, taş yerleşir ve
 *     GERÇEKTEN 5 taş alınır. → `kind:'legal_capture'`.
 *
 * Sahnenin pedagojik akışı ("kuralı gör → hedefi dene → taşın yerleşmediğini
 * gözlemle → nedeni öğren → ikinci yasak duruma geç → iki durumu ayırt et")
 * bu GERÇEK ayrımla birebir örtüşür — iki an FARKLI beklenen sonuç
 * (`kind`/`expectedReason`/`expectedResultConcept`) taşır; ikisi de tek bir
 * "hep reddedilir" kalıbına ZORLANMADI (bkz. scenes/scene08IllegalMoves.js).
 *
 * `steps[1]`'in board'u İKİ simetrik formasyon içerir (siyah üstte 5
 * beyazı yakalar, beyaz altta 5 siyahı yakalar — curriculum'un KENDİ
 * "yakalama istisnasını izle" auto-demo'su ikisini de oynatır). Bu sahne
 * — diğer tüm sahneler gibi — YALNIZ siyah/kullanıcı perspektifini
 * kullanır (bkz. görev talimatı: kullanıcı her zaman siyah oynar), bu
 * yüzden `normalizeLegalCaptureMoment` YALNIZ hedef hamleye YAKIN
 * (`|y - targetMove.y| <= 2`) GERÇEK taşları board seed'ine alır — alt
 * (beyazın kendi simetrik yakalaması) formasyon kullanıcı etkileşimiyle
 * İLGİSİZ, dahil EDİLMEZ. Bu bir koordinat İCADI DEĞİL — yalnız hedefe
 * yakın GERÇEK taşların bir alt-kümesi; doğruluğu aşağıda GERÇEK
 * `applyMove` sonucunun curriculum'un kendi authored `capture` alanıyla
 * TAM eşleştiği doğrulanarak KANITLANIR (uyuşmazsa açık bir Error fırlatılır
 * — sessizce yanlış bir alt-küme KULLANILMAZ, bkz. capturePracticePolicy.js
 * AYNI "throw over silent guess" disiplini).
 *
 * KAVRAM (bkz. görev talimatı Bölüm 13): scene-seviyesi concept
 * `'forbidden_move'` — KASITLI olarak `core/conceptMap.js`'in
 * `KNOWN_CONCEPTS` listesine EKLENMEDİ (Student Model'e doğrulanmadan yeni
 * kavram eklenmez). Teacher Studio Diagnostics bunu bilinen-olmayan concept
 * olarak raporlar (bkz. teacher-studio.html Sahne #8 diagnostics bloğu) —
 * bu BİLİNÇLİ bir boşluk, sessizce gizlenmedi. `steps[1]`'in GERÇEK sonucu
 * bir yakalama olduğu için `expectedResultConcept:'capture'` — bu ZATEN
 * `KNOWN_CONCEPTS`'te olan, doğrulanmış bir kavramdır (capturePracticePolicy.js
 * ile AYNI ilke).
 */
import { CAM, CURRICULUM } from '../core/curriculum.js?v=2026-08-29.1';
import { BoardState } from '../core/boardState.js?v=2026-08-29.1';
import { isValidMove, applyMove } from '../core/ruleEngine.js?v=2026-08-29.1';

const LESSON_ID = 'l4';
const BOARD_SIZE = 9;
/** l4'ün bu sahnede kullanılan scene-seviyesi kavramı — bkz. dosya başı
    "KAVRAM" notu. `core/conceptMap.js`'e KASITLI eklenmedi. */
export const CONCEPT = 'forbidden_move';
/** Kullanıcıya görünen 1./2. adımların sıfır-tabanlı curriculum index'leri
    (bkz. dosya başı keşif notu — l4.steps[0..1]; repo üzerinden bağımsız
    doğrulandı, l4.steps.length === 4). */
export const MOMENT_STEP_INDICES = [0, 1];
export const MOMENT_COUNT = MOMENT_STEP_INDICES.length; // 2

export const MOMENT_KINDS = Object.freeze({
  REJECTED: 'rejected',
  LEGAL_CAPTURE: 'legal_capture',
});

/** `steps[0]`'ın curriculum'un KENDİ metnine göre ("4 farklı yasak nokta
    var") beklenen, sabit-kodlanmış DOĞRULAMA sayısı — hedef LİSTESİNİN
    KENDİSİ değil (o `l4.steps[0].forbidden`'dan gelir), yalnız o listenin
    curriculum'un iddiasıyla TUTARLI olduğunu doğrulayan bir sabit (bkz.
    normalizeRejectedMoment). */
const FORBIDDEN_TARGET_COUNT = 4;

function getLesson() {
  const lesson = CURRICULUM.flatMap(chapter => chapter.lessons).find(l => l.id === LESSON_ID);
  if (!lesson) throw new Error(`illegalMovePolicy: '${LESSON_ID}' dersi curriculum'da bulunamadı`);
  return lesson;
}

/** Board seed'ini güvenli biçimde normalize eder — geçersiz veri (bilinmeyen
    renk, geçersiz koordinat, duplicate koordinat) SESSİZCE yutulmaz, AÇIK
    bir Error fırlatılır (bkz. scenes/capturePracticePolicy.js AYNI desen). */
export function normalizeBoardSeed(rawSeed) {
  const seed = Array.isArray(rawSeed) ? rawSeed : [];
  const seen = new Set();
  const normalized = [];
  for (const s of seed) {
    if (!s || (s.color !== 'B' && s.color !== 'W')) {
      throw new Error(`illegalMovePolicy: geçersiz taş rengi: ${JSON.stringify(s)}`);
    }
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) {
      throw new Error(`illegalMovePolicy: geçersiz koordinat: ${JSON.stringify(s)}`);
    }
    const key = `${s.x},${s.y}`;
    if (seen.has(key)) {
      throw new Error(`illegalMovePolicy: duplicate board noktası: (${s.x},${s.y})`);
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

/** `steps[0]` — "öz-yakalama yasağı". Curriculum'un TAM board'unda (14 taş)
    kendi `forbidden` dizisindeki HER noktanın GERÇEKTEN (RuleEngine'e göre)
    intihar olduğunu, tam olarak DÖRT BENZERSİZ hedef olduğunu ve hepsinin
    tahta içi/boş olduğunu doğrular — curriculum'un "4 farklı yasak nokta
    var" iddiası TAMAMI KANITLANIR; herhangi bir sapmada (biri yasal çıkarsa,
    reason SUICIDE değilse, sayı dört değilse, duplicate varsa, tahta
    dışı/dolu bir nokta varsa) AÇIK bir Error fırlatılır, sessizce göz
    yumulmaz. Board seed TAM 14 taş — hiçbir formasyon budanmaz (bkz. görev
    talimatı: "dört hedefi kapsayan... minimum formasyon" — GERÇEKTE bu dört
    formasyonun BİRLEŞİMİ zaten curriculum'un authored 14 taşının TAMAMI,
    ölçüldü/doğrulandı; fazladan bağlamsal taş YOK, eksik de YOK). */
// `export` — bkz. scenes/capturePracticePolicy.js `resolveTargetGroup` İLE
// AYNI gerekçe: edge-case testlerinin (duplicate/eksik/board-dışı/dolu
// hedef) GERÇEK curriculum verisini DEĞİŞTİRMEDEN, sentetik `step`
// nesneleriyle bu fonksiyonu DOĞRUDAN çağırabilmesi için (bkz.
// tests/illegalMovePolicy.test.js "EDGE: normalizeRejectedMoment" bloğu).
export function normalizeRejectedMoment(step, curriculumStepIndex, momentIndex) {
  const board = normalizeBoardSeed(step.board);
  const size = step.size ?? BOARD_SIZE;
  const rawForbidden = Array.isArray(step.forbidden) ? step.forbidden : [];
  if (!rawForbidden.length) {
    throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] 'forbidden' dizisi boş/yok — 'rejected' anı GERÇEK bir yasak nokta listesi gerektirir`);
  }
  const bs = seedBoardState(board, size);
  const seenKeys = new Set();
  const targetPoints = [];
  for (const p of rawForbidden) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] forbidden noktası geçersiz: ${JSON.stringify(p)}`);
    }
    if (!bs.isInBounds(p.x, p.y)) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] forbidden noktası (${p.x},${p.y}) tahta dışı`);
    }
    const key = `${p.y},${p.x}`;
    if (seenKeys.has(key)) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] duplicate forbidden noktası: (${p.x},${p.y})`);
    }
    seenKeys.add(key);
    const check = isValidMove(bs, p.x, p.y, 'black');
    if (check.valid) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] forbidden noktası (${p.x},${p.y}) RuleEngine'e göre ASLINDA yasal — curriculum verisiyle çelişiyor`);
    }
    if (check.reason !== 'SUICIDE') {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] forbidden noktası (${p.x},${p.y}) beklenmeyen reddetme nedeni: ${check.reason} (beklenen SUICIDE)`);
    }
    targetPoints.push({ row: p.y, col: p.x });
  }
  if (targetPoints.length !== FORBIDDEN_TARGET_COUNT) {
    throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] tam olarak ${FORBIDDEN_TARGET_COUNT} benzersiz yasak nokta bekleniyor, bulunan: ${targetPoints.length}`);
  }

  return {
    momentIndex,
    curriculumStepIndex,
    kind: MOMENT_KINDS.REJECTED,
    board,
    size,
    cameraPreset: cameraPresetName(step.camera),
    promptText: step.text,
    targetPoints,
    expectedReason: 'SUICIDE',
    expectedCapturedCount: 0,
    assessmentConcept: CONCEPT,
  };
}

/** `steps[1]` — "yakalama istisnası". Bkz. dosya başı not: yalnız hedef
    hamleye yakın GERÇEK taşlar board seed'ine alınır (alt/beyaz simetrik
    formasyon HARİÇ), doğruluğu GERÇEK `applyMove` sonucunun curriculum'un
    kendi authored `capture` alanıyla TAM eşleştiği doğrulanarak
    KANITLANIR. */
function normalizeLegalCaptureMoment(step, curriculumStepIndex, momentIndex) {
  const rawMoves = Array.isArray(step.moves) ? step.moves : [];
  const targetMove = rawMoves.find(m => m.color === 'B');
  if (!targetMove) {
    throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] siyah 'moves' hamlesi bulunamadı — 'legal_capture' anı bunu gerektirir`);
  }
  const size = step.size ?? BOARD_SIZE;
  const fullBoard = normalizeBoardSeed(step.board);
  const board = fullBoard.filter(s => Math.abs(s.y - targetMove.y) <= 2);
  const bs = seedBoardState(board, size);
  const check = isValidMove(bs, targetMove.x, targetMove.y, 'black');
  if (!check.valid) {
    throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] hedef hamle (${targetMove.x},${targetMove.y}) RuleEngine'e göre yasal DEĞİL: ${check.reason} — 'legal_capture' anı yasal olmasını gerektirir`);
  }
  const { captured: capturedRaw } = applyMove(bs, targetMove.x, targetMove.y, 'black');
  const capturedKeys = new Set(capturedRaw.map(c => `${c.x},${c.y}`));
  const expectedCaptureRaw = Array.isArray(targetMove.capture) ? targetMove.capture : [];
  const expectedKeys = new Set(expectedCaptureRaw.map(c => `${c.x},${c.y}`));
  const matches = capturedRaw.length === expectedCaptureRaw.length
    && [...expectedKeys].every(k => capturedKeys.has(k));
  if (!matches) {
    throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] GERÇEK capture sonucu curriculum'un authored 'capture' alanıyla eşleşmiyor — filtrelenmiş board seed'i (yalnız hedefe yakın formasyon) yanlış olabilir`);
  }
  return {
    momentIndex,
    curriculumStepIndex,
    kind: MOMENT_KINDS.LEGAL_CAPTURE,
    board,
    size,
    cameraPreset: cameraPresetName(step.camera),
    promptText: step.text,
    targetPoints: [{ row: targetMove.y, col: targetMove.x }],
    expectedReason: null,
    expectedCapturedCount: capturedRaw.length,
    assessmentConcept: CONCEPT,
    // Alan adı KASITLI olarak capturePracticePolicy.js/capturePolicy.js'in
    // moment-seviyesi `expectedResultConcept`'iyle AYNI (event payload'ının
    // KENDİ `resultConcept` alanından AYRI — bkz. scenes/scene08IllegalMoves.js).
    expectedResultConcept: 'capture',
  };
}

/** Adımın GERÇEK veri şekline göre dallanır (hardcoded `momentIndex`
    varsayımı DEĞİL — bkz. görev talimatı: "içeriği tahmin etme"). */
function normalizeMoment(step, curriculumStepIndex, momentIndex) {
  if (Array.isArray(step.forbidden) && step.forbidden.length) {
    return normalizeRejectedMoment(step, curriculumStepIndex, momentIndex);
  }
  if (Array.isArray(step.moves) && step.moves.some(m => m.color === 'B')) {
    return normalizeLegalCaptureMoment(step, curriculumStepIndex, momentIndex);
  }
  throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] ne 'forbidden' ne siyah içeren 'moves' taşıyor — bilinen iki an türünden hiçbiriyle eşleşmiyor`);
}

/** İki anı curriculum'daki GERÇEK sırayla, normalize edilmiş biçimde
    döner. */
export function getIllegalMoveMoments() {
  const lesson = getLesson();
  return MOMENT_STEP_INDICES.map((idx, i) => normalizeMoment(lesson.steps[idx], idx, i));
}

/** `point`in bu anın GERÇEK curriculum hedef kümesinde olup olmadığı —
    sabit koordinat KARŞILAŞTIRMASI değil, `moment.targetPoints`'ten (ki o
    da RuleEngine ile doğrulanmıştır) okunur. */
export function isTargetPoint(moment, point) {
  if (!point) return false;
  return moment.targetPoints.some(p => p.row === point.row && p.col === point.col);
}

/** `{row,col}`'dan deterministik bir string anahtar üretir — sahne
    modülünün SERBEST SIRALI ilerleme durumunu (`attemptedForbiddenPoints`,
    bkz. scenes/scene08IllegalMoves.js) bir `Set<string>` olarak tutabilmesi
    için TEK, tutarlı anahtar biçimi (bkz. görev talimatı Bölüm 4:
    "attemptedForbiddenPoints: Set<pointKey>"). Policy bu Set'in KENDİSİNİ
    TUTMAZ (durum-bilgisiz kalır, bkz. dosya başı ilke) — yalnız anahtar
    üretimini merkezîleştirir. */
export function pointKey(point) {
  return `${point.row},${point.col}`;
}

/**
 * `point`teki hamleyi bu anın HAM board seed'i üzerinde GERÇEKTEN simüle
 * eder (core/ruleEngine.js isValidMove/applyMove) — koordinat
 * KARŞILAŞTIRMASI DEĞİL. Hem curriculum hedefi hem hedef-dışı herhangi bir
 * gerçek kesişim için çağrılabilir (bkz. görev talimatı Bölüm 9: "gerçek
 * reason analiz edilebilir").
 * @param {object} moment
 * @param {{row:number,col:number}} point
 * @returns {{legal:boolean, reason:string|null, captured:Array<{row:number,col:number}>, capturedCount:number, isCurriculumTarget:boolean}}
 */
export function evaluateAttempt(moment, point) {
  const bs = seedBoardState(moment.board, moment.size);
  const check = isValidMove(bs, point.col, point.row, 'black');
  const isCurriculumTarget = isTargetPoint(moment, point);
  if (!check.valid) {
    return { legal: false, reason: check.reason, captured: [], capturedCount: 0, isCurriculumTarget };
  }
  const { captured: capturedRaw } = applyMove(bs, point.col, point.row, 'black');
  const captured = capturedRaw.map(c => ({ row: c.y, col: c.x }));
  return { legal: true, reason: null, captured, capturedCount: captured.length, isCurriculumTarget };
}

/** Board seed'inin (taş listesinin) deterministik, sıradan bağımsız imzası
    — "hamle denemesinden ÖNCE/SONRA board GERÇEKTEN değişmedi" kanıtı için
    (bkz. görev talimatı Bölüm 10/18: "board signature değişmiyor"). */
export function boardSignature(boardSeed) {
  return boardSeed.map(s => `${s.color}${s.x},${s.y}`).sort().join('|');
}

/** RuleEngine'in HAM (İngilizce) `reason` kodundan kullanıcıya dönük KISA
    Türkçe açıklama üretir (bkz. görev talimatı Bölüm 13/16: "ham teknik
    reason kullanıcıya SIZMASIN, Türkçe açıklama kullan; ham JSON'da teknik
    reason kalabilir"). Bilinmeyen bir reason SESSİZCE yanlış bir metne
    DÖNÜŞTÜRÜLMEZ — açıkça "bilinmeyen" der, Teacher Studio Diagnostics bunu
    yakalayabilir. */
const REASON_LABELS_TR = {
  SUICIDE: 'Bu nokta öz-yakalama yasağına takılıyor — taş konulsa hiç nefesi kalmıyor ve hiçbir rakip taş yakalanmıyor.',
  OCCUPIED: 'Bu kesişimde zaten bir taş var.',
  OUT_OF_BOUNDS: 'Bu nokta tahtanın dışında.',
  KO: 'Bu nokta şu an ko kuralı yüzünden yasak.',
};
export function reasonLabelTr(reason) {
  return REASON_LABELS_TR[reason] ?? `Bilinmeyen kural nedeni: ${reason}`;
}

/** `kind` geçerli bilinen bir değer mi — Diagnostics'in "kind geçerli"
    kontrolü bunu kullanır. */
export function isKnownMomentKind(kind) {
  return kind === MOMENT_KINDS.REJECTED || kind === MOMENT_KINDS.LEGAL_CAPTURE;
}
