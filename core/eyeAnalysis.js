/**
 * core/eyeAnalysis.js
 *
 * Saf göz (eye) analiz yardımcıları. DOM, render, animasyon yok.
 * core/boardState.js + core/ruleEngine.js üzerine kurulu — hiçbir
 * hesaplama statik koordinata bakıp "doğru görünüyor" demez, gerçek
 * flood-fill + grup + çapraz kontrolü uygular.
 *
 * l7 — "Canlı Gruplar (İki Göz)" müfredat içeriğini (core/curriculum.js)
 * ve regresyon testlerini (tests/twoEyesCurriculum.test.js) doğrulamak
 * için yazıldı — bkz. görev talimatı Bölüm 3/6/8.
 *
 * Kapsam bilerek DAR tutuldu: yalnız TEK NOKTALIK göz adaylarını ve
 * "bir grubun toprağı/gözü olarak nitelenen boş bölgeler" düzeyini
 * kapsar. Büyük-göz şekilleri (bkz. "eye shape" teorisi, örn. "kare
 * dört", "bükülü dört") burada SINIFLANDIRILMAZ — yalnız bölge
 * boyutu ve sınır rengi/grup bilgisi döner, çağıran kod (curriculum
 * yazarı veya test) kendi iddiasını buna göre kurar.
 */

/**
 * (x,y) noktasından başlayarak BAĞLI boş bölgeyi flood-fill ile bulur.
 * Bölgeyi çevreleyen (4-komşu) taş noktalarını da ayrıca toplar.
 *
 * @param {import('./boardState.js').BoardState} board
 * @param {number} x
 * @param {number} y
 * @returns {{ points: {x:number,y:number}[], borderStoneKeys: Set<string> }}
 */
export function findEmptyRegion(board, x, y) {
  const seen = new Set();
  const stack = [{ x, y }];
  const points = [];
  const borderStoneKeys = new Set();

  while (stack.length) {
    const cur = stack.pop();
    const key = `${cur.x},${cur.y}`;
    if (seen.has(key)) continue;
    if (!board.isInBounds(cur.x, cur.y)) continue;
    if (!board.isEmpty(cur.x, cur.y)) continue;
    seen.add(key);
    points.push({ x: cur.x, y: cur.y });
    board.neighbors(cur.x, cur.y).forEach(n => {
      if (board.isEmpty(n.x, n.y)) {
        if (!seen.has(`${n.x},${n.y}`)) stack.push(n);
      } else {
        borderStoneKeys.add(`${n.x},${n.y}`);
      }
    });
  }

  return { points, borderStoneKeys };
}

/**
 * Bir boş bölgeyi çevreleyen taşların rengini/grup sayısını hesaplar.
 * groupCount === 1 VE colors.size === 1 ise bölge TEK bir renk/grup
 * tarafından tamamen çevrilidir — yani o grubun kendi iç boşluğudur.
 *
 * @param {import('./boardState.js').BoardState} board
 * @param {{ points: {x:number,y:number}[], borderStoneKeys: Set<string> }} region
 * @returns {{ colors: Set<'black'|'white'>, groupCount: number, groupIds: Set<string> }}
 */
export function classifyRegion(board, region) {
  const colors = new Set();
  const groupIds = new Set();
  const seenStoneGroup = new Map();

  for (const key of region.borderStoneKeys) {
    const [sx, sy] = key.split(',').map(Number);
    colors.add(board.colorAt(sx, sy));
    if (!seenStoneGroup.has(key)) {
      const group = getGroupViaBoard(board, sx, sy);
      const gid = [...group].sort().join('|');
      groupIds.add(gid);
      for (const gk of group) seenStoneGroup.set(gk, gid);
    }
  }

  return { colors, groupCount: groupIds.size, groupIds };
}

/**
 * getGroup'u yerel olarak yeniden uygular — core/ruleEngine.js'e döngüsel
 * import olmadan aynı flood-fill mantığı (renk bazlı, 4-komşu).
 * @private
 */
function getGroupViaBoard(board, x, y) {
  const color = board.colorAt(x, y);
  const group = new Set();
  if (!color) return group;
  const queue = [{ x, y }];
  while (queue.length) {
    const cur = queue.pop();
    const key = `${cur.x},${cur.y}`;
    if (group.has(key)) continue;
    if (board.colorAt(cur.x, cur.y) !== color) continue;
    group.add(key);
    board.neighbors(cur.x, cur.y).forEach(n => {
      if (!group.has(`${n.x},${n.y}`)) queue.push(n);
    });
  }
  return group;
}

