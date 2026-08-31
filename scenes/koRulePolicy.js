/**
 * scenes/koRulePolicy.js
 *
 * Sahne #9'un ("Ko Kuralı") iki iç anı için TEK doğruluk kaynağı.
 * `core/curriculum.js`'in `l5` ("Ko Kuralı") dersinin kullanıcıya görünen
 * 1. ve 2. adımlarını (sıfır tabanlı `steps[0..1]` — repo üzerinden bağımsız
 * doğrulandı, `l5.steps.length === 4`) HAM veriden okur — bu iki adımın
 * metni/board seed'i/scripted hamle dizisi BURADA TEKRAR YAZILMAZ veya icat
 * EDİLMEZ (`scenes/illegalMovePolicy.js`/`scenes/capturePracticePolicy.js`
 * İLE AYNI temel ilke). `formations/b1-temel-kurallar/l5-ko-kurali/adim-1.json`
 * ve `adim-2.json` bu iki adımın bire-bir mirror'ıdır (bkz. `formations/
 * CLAUDE.md`: "Formation JSON'ları şu an doğrudan kullanılmıyor") — bu dosya
 * diğer TÜM sahnelerle aynı ilkeyle yalnız `core/curriculum.js`'i okur.
 *
 * Bu dosya BİLEREK `scenes/illegalMovePolicy.js`'den import ETMEZ ve onu
 * DEĞİŞTİRMEZ (görev talimatı) — kendi bağımsız `evaluateKoAttempt`/
 * `reasonLabelTr` kümesini taşır.
 *
 * KÖK NEDEN NOTU — KO NOKTASI TARİHÇE BİLGİSİDİR, STATİK POZİSYON DEĞİL:
 * `core/ruleEngine.js`'in ko kontrolü basit-ko'dur (`board.koPoint`, yalnız
 * BİR ÖNCEKİ hamlenin gerçekten ürettiği geçici bir bayrak) — `core/
 * boardState.js`'in `placeStone()`'u bunu ASLA ayarlamaz, yalnız
 * `ruleEngine.js`'in `applyMove()`'u ayarlar. Bu yüzden `steps[1]`'in
 * (An 2) statik `board` alanını (yakalama-SONRASI görsel taş dizilimi) taze
 * bir `BoardState`'e taş taş yerleştirmek YETMEZ — böyle taze bir board'da
 * `koPoint` her zaman `null`'dur, ko kısıtı KAYBOLUR (bu, ilk yazımda
 * `steps[1] ko noktası başlangıçta yasak DEĞİL` şeklinde bir build-time
 * throw'la GERÇEKTEN yakalandı). Doğru çözüm: An 2'nin başlangıç durumu
 * An 1'in KENDİ yakalama hamlesini GERÇEKTEN oynatarak (`computeCaptureOrigin`)
 * elde edilir — ko kısıtı, statik bir taş listesinden DEĞİL, gerçek oyun
 * geçmişinden gelir (bkz. `scenes/scene09KoRule.js`'in canlı tahtada da
 * AYNI ilkeyi izlemesi: An 2'nin kurulumu da An 1'in orijinal board'unu +
 * yakalama hamlesini yeniden oynatır, `steps[1].board`'u doğrudan
 * taş-taş YERLEŞTİRMEZ).
 *
 * GERÇEK İÇERİK — İKİ FARKLI AN (RuleEngine ile bağımsızca doğrulandı):
 *
 *   - `steps[0]` ("hemen geri alma yasağı" / ko_reject): board'da siyah TEK
 *     bir hamleyle (`moves[0]`, curriculum'un kendi authored hamlesi) beyazın
 *     tek taşını yakalar. Bu yakalama GERÇEKTEN `core/ruleEngine.js`'in ko
 *     koşulunu üretir mi (tam 1 taş yakalandı VE yeni taşın tek nefesi
 *     yakalanan nokta) — build-time DOĞRULANIR, hard-code EDİLMEZ. Ardından
 *     beyazın o noktaya (ko noktasına) GERÇEKTEN hemen oynayamadığı —
 *     `isValidMove`'un `KO` reason'ıyla reddettiği — de build-time
 *     KANITLANIR. Kullanıcı bu noktaya BEYAZ olarak oynamayı dener; RuleEngine
 *     reddeder, board DEĞİŞMEZ. → `kind:'ko_reject'`.
 *
 *   - `steps[1]` ("ko tehdidi ve geri alma" / ko_retake): An 1'in yakalama
 *     hamlesi GERÇEKTEN yeniden oynanarak başlar (yukarıdaki kök neden
 *     notuna bkz.) — `steps[1].board`'un authored statik seed'i bu GERÇEK
 *     sonuçla TAM eşleştiği build-time doğrulanır (iki curriculum adımı aynı
 *     fiziksel pozisyonu farklı anlatıyor olamaz). Curriculum'un kendi
 *     `moves` dizisi ÜÇ hamle taşır: beyaz tehdit (`moves[0]`), siyah yanıt
 *     (`moves[1]`), beyaz geri alma (`moves[2]`). İlk ikisi OYNANMADAN ÖNCE
 *     ko noktasının GERÇEKTEN yasak olduğu, oynandıktan SONRA GERÇEKTEN
 *     serbest kaldığı (hard-code değil — `applyMove` HER hamlede `koPoint`'i
 *     sıfırdan yeniden hesaplar, bu yüzden araya giren HERHANGİ bir hamle
 *     eski ko kısıtını doğal olarak temizler) build-time KANITLANIR.
 *     Kullanıcı serbest kaldıktan SONRA ko noktasına BEYAZ olarak oynar;
 *     RuleEngine kabul eder, curriculum'un authored `capture` alanıyla TAM
 *     eşleşen bir yakalama gerçekleşir. → `kind:'ko_retake'`.
 *
 * Sahnenin pedagojik akışı ("kural → hemen geri alma dene → reddedilmeyi gör
 * → tehdit+yanıt izle → serbest kalmayı gör → geri al") bu GERÇEK ayrımla
 * birebir örtüşür — iki an FARKLI beklenen sonuç taşır, ikisi de tek bir
 * kalıba ZORLANMAZ (bkz. scenes/scene09KoRule.js).
 *
 * KAVRAM: scene-seviyesi concept `'ko'` — `core/conceptMap.js`'in kendi
 * dosya başı yorumu bunu "ileride" olarak öngörmüş olsa da, bu görevde
 * Sahne #8/`forbidden_move` İLE AYNI bilinçli desen izlenir: `conceptMap.js`'e
 * KASITLI olarak EKLENMEZ — Teacher Studio Diagnostics bunu bilinen-olmayan
 * concept olarak raporlar (bilinçli, gizlenmeyen boşluk).
 */
