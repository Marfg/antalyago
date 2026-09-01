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
 *     `moves` dizisi TAM OLARAK İKİ GERÇEK formasyon/örnek taşır (bkz. v2
 *     revizyonu — önceki revizyon `moves.find(m=>m.color==='B')` ile
 *     YALNIZ İLKİNİ (üst formasyonu) alıyordu, ikinciyi (alt formasyonu)
 *     SESSİZCE atlıyordu; bu YANLIŞ bir daralmaydı ve TERK EDİLDİ):
 *       moves[0]: siyah `(4,0)` İNTİHAR GİBİ GÖRÜNÜR (üst formasyon, tüm
 *       komşular beyazla dolu) AMA GERÇEKTE YASALDIR — 5 beyaz taşı YAKALAR.
 *       moves[1]: beyaz `(4,8)` AYNI örüntünün simetrik ikizi (alt
 *       formasyon) — 5 siyah taşı YAKALAR.
 *     Board'un TAMAMI (24 taş) bu iki formasyonun AYRIK birleşimidir —
 *     y∈{0,1,2} (12 taş) ve y∈{6,7,8} (12 taş), aralarında SIFIR ortak taş
 *     (bağımsızlık RuleEngine ile doğrulandı, bkz. deriveLegalCaptureExamples
 *     notu). `computeCaptures`'ın "önce yakalama, sonra intihar" sırası
 *     (bkz. core/ruleEngine.js `isValidMove`) HER İKİSİNİ de yasal kılar.
 *     Kullanıcı HER İKİ noktayı da (ayrı ayrı, taze seed'lerle) dener,
 *     RuleEngine KABUL eder, taş yerleşir ve GERÇEKTEN 5 taş alınır. →
 *     `kind:'legal_capture'`, `legalCaptureExamples[2]`.
 *
 *     AUTHORED RENKLER KORUNUR (bkz. görev talimatı: "ikinci formasyonun
 *     curriculum'da yazıldığı gerçek taş renklerini koruyacak şekilde
 *     düzelt"). ÖNCEKİ revizyon `moves[1]`'in (beyazın hamlesi) formasyonunu
 *     renk-TERS ÇEVİRİP (B↔W) kullanıcıya HER ZAMAN siyah oynatıyordu — bu
 *     curriculum'un GERÇEKTEN yazdığı içerikle ÇELİŞEN, yanlış bir
 *     basitleştirmeydi ve TERK EDİLDİ. Artık `board` HİÇ dokunulmadan
 *     authored haliyle kalır; her örneğin `moveColor`'ı (`'B'`|`'W'`)
 *     DOĞRUDAN `moves[sourceIndex].color`'dan gelir — sahne katmanı bu
 *     rengi GERÇEKTEN oynatır (bkz. scenes/scene08IllegalMoves.js
 *     `activeMoveColor`). Örnek 0'da kullanıcı siyah, örnek 1'de GERÇEKTEN
 *     beyaz oynar — adapter zaten renk-agnostik olduğu için (bkz.
 *     adapters/sceneBoardAdapter.js playMove/setMovePreview, `color`
 *     parametresini DOĞRUDAN RuleEngine'e iletir) bu YENİ bir etkileşim
 *     paradigması GEREKTİRMEZ, yalnız sahnenin ÖNCEDEN her yerde hard-code
 *     ettiği `'black'` değerini aktif örneğin GERÇEK `moveColor`'ıyla
 *     değiştirir. `capturedColor` da GERÇEK yakalanan taşların board'daki
 *     ÖZGÜN (authored) rengi taranıp doğrulanarak türetilir (varsayılmaz).
 *
 * Sahnenin pedagojik akışı ("kuralı gör → hedefi dene → taşın yerleşmediğini
 * gözlemle → nedeni öğren → ikinci yasak duruma geç → iki durumu ayırt et")
 * bu GERÇEK ayrımla birebir örtüşür — iki an FARKLI beklenen sonuç
 * (`kind`/`expectedReason`/`expectedResultConcept`) taşır; ikisi de tek bir
 * "hep reddedilir" kalıbına ZORLANMADI (bkz. scenes/scene08IllegalMoves.js).
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
import { CAM, CURRICULUM } from '../core/curriculum.js?v=2026-09-01.1';
import { BoardState } from '../core/boardState.js?v=2026-09-01.1';
import { isValidMove, applyMove } from '../core/ruleEngine.js?v=2026-09-01.1';

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

/** `'B'|'W'` (curriculum'un KENDİ authored renk kısaltması) → RuleEngine'in
    beklediği `'black'|'white'` — TEK kanonik dönüştürücü, export edildi ki
    scenes/scene08IllegalMoves.js (setMovePreview/playMove için) AYNI
    fonksiyonu kullansın, KENDİ dağınık string karşılaştırmasını YAZMASIN
    (bkz. görev talimatı Bölüm 5). `undefined`/tanınmayan girdi güvenle
    `'black'`'a düşer (An 1 — REJECTED anlar `moveColor` alanı TAŞIMAZ,
    curriculum'un KENDİ metnine göre HER ZAMAN siyahtır). */
export function toRuntimeColor(c) { return c === 'W' ? 'white' : 'black'; }

/** `steps[1]`'in GERÇEK `moves` dizisindeki HER formasyonu (curriculum'da
    kaç tane VARSA — sabit "ilk/tek" varsayımı YOK) bağımsız, doğrulanmış bir
    "yakalama istisnası" örneğine dönüştürür — curriculum'un AUTHORED
    renkleriyle (bkz. dosya başı not: renk normalizasyonu TERK EDİLDİ). Her
    örnek:
      1) Yalnız o hamleye YAKIN (`|y-move.y|<=2`) GERÇEK taşları alır (diğer
         formasyona HİÇ dokunmaz — bağımsızlığı RuleEngine'in AYNI board'da
         iki formasyonun ortak taş PAYLAŞMADIĞINI doğrulamasıyla kanıtlanır,
         bkz. testler). Taşların renk etiketi HİÇ DEĞİŞTİRİLMEZ.
      2) Hamle curriculum'un KENDİ `moves[sourceIndex].color`'ıyla ('B'
         veya 'W') GERÇEKTEN oynanır — `isValidMove`/`applyMove` authored
         rengi alır, sahte bir 'black' varsayımı YOK.
      3) Yakalanan taş SAYISI VE KOORDİNATLARI curriculum'un kendi authored
         `capture` alanıyla TAM eşleştiği doğrulanır — uyuşmazsa AÇIK Error
         (sessizce yanlış bir alt-küme KULLANILMAZ). En az 1 taş
         yakalamıyorsa da AÇIK Error.
      4) Yakalanan taşların board'daki ÖZGÜN (authored) rengi taranır — HEPSİ
         AYNI (rakip) renk olmalı, varsayılmaz; tutarsızsa AÇIK Error.
      5) Duplicate (aynı board+hedef) örnek AÇIK Error üretir — sessizce
         yutulmaz. */
export function deriveLegalCaptureExamples(step, curriculumStepIndex) {
  const rawMoves = Array.isArray(step.moves) ? step.moves : [];
  if (!rawMoves.length) {
    throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] 'moves' dizisi boş/yok — 'legal_capture' anı GERÇEK formasyon örnekleri gerektirir`);
  }
  const size = step.size ?? BOARD_SIZE;
  const fullBoard = normalizeBoardSeed(step.board);
  const seenSignatures = new Set();
  const examples = [];
  rawMoves.forEach((mv, sourceIndex) => {
    if (mv.color !== 'B' && mv.color !== 'W') {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] geçersiz renk: ${JSON.stringify(mv.color)}`);
    }
    if (!Number.isInteger(mv.x) || !Number.isInteger(mv.y)) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] geçersiz hedef koordinatı: ${JSON.stringify(mv)}`);
    }
    const board = fullBoard.filter(s => Math.abs(s.y - mv.y) <= 2);
    if (!board.length) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] (${mv.x},${mv.y}) için hiçbir GERÇEK bağlamsal taş bulunamadı`);
    }
    const runtimeMoveColor = toRuntimeColor(mv.color);
    const bs = seedBoardState(board, size);
    const check = isValidMove(bs, mv.x, mv.y, runtimeMoveColor);
    if (!check.valid) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] hedef hamle (${mv.x},${mv.y}, renk:${mv.color}) RuleEngine'e göre yasal DEĞİL: ${check.reason} — 'legal_capture' örneği yasal olmasını gerektirir`);
    }
    const { captured: capturedRaw } = applyMove(bs, mv.x, mv.y, runtimeMoveColor);
    if (capturedRaw.length < 1) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] hedef hamle (${mv.x},${mv.y}) hiçbir taş YAKALAMIYOR — 'legal_capture' örneği en az bir yakalama gerektirir`);
    }
    const capturedKeys = new Set(capturedRaw.map(c => `${c.x},${c.y}`));
    const expectedCaptureRaw = Array.isArray(mv.capture) ? mv.capture : [];
    const expectedKeys = new Set(expectedCaptureRaw.map(c => `${c.x},${c.y}`));
    const matches = capturedRaw.length === expectedCaptureRaw.length
      && [...expectedKeys].every(k => capturedKeys.has(k));
    if (!matches) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] GERÇEK capture sonucu curriculum'un authored 'capture' alanıyla eşleşmiyor — filtrelenmiş board seed'i yanlış olabilir`);
    }
    // Yakalanan taşların board'daki ÖZGÜN (authored) rengi — varsayılmaz,
    // taranır (bkz. görev talimatı: "authored taş renkleriyle birebir").
    const capturedColors = new Set(capturedRaw.map(c => {
      const orig = board.find(s => s.x === c.x && s.y === c.y);
      return orig?.color;
    }));
    if (capturedColors.size !== 1 || capturedColors.has(undefined)) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] yakalanan taşların authored rengi tutarsız/bulunamadı: ${JSON.stringify([...capturedColors])}`);
    }
    const capturedColor = [...capturedColors][0];
    if (capturedColor === mv.color) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] yakalanan taşlar hamleyle AYNI renkte (${capturedColor}) — rakip taş olmalı`);
    }
    const signature = `${boardSignature(board)}|target:${mv.x},${mv.y}|color:${mv.color}`;
    if (seenSignatures.has(signature)) {
      throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] moves[${sourceIndex}] ÖNCEKİ bir örnekle DUPLICATE (aynı board+hedef+renk) — sessizce yutulmadı`);
    }
    seenSignatures.add(signature);
    examples.push({
      sourceIndex,
      board, // authored renklerle, HİÇ DEĞİŞTİRİLMEDEN
      size,
      targetPoint: { row: mv.y, col: mv.x }, // runtime (row,col) — row=y, col=x
      targetPointXY: { x: mv.x, y: mv.y }, // authored (x,y), curriculum'un KENDİ eksen adlandırması
      moveColor: mv.color, // 'B'|'W' — authored, DÖNÜŞTÜRÜLMEDİ
      capturedColor, // 'B'|'W' — GERÇEK yakalanan taşlardan türetildi
      cameraPreset: cameraPresetName(step.camera),
      expectedCapturedCount: capturedRaw.length,
      assessmentConcept: CONCEPT,
      resultConcept: 'capture',
    });
  });
  return examples;
}

/** `steps[1]` — "yakalama istisnası". `legalCaptureExamples`'daki HER GERÇEK
    formasyon örneği (bkz. deriveLegalCaptureExamples) korunur; tek bir
    "ilk/tek örnek" özetine İNDİRGENMEZ (bkz. görev talimatı: "ikinci anı
    bütün curriculum örneklerine dönüştür"). Sahne katmanı bu momenti
    `resolveCaptureExampleMoment()` ile TEK-örnek "çözümlenmiş" bir görünüme
    çevirip render/etkileşim eder (bkz. scenes/scene08IllegalMoves.js) —
    policy KENDİSİ hangi örneğin "aktif" olduğunu BİLMEZ/TUTMAZ
    (durum-bilgisiz kalır, dosya başı ilkeyle AYNI). */
function normalizeLegalCaptureMoment(step, curriculumStepIndex, momentIndex) {
  const legalCaptureExamples = deriveLegalCaptureExamples(step, curriculumStepIndex);
  return {
    momentIndex,
    curriculumStepIndex,
    kind: MOMENT_KINDS.LEGAL_CAPTURE,
    promptText: step.text,
    assessmentConcept: CONCEPT,
    // Alan adı KASITLI olarak capturePracticePolicy.js/capturePolicy.js'in
    // moment-seviyesi `expectedResultConcept`'iyle AYNI (event payload'ının
    // KENDİ `resultConcept` alanından AYRI — bkz. scenes/scene08IllegalMoves.js).
    // TÜM örnekler için AYNI ('capture') — kolaylık alanı, examples[i]'de de var.
    expectedResultConcept: 'capture',
    legalCaptureExamples,
  };
}

/** `moment.legalCaptureExamples[exampleIndex]`'i, ESKİ tek-hedef moment
    şekliyle (board/size/cameraPreset/targetPoints/expectedCapturedCount/
    expectedResultConcept) AYNI alan adlarını taşıyan bir "çözümlenmiş"
    görünüme çevirir — `evaluateAttempt`/`boardSignature` gibi mevcut TÜM
    fonksiyonlar DEĞİŞMEDEN bu görünüm üzerinde çalışabilir (bkz. görev
    talimatı: "Alan adlarını mevcut stile göre seç"). `exampleIndex`/
    `exampleCount`/`sourceIndex`/`moveColor`/`capturedColor`/
    `targetPointXY` sahne katmanının progress/event/preview alanları için
    EKLENİR — `moveColor` ('B'|'W') `evaluateAttempt`'in HANGİ rengi
    oynatacağını da belirler (bkz. aşağıda). */
export function resolveCaptureExampleMoment(moment, exampleIndex) {
  const examples = moment.legalCaptureExamples;
  const ex = examples[exampleIndex];
  if (!ex) {
    throw new Error(`illegalMovePolicy: geçersiz legalCaptureExamples index'i: ${exampleIndex} (toplam: ${examples.length})`);
  }
  return {
    momentIndex: moment.momentIndex,
    curriculumStepIndex: moment.curriculumStepIndex,
    kind: moment.kind,
    board: ex.board,
    size: ex.size,
    cameraPreset: ex.cameraPreset,
    promptText: moment.promptText,
    targetPoints: [ex.targetPoint],
    targetPointXY: ex.targetPointXY,
    expectedReason: null,
    expectedCapturedCount: ex.expectedCapturedCount,
    assessmentConcept: ex.assessmentConcept,
    expectedResultConcept: ex.resultConcept,
    sourceIndex: ex.sourceIndex,
    exampleIndex,
    exampleCount: examples.length,
    moveColor: ex.moveColor,
    capturedColor: ex.capturedColor,
  };
}

