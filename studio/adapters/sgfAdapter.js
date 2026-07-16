import { isExportableSgfProperty } from '../model/moveTree.js';

const APP_TAG = 'AgStudio:1.1';

const POINT_ANNOTATION_SGF_KEY = Object.freeze({
  triangle: 'TR',
  square: 'SQ',
  circle: 'CR',
  cross: 'MA',
  selected: 'SL',
});

// SGF koordinatı: düz harf çifti, x=sütun y=satır, ikisi de a=0..
// Board UI'daki "I harfi atlanır" kuralı (G,H,J,...) burada geçerli değil —
// SGF iki harfli ham indeks kullanır (bkz. S10A raporu §Coordinate mapping).
function sgfCoord(x, y) {
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

function checkPoint(x, y, size, context) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) {
    throw new Error(`SGF_EXPORT_OUT_OF_BOUNDS: ${context} (${x},${y}) tahta dışı (size=${size})`);
  }
}

// SGF Text/SimpleText escape: ters eğik çizgi önce, sonra kapanan köşeli parantez.
function escapeSgfText(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function setProp(props, key, value) {
  if (props.has(key)) {
    props.get(key).push(value);
  } else {
    props.set(key, [value]);
  }
}

/**
 * node.rawProperties'ten export edilebilir anahtarları props'a ekler.
 * isExportableSgfProperty(key) false dönen (internal/_ önekli/tehlikeli/
 * geçersiz format) anahtarlar sessizce atlanır — bu zaten test edilmiş bir
 * sözleşme (tests/studio-text-tree.test.js "D0 sgf" bloğu).
 *
 * Exporter'ın kendi ürettiği bir anahtarla çakışma varsa (props.has(key)),
 * rawProperties değeri YAZILMAZ — exporter'ın zorunlu/annotation/move
 * property'leri önceliklidir. Çakışma warnings'e açıkça kaydedilir.
 */
function appendRawProperties(props, rawProperties, warnings, nodeLabel) {
  if (!rawProperties || typeof rawProperties !== 'object') return;
  for (const key of Object.keys(rawProperties)) {
    if (!isExportableSgfProperty(key)) continue;
    const values = rawProperties[key];
    if (!Array.isArray(values) || values.length === 0) continue;
    if (props.has(key)) {
      warnings.push(`${nodeLabel}: rawProperties.${key} yok sayıldı (exporter tarafından zaten üretiliyor)`);
      continue;
    }
    props.set(key, values.map(escapeSgfText));
  }
}

function appendAnnotations(props, annotations, size, warnings, nodeLabel) {
  for (const ann of Array.isArray(annotations) ? annotations : []) {
    if (ann.type === 'region') {
      warnings.push(`${nodeLabel}: region annotation (id=${ann.id}) SGF'e yazılamadı — atlandı`);
      continue;
    }

    const pointKey = POINT_ANNOTATION_SGF_KEY[ann.type];
    if (pointKey) {
      checkPoint(ann.point?.x, ann.point?.y, size, `${nodeLabel} annotation ${ann.type} (id=${ann.id})`);
      setProp(props, pointKey, sgfCoord(ann.point.x, ann.point.y));
      continue;
    }

    if (ann.type === 'label') {
      checkPoint(ann.point?.x, ann.point?.y, size, `${nodeLabel} annotation label (id=${ann.id})`);
      setProp(props, 'LB', `${sgfCoord(ann.point.x, ann.point.y)}:${escapeSgfText(ann.text)}`);
      continue;
    }

    if (ann.type === 'arrow' || ann.type === 'line') {
      checkPoint(ann.from?.x, ann.from?.y, size, `${nodeLabel} annotation ${ann.type} from (id=${ann.id})`);
      checkPoint(ann.to?.x, ann.to?.y, size, `${nodeLabel} annotation ${ann.type} to (id=${ann.id})`);
      const key = ann.type === 'arrow' ? 'AR' : 'LN';
      setProp(props, key, `${sgfCoord(ann.from.x, ann.from.y)}:${sgfCoord(ann.to.x, ann.to.y)}`);
      continue;
    }

    warnings.push(`${nodeLabel}: bilinmeyen annotation tipi '${ann.type}' (id=${ann.id}) atlandı`);
  }
}

/**
 * Tek düğüm için SGF property haritasını kurar (sıra: header → move →
 * setup(root) → annotation → comment → filtrelenmiş rawProperties).
 */
function buildNodeProperties(node, { isRoot, size, doc, warnings }) {
  const props = new Map();
  const nodeLabel = isRoot ? 'root' : node.id;

  if (isRoot) {
    props.set('GM', ['1']);
    props.set('FF', ['4']);
    props.set('CA', ['UTF-8']);
    props.set('AP', [escapeSgfText(APP_TAG)]);
    props.set('SZ', [String(size)]);
    if (doc.title) props.set('GN', [escapeSgfText(doc.title)]);
    if (doc.summary) props.set('GC', [escapeSgfText(doc.summary)]);
  }

  if (!isRoot && node.move) {
    const move = node.move;
    const key = move.color === 'white' ? 'W' : 'B';
    if (move.pass) {
      props.set(key, ['']);
    } else {
      checkPoint(move.x, move.y, size, `node ${node.id} move`);
      props.set(key, [sgfCoord(move.x, move.y)]);
    }
    // move.capture[] kasıtlı olarak yazılmaz — türetilmiş veri, standart
    // SGF okuyucular hamleyi replay ederek kendi hesaplar.
  }

  if (isRoot) {
    const stones = node.formation?.stones ?? [];
    const blacks = [];
    const whites = [];
    for (const stone of stones) {
      checkPoint(stone.x, stone.y, size, 'root formation stone');
      (stone.color === 'white' ? whites : blacks).push(sgfCoord(stone.x, stone.y));
    }
    if (blacks.length) props.set('AB', blacks);
    if (whites.length) props.set('AW', whites);
    // Sıra kararı: turn === 'white' ise PL[W] yazılır. turn === 'black'
    // (varsayılan) olduğunda PL[B] YAZILMAZ — gerçek formation dosyalarında
    // (formations/b1-temel-kurallar/l5-ko-kurali/1. adım.sgf) da bu convention
    // kullanılıyor: siyah başlangıcı örtük, PL yalnız sapma olduğunda yazılır.
    if (node.formation?.turn === 'white') props.set('PL', ['W']);
  }

  appendAnnotations(props, node.annotations, size, warnings, nodeLabel);

  if (node.comment) props.set('C', [escapeSgfText(node.comment)]);

  appendRawProperties(props, node.rawProperties, warnings, nodeLabel);

  return props;
}

function serializeNodeLine(props) {
  let out = ';';
  for (const [key, values] of props) {
    out += key + values.map(v => `[${v}]`).join('');
  }
  return out;
}

/**
 * Düz (dallanmasız) diziyi tek node zincirine, dallanma noktalarında ise
 * her child'ı kendi (;...) bloğuna yazar. preferredChildId önce yazılır.
 */
function serializeSequence(startNode, isRoot, size, doc, warnings) {
  let out = '';
  let node = startNode;
  let first = true;

  while (node) {
    out += serializeNodeLine(buildNodeProperties(node, { isRoot: isRoot && first, size, doc, warnings }));
    first = false;

    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length === 0) {
      node = null;
    } else if (children.length === 1) {
      node = children[0];
    } else {
      const preferred = children.find(c => c.id === node.preferredChildId) ?? children[0];
      const rest = children.filter(c => c !== preferred);
      for (const child of [preferred, ...rest]) {
        out += `(${serializeSequence(child, false, size, doc, warnings)})`;
      }
      node = null;
    }
  }

  return out;
}

/**
 * Studio document → SGF metni.
 *
 * @param {object} doc — studioDocument (moveTree + board.size + title/summary)
 * @param {object} [options]
 * @returns {{ sgf: string, warnings: string[] }}
 */
export function formatSGF(doc, options = {}) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('SGF_EXPORT_INVALID_DOCUMENT');
  }
  const root = doc.moveTree?.root;
  if (!root) {
    throw new Error('SGF_EXPORT_NO_MOVETREE');
  }

  const warnings = [];
  const size = Number.isInteger(doc.board?.size) ? doc.board.size : 9;

  const body = serializeSequence(root, true, size, doc, warnings);
  const sgf = `(${body})`;

  return { sgf, warnings };
}