import { CAM, CURRICULUM } from '../core/curriculum.js?v=2026-08-31.1';
import { BoardState } from '../core/boardState.js?v=2026-08-31.1';
import { isValidMove, applyMove } from '../core/ruleEngine.js?v=2026-08-31.1';

const LESSON_ID = 'l5';
const BOARD_SIZE = 9;
/** l5'in bu sahnede kullanılan scene-seviyesi kavramı — bkz. dosya başı
    "KAVRAM" notu. `core/conceptMap.js`'e KASITLI eklenmedi. */
export const CONCEPT = 'ko';
/** Kullanıcıya görünen 1./2. adımların sıfır-tabanlı curriculum index'leri
    (bkz. dosya başı keşif notu — l5.steps[0..1]; repo üzerinden bağımsız
    doğrulandı, l5.steps.length === 4). */
export const MOMENT_STEP_INDICES = [0, 1];
export const MOMENT_COUNT = MOMENT_STEP_INDICES.length; // 2

export const MOMENT_KINDS = Object.freeze({
  REJECT: 'ko_reject',
  RETAKE: 'ko_retake',
});

/** Kullanıcının her iki anda da denediği renk — görev talimatı Bölüm 1:
    "Öğrenci beyazla bu noktaya hemen oynamayı denesin"; Bölüm 2 madde 5:
    "Beyaz ko taşını geri alır". Diğer sahnelerin "kullanıcı her zaman
    siyah oynar" geleneğinden BİLİNÇLİ bir sapmadır (bkz. görev talimatı) —
    ko kuralının konusu bizzat BEYAZIN geri alma denemesidir. */
