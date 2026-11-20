/**
 * scripts/i18n/extract-strings.mjs
 *
 * Ders sayfasının (learning-scenes.html) modül graph'ındaki JS dosyalarından
 * ekranda görünebilecek Türkçe metinleri çıkarır. Yorumları ve regex
 * değişmezlerini atlayan küçük bir tarayıcıdır; şablon dizgilerindeki
 * ${…} parçaları {0}, {1}… yer tutucusuna dönüşür.
 *
 * Kullanım:
 *   node scripts/i18n/extract-strings.mjs            → özet
 *   node scripts/i18n/extract-strings.mjs --json     → [{text, files}] listesi
 *   node scripts/i18n/extract-strings.mjs --missing  → sözlükte olmayanlar
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMP = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;

export function lessonGraph(entry = 'learning-scenes.html') {
  const html = fs.readFileSync(path.join(root, entry), 'utf8');
  const queue = [...html.matchAll(IMP)].map(m => path.resolve(root, m[1].replace(/\?.*/, '')));
  const seen = new Set();
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !fs.existsSync(file) || !file.endsWith('.js')) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMP)) queue.push(path.resolve(path.dirname(file), m[1].replace(/\?.*/, '')));
  }
  return [...seen].map(f => path.relative(root, f).split(path.sep).join('/')).sort();
}

const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** JS kaynağındaki dizgi değişmezleri: {text, line}. Şablonlarda ${} → {i}. */
export function scanStrings(src) {
  const out = [];
  let i = 0, line = 1, lastSig = '';
  const n = src.length;
  const regexAllowed = () => !lastSig || /[(,=:[!&|?{};+\-*%<>~^]$/.test(lastSig) || /\b(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(lastSig);

  function readQuoted(q) {
    let s = '';
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') {
        const c = src[i + 1];
        if (c === 'u') {
          if (src[i + 2] === '{') { const end = src.indexOf('}', i); s += String.fromCodePoint(parseInt(src.slice(i + 3, end), 16)); i = end + 1; continue; }
          s += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; continue;
        }
        if (c === 'x') { s += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16)); i += 4; continue; }
        if (c === '\n') { line++; i += 2; continue; }
        if (c === '\r') { i += src[i + 2] === '\n' ? 3 : 2; line++; continue; }
        s += ESC[c] ?? c; i += 2; continue;
      }
      if (src[i] === '\n') line++;
      s += src[i++];
    }
    i++;
    return s;
  }

  function readTemplate() {
    const startLine = line;
    let s = '', holes = 0;
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { const c = src[i + 1]; s += ESC[c] ?? c; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2;
        scanExpr('}');
        s += `{${holes++}}`;
        continue;
      }
      if (src[i] === '\n') line++;
      s += src[i++];
    }
    i++;
    out.push({ text: s, line: startLine, template: true });
  }

  function scanExpr(close) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (close && c === close && depth === 0) { i++; lastSig = close; return; }
      if (c === '{' || c === '(' || c === '[') depth++;
      if (c === '}' || c === ')' || c === ']') depth--;
      if (c === '\n') { line++; i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); for (let k = i; k < end; k++) if (src[k] === '\n') line++; i = end + 2; continue; }
      if (c === '\'' || c === '"') { const l = line; const text = readQuoted(c); out.push({ text, line: l, template: false }); lastSig = 'str'; continue; }
      if (c === '`') { readTemplate(); lastSig = 'str'; continue; }
      if (c === '/' && regexAllowed()) {
        i++;
        let cls = false;
        while (i < n && (src[i] !== '/' || cls)) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; }
        i++;
        while (/[a-z]/i.test(src[i] || '')) i++;
        lastSig = 'regex';
        continue;
      }
      if (/\s/.test(c)) { i++; continue; }
      if (/[\w$]/.test(c)) { let w = ''; while (i < n && /[\w$]/.test(src[i])) w += src[i++]; lastSig = w; continue; }
      lastSig = c;
      i++;
    }
  }

  scanExpr(null);
  return out;
}

const TR_CHARS = /[ğüşıöçĞÜŞİÖÇâÂ]/;