/**
 * TEK NOKTALIK bir göz adayının çapraz kontrol durumunu hesaplar.
 * Standart kural: iç noktada 4 çaprazdan en az 3'ü, kenarda 2 çaprazın
 * ikisi de, köşede tek çaprazın kendisi aynı renk tarafından
 * kontrol edilmelidir — yoksa göz SAHTEDİR.
 *
 * @param {import('./boardState.js').BoardState} board
 * @param {number} x
 * @param {number} y
 * @param {'black'|'white'} color
 * @returns {{ onBoardCount: number, friendly: number, isTrue: boolean }}
 */
export function diagonalControl(board, x, y, color) {
  const diagonals = [
    { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 },
    { x: x - 1, y: y + 1 }, { x: x + 1, y: y + 1 },
  ].filter(d => board.isInBounds(d.x, d.y));

  const friendly = diagonals.filter(d => board.colorAt(d.x, d.y) === color).length;
  const needed = diagonals.length === 4 ? 3 : diagonals.length; // iç:3/4 · kenar:2/2 · köşe:1/1

  return { onBoardCount: diagonals.length, friendly, isTrue: friendly >= needed };
}

/**
 * (x,y) TEK NOKTALIK bir göz adayı mı — ve GERÇEK mi SAHTE mi?
 * Adım adım:
 *  1. Nokta boş olmalı.
 *  2. Bağlı boş bölge TAM 1 nokta olmalı (çok-noktalı bölgeler için
 *     bkz. findEmptyRegion + classifyRegion — bu fonksiyon onları
 *     kapsamaz, `null` döner).
 *  3. Bölge TEK bir renk VE TEK bir bağlı grup tarafından çevrili olmalı.
 *  4. Çapraz kontrolü (diagonalControl) gerçek/sahte ayrımını verir.
 *
 * @param {import('./boardState.js').BoardState} board
 * @param {number} x
 * @param {number} y
 * @returns {{ isEyeCandidate: boolean, isSinglePoint: boolean, color: ('black'|'white'|null), groupId: (string|null), isTrue: (boolean|null), diag: (object|null) } }
 */
export function classifySinglePointEye(board, x, y) {
  if (!board.isEmpty(x, y)) {
    return { isEyeCandidate: false, isSinglePoint: false, color: null, groupId: null, isTrue: null, diag: null };
  }
  const region = findEmptyRegion(board, x, y);
  if (region.points.length !== 1) {
    return { isEyeCandidate: false, isSinglePoint: false, color: null, groupId: null, isTrue: null, diag: null };
  }
  const cls = classifyRegion(board, region);
  if (cls.colors.size !== 1 || cls.groupCount !== 1) {
    return { isEyeCandidate: false, isSinglePoint: true, color: null, groupId: null, isTrue: null, diag: null };
  }
  const color = [...cls.colors][0];
  const groupId = [...cls.groupIds][0];
  const diag = diagonalControl(board, x, y, color);
  return { isEyeCandidate: true, isSinglePoint: true, color, groupId, isTrue: diag.isTrue, diag };
}

/**
 * Bir tahtadaki TÜM tek-noktalık, tek-grup-çevrili göz adaylarını
 * tarar ve `color` rengine ait olanları grup kimliğine göre gruplar.
 * "Bu grubun kaç gerçek gözü var?" sorusunu cevaplamak için kullanılır.
 *
 * Her nokta için hem `isTrue` (bkz. diagonalControl — TEK noktaya bakan,
 * komşu göz noktalarından habersiz KATI kontrol) hem `isTrueEffective`
 * (bkz. resolveGroupTrueEyes — "komşu-göz istisnası" uygulanmış GERÇEK
 * sonuç) döner. Curriculum/test kodu `isTrueEffective`'i kullanmalı;
 * `isTrue` yalnız hata ayıklama/raporlama için tutuluyor.
 *
 * @param {import('./boardState.js').BoardState} board
 * @param {'black'|'white'} color
 * @returns {Map<string, {x:number,y:number,isTrue:boolean,isTrueEffective:boolean,viaSiblingException:boolean}[]>} groupId -> eye noktaları
 */