export const KO_ATTEMPT_COLOR = 'white';

function getLesson() {
  const lesson = CURRICULUM.flatMap(chapter => chapter.lessons).find(l => l.id === LESSON_ID);
  if (!lesson) throw new Error(`koRulePolicy: '${LESSON_ID}' dersi curriculum'da bulunamadı`);
  return lesson;
}

/** Board seed'ini güvenli biçimde normalize eder — geçersiz veri (bilinmeyen
    renk, geçersiz koordinat, duplicate koordinat) SESSİZCE yutulmaz, AÇIK
    bir Error fırlatılır (bkz. scenes/illegalMovePolicy.js/capturePracticePolicy.js
    AYNI desen). */
export function normalizeBoardSeed(rawSeed) {
  const seed = Array.isArray(rawSeed) ? rawSeed : [];
  const seen = new Set();
  const normalized = [];
  for (const s of seed) {
    if (!s || (s.color !== 'B' && s.color !== 'W')) {
      throw new Error(`koRulePolicy: geçersiz taş rengi: ${JSON.stringify(s)}`);
    }
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) {
      throw new Error(`koRulePolicy: geçersiz koordinat: ${JSON.stringify(s)}`);
    }
    const key = `${s.x},${s.y}`;
    if (seen.has(key)) {
      throw new Error(`koRulePolicy: duplicate board noktası: (${s.x},${s.y})`);
    }
    seen.add(key);
    normalized.push({ color: s.color, x: s.x, y: s.y });
  }
  return normalized;
}

/** @param {{x:number,y:number}|null} koPoint — GERÇEK oyun geçmişinden gelen
    ko bayrağı (bkz. dosya başı "KÖK NEDEN NOTU") — statik bir taş
    listesinden asla türetilemez, bu yüzden yalnız açıkça verildiğinde
    uygulanır. */
function seedBoardState(boardSeed, size = BOARD_SIZE, koPoint = null) {
  const bs = new BoardState(size);
  for (const stone of boardSeed) {
    bs.placeStone(stone.x, stone.y, stone.color === 'B' ? 'black' : 'white');
  }
  bs.koPoint = koPoint;
  return bs;
}

/** GERÇEK bir BoardState'in taş listesini `normalizeBoardSeed` ile AYNI
    `{color,x,y}` biçimine çevirir — bir anın kurulum-sonrası GERÇEK durumunu
    saf bir seed olarak taşıyabilmek için (bkz. `evaluateKoAttempt` — HER
    çağrıda bu seed'den TAZE bir BoardState kurar, hiçbir paylaşılan/mutable
    state TUTULMAZ). */
function flattenBoardState(bs) {
  return bs.stones.map(s => ({ color: s.color === 'black' ? 'B' : 'W', x: s.x, y: s.y }));
}

function cameraPresetName(cameraRef) {
  if (!cameraRef) return null;
  const entry = Object.entries(CAM).find(([, val]) => val === cameraRef);
  return entry ? entry[0] : null;
}

/** Bir scripted hamle dizisini (`step.moves` biçiminde) verilen BoardState
    üzerinden SIRAYLA, GERÇEKTEN `core/ruleEngine.js` ile oynatır — hiçbir
    hamle "zaten yasaldır" varsayılmaz, HER biri `isValidMove` ile kontrol
    edilir (yasal değilse AÇIK bir Error). `move.capture` authored alanı
    varsa GERÇEK `applyMove` sonucuyla TAM eşleştiği de doğrulanır (bkz.
    scenes/illegalMovePolicy.js `normalizeLegalCaptureMoment` AYNI disiplin).
    Verilen `bs`'i MUTATE ETMEZ — zincirin SON durumunu (koPoint DAHİL,
    GERÇEK `applyMove` sonucu) ve her hamlenin gerçek sonucunu döner.
 * @returns {{state: BoardState, played: Array<{row:number,col:number,color:string,captured:Array<{row,col}>}>}}
 */