/** Adımın GERÇEK veri şekline göre dallanır (hardcoded `momentIndex`
    varsayımı DEĞİL — bkz. görev talimatı: "içeriği tahmin etme"). */
function normalizeMoment(step, curriculumStepIndex, momentIndex) {
  if (Array.isArray(step.forbidden) && step.forbidden.length) {
    return normalizeRejectedMoment(step, curriculumStepIndex, momentIndex);
  }
  if (Array.isArray(step.moves) && step.moves.length) {
    return normalizeLegalCaptureMoment(step, curriculumStepIndex, momentIndex);
  }
  throw new Error(`illegalMovePolicy: steps[${curriculumStepIndex}] ne 'forbidden' ne 'moves' taşıyor — bilinen iki an türünden hiçbiriyle eşleşmiyor`);
}

/** İki anı curriculum'daki GERÇEK sırayla, normalize edilmiş biçimde
    döner. `legal_capture` anı KENDİ İÇİNDE `legalCaptureExamples[]`
    taşır — sahne katmanı bunları `resolveCaptureExampleMoment()` ile
    tek tek "çözümler" (bkz. yukarıdaki not). */
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
 * reason analiz edilebilir"). Hangi RENGİN oynadığı `moment.moveColor`'dan
 * (bkz. resolveCaptureExampleMoment) gelir — REJECTED anlar (An 1) bu
 * alanı HİÇ TAŞIMAZ, `toRuntimeColor(undefined)` güvenle `'black'`'a
 * düşer (An 1 curriculum'un KENDİ metnine göre HER ZAMAN siyahtır,
 * davranış DEĞİŞMEDİ).
 * @param {object} moment
 * @param {{row:number,col:number}} point
 * @returns {{legal:boolean, reason:string|null, captured:Array<{row:number,col:number}>, capturedCount:number, isCurriculumTarget:boolean}}
 */
export function evaluateAttempt(moment, point) {
  const bs = seedBoardState(moment.board, moment.size);
  const runtimeColor = toRuntimeColor(moment.moveColor);
  const check = isValidMove(bs, point.col, point.row, runtimeColor);
  const isCurriculumTarget = isTargetPoint(moment, point);
  if (!check.valid) {
    return { legal: false, reason: check.reason, captured: [], capturedCount: 0, isCurriculumTarget };
  }
  const { captured: capturedRaw } = applyMove(bs, point.col, point.row, runtimeColor);
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