export function scanSinglePointEyesByGroup(board, color) {
  const seen = new Set();
  const byGroup = new Map();

  for (let y = 0; y < board.size; y++) {
    for (let x = 0; x < board.size; x++) {
      const key = `${x},${y}`;
      if (seen.has(key) || !board.isEmpty(x, y)) continue;
      const region = findEmptyRegion(board, x, y);
      region.points.forEach(p => seen.add(`${p.x},${p.y}`));
      if (region.points.length !== 1) continue;

      const cls = classifySinglePointEye(board, x, y);
      if (!cls.isEyeCandidate || cls.color !== color) continue;

      if (!byGroup.has(cls.groupId)) byGroup.set(cls.groupId, []);
      byGroup.get(cls.groupId).push({ x, y, isTrue: cls.isTrue });
    }
  }

  // İkinci geçiş: her grup için komşu-göz istisnasını uygula.
  for (const [groupId, points] of byGroup) {
    const resolved = resolveGroupTrueEyes(board, points);
    for (const p of points) {
      const r = resolved.get(`${p.x},${p.y}`);
      p.isTrueEffective = r.isTrue;
      p.viaSiblingException = r.viaSiblingException;
    }
  }

  return byGroup;
}

/**
 * "Komşu-göz istisnası" (sibling-eye exception) — standart Go kuralı.
 *
 * diagonalControl() TEK bir noktaya bakar ve boş bir çaprazı HER ZAMAN
 * "kontrolsüz" sayar. Ama gerçek kuralda: bir çapraz nokta boşsa VE bu
 * nokta AYNI grubun kendi başka bir gerçek gözüyse, rakip o noktaya
 * ASLA giremez (kendi grubunun tek yaşam alanına dokunmadığı sürece
 * kendi gözünü doldurmak intihar olur) — dolayısıyla bu çapraz fiilen
 * "kontrollü" sayılmalıdır. Bu, köşe/kenardaki standart "bükülü iki
 * göz" (bent-two) yaşam şeklinin GENEL kuralıdır — belirli bir
 * koordinat için özel durum (whitelist) DEĞİLDİR; herhangi bir grubun
 * herhangi bir köşe/kenar çiftinde aynı şekilde uygulanır.
 *
 * Algoritma (iki geçiş, döngüsel referans olmadan):
 *  1. Her noktanın KATI (diagonalControl) sonucu zaten `points` içinde var.
 *  2. KATI olarak FALSE olan her nokta için: kontrolsüz sayılan çapraz
 *     noktaların TAMAMI ya dost taş ya da AYNI kümedeki (aynı grubun)
 *     KATI-TRUE bir kardeş göz ise → istisna uygulanır, nokta TRUE olur.
 *  3. Zincirleme (bir istisna noktasının kendisi başka bir noktanın
 *     istisnasına temel olması) KASITLI OLARAK desteklenmiyor — bu,
 *     yalnızca doğrudan komşu iki göz için standart olan basit/güvenli
 *     bir uygulamadır; daha karmaşık çok-adımlı zincirler için genel
 *     "eye shape" teorisi gerekir ve bu modülün kapsamı DIŞINDADIR
 *     (bkz. dosya başı not).
 *
 * @param {import('./boardState.js').BoardState} board
 * @param {{x:number,y:number,isTrue:boolean}[]} groupPoints — AYNI gruba ait, classifySinglePointEye ile üretilmiş KATI sonuçlar
 * @returns {Map<string, {x:number,y:number,isTrue:boolean,viaSiblingException:boolean}>}
 */
export function resolveGroupTrueEyes(board, groupPoints) {
  const byKey = new Map(groupPoints.map(p => [`${p.x},${p.y}`, p]));
  const result = new Map();

  for (const p of groupPoints) {
    if (p.isTrue) {
      result.set(`${p.x},${p.y}`, { x: p.x, y: p.y, isTrue: true, viaSiblingException: false });
      continue;
    }
    // KATI sonuç FALSE — hangi rengin sahibi olduğunu bul (grup rengi).
    const color = board.colorAt(
      board.neighbors(p.x, p.y).find(n => board.colorAt(n.x, n.y))?.x,
      board.neighbors(p.x, p.y).find(n => board.colorAt(n.x, n.y))?.y,
    );
    const diagonals = [
      { x: p.x - 1, y: p.y - 1 }, { x: p.x + 1, y: p.y - 1 },
      { x: p.x - 1, y: p.y + 1 }, { x: p.x + 1, y: p.y + 1 },
    ].filter(d => board.isInBounds(d.x, d.y));

    const allControlled = diagonals.every(d => {
      if (board.colorAt(d.x, d.y) === color) return true; // doğrudan dost taş
      const sibling = byKey.get(`${d.x},${d.y}`);
      return !!(sibling && sibling.isTrue); // AYNI grubun KATI-TRUE kardeş gözü
    });

    result.set(`${p.x},${p.y}`, { x: p.x, y: p.y, isTrue: allControlled, viaSiblingException: allControlled });
  }

  return result;
}