function playScriptedMoves(bs, moves, stepIndex) {
  let state = bs;
  const played = [];
  for (const mv of moves) {
    if (mv.color !== 'B' && mv.color !== 'W') {
      throw new Error(`koRulePolicy: steps[${stepIndex}] scripted hamle geçersiz renk taşıyor: ${JSON.stringify(mv)}`);
    }
    const color = mv.color === 'B' ? 'black' : 'white';
    const check = isValidMove(state, mv.x, mv.y, color);
    if (!check.valid) {
      throw new Error(`koRulePolicy: steps[${stepIndex}] scripted hamle (${mv.x},${mv.y},${mv.color}) RuleEngine'e göre yasal DEĞİL: ${check.reason}`);
    }
    const { newState, captured } = applyMove(state, mv.x, mv.y, color);
    if (Array.isArray(mv.capture)) {
      const capturedKeys = new Set(captured.map(c => `${c.x},${c.y}`));
      const expectedKeys = new Set(mv.capture.map(c => `${c.x},${c.y}`));
      const matches = captured.length === mv.capture.length && [...expectedKeys].every(k => capturedKeys.has(k));
      if (!matches) {
        throw new Error(`koRulePolicy: steps[${stepIndex}] scripted hamle (${mv.x},${mv.y}) GERÇEK capture sonucu curriculum'un authored 'capture' alanıyla eşleşmiyor`);
      }
    }
    played.push({ row: mv.y, col: mv.x, color, captured: captured.map(c => ({ row: c.y, col: c.x })) });
    state = newState;
  }
  return { state, played };
}

/** `steps[0]`'ın authored yakalama hamlesini GERÇEKTEN oynatıp SONUÇ
    BoardState'ini (koPoint DAHİL — bkz. dosya başı "KÖK NEDEN NOTU") döner.
    Hem `normalizeRejectMoment` (An 1'in KENDİ senaryosu) hem
    `normalizeRetakeMoment` (An 2'nin BAŞLANGIÇ durumu — "ko hâlâ yasak,
    devam ediyoruz" önkoşulu) bunu TEK kaynaktan okur; koordinat/koPoint İKİ
    YERDE ayrı ayrı İCAT EDİLMEZ. */
// `export` — bkz. scenes/illegalMovePolicy.js `normalizeRejectedMoment` İLE
// AYNI gerekçe: edge-case testlerinin (yanlış renk, taş sayısı, ko
// önkoşulu ihlali) GERÇEK curriculum verisini DEĞİŞTİRMEDEN, sentetik
// `step` nesneleriyle bu fonksiyonu ve `normalizeRetakeMoment`'i DOĞRUDAN
// çağırabilmesi için (bkz. tests/koRulePolicy.test.js "EDGE" bloğu).
export function computeCaptureOrigin(rejectStep, curriculumStepIndex) {
  const board = normalizeBoardSeed(rejectStep.board);
  const size = rejectStep.size ?? BOARD_SIZE;
  const rawMoves = Array.isArray(rejectStep.moves) ? rejectStep.moves : [];
  const captureMove = rawMoves.find(m => m.color === 'B');
  if (!captureMove) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] siyah yakalama hamlesi ('moves') bulunamadı — 'ko_reject' anı bunu gerektirir`);
  }
  const bs0 = seedBoardState(board, size);
  const { state: afterCapture, played } = playScriptedMoves(bs0, [captureMove], curriculumStepIndex);
  const capturedPoints = played[0].captured;
  if (capturedPoints.length !== 1) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] yakalama hamlesi TAM OLARAK bir taş yakalamalı (ko önkoşulu), yakalanan: ${capturedPoints.length}`);
  }
  const koPoint = capturedPoints[0];
  if (!afterCapture.koPoint || afterCapture.koPoint.x !== koPoint.col || afterCapture.koPoint.y !== koPoint.row) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] yakalama sonrası RuleEngine GERÇEK bir ko noktası üretmedi — curriculum verisi ko senaryosunu karşılamıyor`);
  }
  return {
    board,
    size,
    scriptedMoves: [{ row: captureMove.y, col: captureMove.x, color: 'black' }],
    koPoint,
    afterCaptureState: afterCapture, // GERÇEK BoardState (koPoint DAHİL) — An 2'nin başlangıç bs0'ı olarak yeniden kullanılır
  };
}

/** `steps[0]` — "hemen geri alma yasağı". `origin`, `computeCaptureOrigin`'in
    (aynı `step` üzerinden) sonucu — bkz. dosya başı not. */
export function normalizeRejectMoment(origin, step, curriculumStepIndex, momentIndex) {
  // Ko noktasına BEYAZ oynamanın GERÇEKTEN KO reddiyle sonuçlandığı — build-time kanıt.
  const attempt = isValidMove(origin.afterCaptureState, origin.koPoint.col, origin.koPoint.row, KO_ATTEMPT_COLOR);
  if (attempt.valid || attempt.reason !== 'KO') {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] ko noktasına beyaz hamlesi beklenen KO reddiyle sonuçlanmadı (bulunan: valid=${attempt.valid}, reason=${attempt.reason})`);
  }
  return {
    momentIndex,
    curriculumStepIndex,
    kind: MOMENT_KINDS.REJECT,
    board: origin.board,                     // yakalama-ÖNCESİ ham seed — sahne bunu kurar, SONRA scriptedMoves'i oynatır
    scriptedMoves: origin.scriptedMoves,
    boardAfterSetup: flattenBoardState(origin.afterCaptureState),
    // An 1'in değerlendirme anında ko kısıtı HÂLÂ AKTİF (bkz. `evaluateKoAttempt`
    // — bu, statik taş listesinden asla geri türetilemeyen tarihçe bilgisidir).
    evaluationKoPoint: { x: origin.koPoint.col, y: origin.koPoint.row },
    size: origin.size,
    cameraPreset: cameraPresetName(step.camera),
    promptText: step.text,
    koPoint: origin.koPoint,                 // {row,col} — GERÇEK yakalanan noktadan türedi, hard-code DEĞİL
    assessmentConcept: CONCEPT,
  };
}

