/**
 * scripts/i18n/build-locales.mjs
 *
 * Çeviri kaynaklarından tarayıcının yüklediği sözlükleri üretir:
 *   strings.mjs                    → locales/en.js, locales/ru.js (site kabuğu)
 *   lesson-catalog.json + lessons/ → locales/lessons-en.js, locales/lessons-ru.js
 *     (ders sayfası; kalıplar dahil)
 * Kullanım: node scripts/i18n/build-locales.mjs
 * Ders metni değiştiyse önce: node scripts/i18n/extract-strings.mjs --catalog
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STRINGS } from './strings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const norm = s => String(s).replace(/\s+/g, ' ').trim();
export const HOLE = /\{\d+#?\}/;

export function buildDict(column) {
  const dict = {};
  for (const row of STRINGS) {
    const key = norm(row[0]);
    if (key in dict && dict[key] !== row[column]) throw new Error(`Çakışan anahtar: ${key}`);
    dict[key] = row[column];
  }
  return dict;
}

export function readCatalog() {
  return JSON.parse(fs.readFileSync(path.join(root, 'scripts/i18n/lesson-catalog.json'), 'utf8'));
}

export async function lessonSources() {
  const dir = path.join(root, 'scripts/i18n/lessons');
  const parts = {};
  for (const file of fs.readdirSync(dir).filter(f => /^part\d+\.mjs$/.test(f)).sort()) {
    const mod = (await import(pathToFileURL(path.join(dir, file)).href)).default;
    for (const [id, pair] of Object.entries(mod)) {
      if (parts[id]) throw new Error(`Kimlik iki kez çevrildi: ${id} (${file})`);
      parts[id] = pair;
    }
  }
  const patterns = (await import(pathToFileURL(path.join(dir, 'patterns.mjs')).href)).default;
  return { parts, patterns };
}

/** Ders sözlüğü: { dict: {tr: çeviri}, patterns: [[trKalıp, çeviriKalıbı]] }. */
export async function buildLessonBundle(column) {
  const catalog = readCatalog();
  const { parts, patterns } = await lessonSources();
  const dict = {};
  const unknown = [];
  const holed = [];
  for (const [id, pair] of Object.entries(parts)) {
    if (!(id in catalog)) { unknown.push(id); continue; }
    const source = norm(catalog[id]);
    // Şablon dizgisinden gelen metin (${…} → {0}) çalışma anında kalıp olarak eşleşir.
    if (HOLE.test(source)) holed.push([source, pair[column - 1]]);
    else dict[source] = pair[column - 1];
  }
  for (const row of patterns) {
    if (HOLE.test(row[0])) holed.push([norm(row[0]), row[column]]);
    else dict[norm(row[0])] = row[column];
  }
  return { dict, patterns: holed, unknown };
}

/** Bir metnin kalıplardan biriyle eşleşip eşleşmediği (kapsam denetimi için). */
export function patternRegex(source) {
  const esc = source.replace(/[.*+?^$()|[\]\\]/g, '\\$&')
    .replace(/\{(\d+)#\}/g, '(\\d+(?:[.,]\\d+)?)').replace(/\{(\d+)\}/g, '([\\s\\S]+?)');
  return new RegExp(`^${esc}$`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.join(root, 'locales'), { recursive: true });
  for (const [code, column, name] of [['en', 1, 'English'], ['ru', 2, 'Русский']]) {
    const dict = buildDict(column);
    fs.writeFileSync(path.join(root, 'locales', `${code}.js`),
      `/* ${name} — scripts/i18n/build-locales.mjs üretir; elle düzenleme, strings.mjs'i değiştir. */\nexport default ${JSON.stringify(dict, null, 2)};\n`);
    console.log(`locales/${code}.js: ${Object.keys(dict).length} metin`);

    const bundle = await buildLessonBundle(column);
    if (bundle.unknown.length) console.warn(`  uyarı: katalogda olmayan ${bundle.unknown.length} kimlik (eski çeviri?): ${bundle.unknown.join(', ')}`);
    fs.writeFileSync(path.join(root, 'locales', `lessons-${code}.js`),
      `/* ${name}, ders sayfası — scripts/i18n/build-locales.mjs üretir; elle düzenleme, scripts/i18n/lessons/'i değiştir. */\n` +
      `export default ${JSON.stringify(bundle.dict, null, 1)};\n` +
      `export const patterns = ${JSON.stringify(bundle.patterns, null, 1)};\n`);
    console.log(`locales/lessons-${code}.js: ${Object.keys(bundle.dict).length} metin, ${bundle.patterns.length} kalıp`);
  }
}