/** Kullanıcıya görünen metin mi? Kod/CSS/seçici/kimlik gibi dizgileri eler. */
export function isProse(text) {
  const t = text.trim();
  if (!t || t.length < 2) return false;
  if (/^(\[\w+\]|[a-z]\w*(Policy|Controller|Scene|Runtime|Adapter)?:\s)/.test(t)) return false; // geliştirici iletisi
  if (/^[\w$.-]+$/.test(t) && !TR_CHARS.test(t) && !/^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+$/.test(t)) return false; // kimlik, anahtar
  if (/^[#.[]?[a-z-][\w-]*(\s*[>.#[:][\w-="'\]]+)*$/.test(t) && !TR_CHARS.test(t) && !/\s/.test(t)) return false; // seçici
  if (/^(https?:|\.\/|\.\.\/|data:|rgba?\(|#[0-9a-f]{3,8}$|M\d|var\(--)/i.test(t)) return false;
  if (/^[\d\s.,:;%+\-*/()px]+$/.test(t)) return false;
  if (/;\s*[a-z-]+\s*:/.test(t) && !TR_CHARS.test(t)) return false; // css
  const letters = t.replace(/<[^>]*>|\{\d+\}|&[a-z]+;/g, '');
  if (!/[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(letters)) return false;
  if (TR_CHARS.test(letters)) return true;
  if (/="|\w--\w|\b[\w]+-[\w-]+\b|\b\d*px\b|\bms\b|monospace|^Illegal/.test(t)) return false; // sınıf adı, css, geliştirici iletisi
  // Türkçe harfi olmayan kısa Türkçe sözcükler ("Devam", "Tamam", "Sen"…)
  return /\s/.test(letters.trim()) || /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]{1,}[.!?…]?$/.test(letters.trim());
}

/* İşaretleme içeren şablonlar: DOM'da her öğe ayrı birim olacağından metin,
   satır içi olmayan etiketlerden bölünür (<strong>, <em>… korunur). */
const KEEP_INLINE = /^<\/?(strong|em|b|i|br|code|small|sup|sub|mark|kbd|u)\b[^>]*>$/i;
export function splitMarkup(text) {
  if (!/<[a-z!/]/i.test(text)) return [text];
  if (/<style\b/i.test(text)) text = text.replace(/<style\b[\s\S]*?<\/style>/gi, ' <x> ');
  const parts = [];
  for (const m of text.matchAll(/\b(?:aria-label|title|alt|placeholder)\s*=\s*(["'])(.*?)\1/g)) parts.push(m[2]);
  let current = '';
  for (const piece of text.split(/(<[^>]*>)/)) {
    if (/^<[^>]*>$/.test(piece) && !KEEP_INLINE.test(piece)) { parts.push(current); current = ''; }
    else current += piece;
  }
  parts.push(current);
  return parts.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/* Sahnelerin kullandığı eski müfredat dersleri (core/curriculum.js, LESSON_ID). */
export const CURRICULUM_LESSONS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l10', 'l11', 'l12'];
const CURRICULUM_SKIP_KEYS = new Set(['id', 'c', 'color', 'turn', 'sceneId', 'concepts', 'sourceRefs', 'kind', 'guidanceLevel', 'goalZone', 'answers', 'type', 'camera']);

async function curriculumStrings() {
  const { CURRICULUM } = await import(new URL('../../core/curriculum.js', import.meta.url));
  const out = [];
  const walk = (value, key) => {
    if (CURRICULUM_SKIP_KEYS.has(key)) return;
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(v => walk(v, key));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  for (const chapter of CURRICULUM) {
    for (const lesson of chapter.lessons) {
      if (!CURRICULUM_LESSONS.includes(lesson.id)) continue;
      walk(lesson.title, 'title');
      walk(lesson.steps, 'steps');
    }
  }
  return out;
}

const SKIP_FILES = new Set(['core/curriculum.js', 'core/releaseVersion.js', 'core/i18n.js']);

export async function collectLessonStrings() {
  const map = new Map();
  const add = (text, file) => {
    for (const segment of splitMarkup(text)) {
      const key = segment.replace(/\s+/g, ' ').trim();
      if (!isProse(key)) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(file);
    }
  };
  for (const rel of lessonGraph()) {
    if (SKIP_FILES.has(rel)) continue;
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const { text } of scanStrings(src)) add(text, rel);
  }
  for (const text of await curriculumStrings()) add(text, 'core/curriculum.js');
  const page = fs.readFileSync(path.join(root, 'learning-scenes.html'), 'utf8');
  // Sayfanın satır içi betikleri (konu haritası etiketleri, uyarılar).
  for (const m of page.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const { text } of scanStrings(m[1])) add(text, 'learning-scenes.html');
  }
  const html = page.replace(/<script\b[\s\S]*?<\/script>|<!--[\s\S]*?-->/gi, ' ');
  add(html.replace(/[\s\S]*<body[^>]*>/i, ''), 'learning-scenes.html');
  for (const m of html.matchAll(/\b(?:aria-label|title|alt|placeholder)="([^"]+)"/g)) add(m[1], 'learning-scenes.html');
  return [...map].map(([text, files]) => ({ text, files: [...files] }));
}

/** Metnin kısa, kararlı kimliği (çeviri dosyaları bu kimliği kullanır). */
export function stringId(text) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let k = 0; k < text.length; k++) {
    const c = text.charCodeAt(k);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 9);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all = await collectLessonStrings();
  if (process.argv.includes('--catalog')) {
    const catalog = {};
    for (const { text } of all) {
      const id = stringId(text);
      if (catalog[id] && catalog[id] !== text) throw new Error('kimlik çakışması: ' + id);
      catalog[id] = text;
    }
    fs.writeFileSync(path.join(root, 'scripts/i18n/lesson-catalog.json'), JSON.stringify(catalog, null, 1) + '\n');
    console.log(`scripts/i18n/lesson-catalog.json: ${all.length} metin`);
  } else if (process.argv.includes('--json')) {
    console.log(JSON.stringify(all, null, 1));
  } else if (process.argv.includes('--missing')) {
    const { buildDict } = await import('./build-locales.mjs');
    const en = buildDict(1);
    const missing = all.filter(s => !(s.text in en));
    console.log(JSON.stringify(missing, null, 1));
    console.error(`${missing.length} / ${all.length} eksik`);
  } else {
    const byFile = {};
    for (const s of all) for (const f of s.files) byFile[f] = (byFile[f] || 0) + 1;
    console.log(Object.entries(byFile).sort((a, b) => b[1] - a[1]).map(([f, c]) => `${c}\t${f}`).join('\n'));
    console.log(`toplam ${all.length} metin, ${all.reduce((a, s) => a + s.text.length, 0)} karakter`);
  }
}