/** `steps[1]` — "ko tehdidi ve geri alma". `origin`, An 1'den (`steps[0]`)
    gelen GERÇEK yakalama-sonucu — bkz. dosya başı "KÖK NEDEN NOTU": An 2'nin
    başlangıç durumu `steps[1].board`'u taş-taş yerleştirerek DEĞİL, An 1'in
    yakalama hamlesini GERÇEKTEN yeniden oynatarak kurulur (koPoint tarihçe
    bilgisidir). `steps[1].board`'un authored statik seed'i bu GERÇEK
    sonuçla TAM eşleştiği ayrıca doğrulanır — iki curriculum adımı aynı
    fiziksel pozisyonu farklı anlatıyor olamaz. */
export function normalizeRetakeMoment(origin, step, curriculumStepIndex, momentIndex) {
  const authoredBoard = normalizeBoardSeed(step.board);
  const size = step.size ?? BOARD_SIZE;
  const rawMoves = Array.isArray(step.moves) ? step.moves : [];
  if (rawMoves.length < 3) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] en az üç scripted hamle bekleniyor (tehdit, yanıt, geri alma), bulunan: ${rawMoves.length}`);
  }
  const [threatMove, responseMove, retakeMove] = rawMoves;
  if (threatMove.color !== 'W') throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] ilk scripted hamle BEYAZ (tehdit) olmalı`);
  if (responseMove.color !== 'B') throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] ikinci scripted hamle SİYAH (yanıt) olmalı`);
  if (retakeMove.color !== 'W') throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] üçüncü scripted hamle BEYAZ (geri alma) olmalı`);

  // Ko noktası — retake hamlesinin GERÇEK hedef koordinatından türer (hard-code DEĞİL).
  const koPoint = { row: retakeMove.y, col: retakeMove.x };
  if (koPoint.row !== origin.koPoint.row || koPoint.col !== origin.koPoint.col) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] geri alma hedefi (${retakeMove.x},${retakeMove.y}) An 1'in ko noktasıyla (${origin.koPoint.col},${origin.koPoint.row}) UYUŞMUYOR`);
  }
  // steps[1].board'un authored statik seed'i An 1'in GERÇEK yakalama-sonrası
  // durumuyla (taş dizilimi) TAM eşleşmeli (bkz. dosya başı not).
  const expectedSeed = flattenBoardState(origin.afterCaptureState);
  if (boardSignature(authoredBoard) !== boardSignature(expectedSeed)) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] board seed'i An 1'in yakalama-sonrası GERÇEK durumuyla eşleşmiyor`);
  }

  // Gerçek OYUN GEÇMİŞİYLE (ko noktası DAHİL) başlangıç durumu — An 1'in
  // GERÇEK sonuç-BoardState'i yeniden kullanılır (bkz. dosya başı not).
  const bs0 = origin.afterCaptureState;
  const beforeAttempt = isValidMove(bs0, koPoint.col, koPoint.row, KO_ATTEMPT_COLOR);
  if (beforeAttempt.valid) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] ko noktası başlangıçta yasak DEĞİL — curriculum verisi ko önkoşulunu karşılamıyor`);
  }

  const { state: afterThreatResponse } = playScriptedMoves(bs0, [threatMove, responseMove], curriculumStepIndex);
  // Tehdit+yanıttan SONRA ko noktası GERÇEKTEN serbest mi — hard-code DEĞİL,
  // RuleEngine'in kendi koPoint yeniden-hesaplamasından (applyMove HER
  // hamlede koPoint'i sıfırdan belirler) doğal olarak gelir.
  const freedAttempt = isValidMove(afterThreatResponse, koPoint.col, koPoint.row, KO_ATTEMPT_COLOR);
  if (!freedAttempt.valid) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] tehdit+yanıt sonrası ko noktası HÂLÂ yasak (${freedAttempt.reason}) — curriculum verisi 'serbest kalma' önkoşulunu karşılamıyor`);
  }

  const { played } = playScriptedMoves(afterThreatResponse, [retakeMove], curriculumStepIndex);
  const capturedCount = played[0].captured.length;
  if (capturedCount < 1) {
    throw new Error(`koRulePolicy: steps[${curriculumStepIndex}] geri alma hamlesi hiçbir taş yakalamıyor — ko önkoşuluyla çelişiyor`);
  }

  return {
    momentIndex,
    curriculumStepIndex,
    kind: MOMENT_KINDS.RETAKE,
    board: authoredBoard,                              // yakalama-SONRASI görsel seed (yalnız içerik/açıklama amaçlı)
    // Canlı sahne bu anı GERÇEK oyun geçmişiyle kurar: ÖNCE An 1'in
    // orijinal (yakalama-ÖNCESİ) board'u + yakalama hamlesi, SONRA bu anın
    // KENDİ tehdit+yanıt dizisi (bkz. dosya başı "KÖK NEDEN NOTU").
    originBoard: origin.board,
    originCaptureMove: origin.scriptedMoves[0],
    scriptedThreatMoves: [
      { row: threatMove.y, col: threatMove.x, color: 'white' },
      { row: responseMove.y, col: responseMove.x, color: 'black' },
    ],
    boardAfterSetup: flattenBoardState(afterThreatResponse),
    // An 2'nin değerlendirme anında ko kısıtı ZATEN kalktı (tehdit+yanıt
    // oynandı) — taze yeniden kurulan board'da koPoint `null` bırakılır.
    evaluationKoPoint: null,
    size,
    cameraPreset: cameraPresetName(step.camera),
    promptText: step.text,
    koPoint,
    expectedCapturedCount: capturedCount,
    assessmentConcept: CONCEPT,
  };
}

/** İki anı curriculum'daki GERÇEK sırayla, normalize edilmiş biçimde döner. */
export function getKoRuleMoments() {
  const lesson = getLesson();
  const rejectStep = lesson.steps[MOMENT_STEP_INDICES[0]];
  const retakeStep = lesson.steps[MOMENT_STEP_INDICES[1]];
  const origin = computeCaptureOrigin(rejectStep, MOMENT_STEP_INDICES[0]);
  const reject = normalizeRejectMoment(origin, rejectStep, MOMENT_STEP_INDICES[0], 0);
  const retake = normalizeRetakeMoment(origin, retakeStep, MOMENT_STEP_INDICES[1], 1);
  return [reject, retake];
}

/** `{row,col}`'dan deterministik bir string anahtar üretir (bkz. scenes/
    illegalMovePolicy.js `pointKey` AYNI amaç). */
export function pointKey(point) {
  return `${point.row},${point.col}`;
}

/** Board seed'inin (taş listesinin) deterministik, sıradan bağımsız imzası —
    "hamle denemesinden ÖNCE/SONRA board GERÇEKTEN değişmedi" kanıtı için
    (bkz. scenes/illegalMovePolicy.js `boardSignature` AYNI amaç). */
export function boardSignature(boardSeed) {
  return boardSeed.map(s => `${s.color}${s.x},${s.y}`).sort().join('|');
}

/**
 * `point`teki hamleyi bu anın GERÇEK kurulum-sonrası board'u
 * (`moment.boardAfterSetup` + `moment.evaluationKoPoint`) üzerinde
 * GERÇEKTEN simüle eder (core/ruleEngine.js isValidMove/applyMove, HER
 * çağrıda TAZE bir BoardState — hiçbir paylaşılan/mutable state TUTULMAZ)
 * — koordinat KARŞILAŞTIRMASI DEĞİL. Deneme her zaman `KO_ATTEMPT_COLOR`
 * (beyaz) ile değerlendirilir.
 * @param {object} moment
 * @param {{row:number,col:number}} point
 * @returns {{legal:boolean, reason:string|null, captured:Array<{row:number,col:number}>, capturedCount:number, isTarget:boolean}}
 */
export function evaluateKoAttempt(moment, point) {
  const bs = seedBoardState(moment.boardAfterSetup, moment.size, moment.evaluationKoPoint);
  const check = isValidMove(bs, point.col, point.row, KO_ATTEMPT_COLOR);
  const isTarget = moment.koPoint.row === point.row && moment.koPoint.col === point.col;
  if (!check.valid) {
    return { legal: false, reason: check.reason, captured: [], capturedCount: 0, isTarget };
  }
  const { captured: capturedRaw } = applyMove(bs, point.col, point.row, KO_ATTEMPT_COLOR);
  const captured = capturedRaw.map(c => ({ row: c.y, col: c.x }));
  return { legal: true, reason: null, captured, capturedCount: captured.length, isTarget };
}

/** Bu anın "başarı" koşulu — REJECT anında hedefin GERÇEKTEN reddedilmesi,
    RETAKE anında hedefin GERÇEKTEN kabul edilip beklenen sayıda taş
    yakalaması. `scene09KoRule.js`'in TEK doğruluk kaynağı olarak kullanması
    beklenir (sahne modülü kendi başarı mantığını İCAT ETMEZ). */
export function isSuccessfulAttempt(moment, attempt) {
  if (!attempt.isTarget) return false;
  if (moment.kind === MOMENT_KINDS.REJECT) return !attempt.legal && attempt.reason === 'KO';
  return attempt.legal && attempt.capturedCount === moment.expectedCapturedCount;
}

/** RuleEngine'in HAM (İngilizce) `reason` kodundan kullanıcıya dönük KISA
    Türkçe açıklama üretir — bkz. scenes/illegalMovePolicy.js
    `REASON_LABELS_TR` İLE AYNI ilke, ama BAĞIMSIZ bir kopya (o dosyaya bu
    görev kapsamında dokunulmuyor). `KO` metni görev talimatında BİREBİR
    istenen ifadedir. */
const REASON_LABELS_TR = {
  KO: 'Ko kuralı — bu hamle tahtayı önceki pozisyona döndürür; hemen oynanamaz.',
  OCCUPIED: 'Bu kesişimde zaten bir taş var.',
  OUT_OF_BOUNDS: 'Bu nokta tahtanın dışında.',
  SUICIDE: 'Bu nokta öz-yakalama yasağına takılıyor — taş konulsa hiç nefesi kalmıyor ve hiçbir rakip taş yakalanmıyor.',
};
export function reasonLabelTr(reason) {
  return REASON_LABELS_TR[reason] ?? `Bilinmeyen kural nedeni: ${reason}`;
}

/** `kind` geçerli bilinen bir değer mi — Diagnostics'in "kind geçerli"
    kontrolü bunu kullanır (bkz. scenes/illegalMovePolicy.js
    `isKnownMomentKind` AYNI amaç). */
export function isKnownMomentKind(kind) {
  return kind === MOMENT_KINDS.REJECT || kind === MOMENT_KINDS.RETAKE;
}
