/**
 * tests/i18n.test.js — dil katmanı (core/i18n.js) ve çeviri sözlükleri.
 *
 * 1. Dil seçim sırası: ?lang > kayıt > tarayıcı > tr.
 * 2. JS'teki her t('…') metninin EN ve RU karşılığı var.
 * 3. Yer tutucular ({n}, {move}…) her dilde aynı.
 * 4. locales/*.js, strings.mjs'ten üretilmiş haliyle güncel.
 * 5. Çevrilen sayfalarda dil seçici ve erken dil betiği var.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLang, t, lang, isLang } from '../core/i18n.js';
import { STRINGS } from '../scripts/i18n/strings.mjs';
import { buildDict, buildLessonBundle, readCatalog, lessonSources, patternRegex } from '../scripts/i18n/build-locales.mjs';
import { collectLessonStrings, stringId } from '../scripts/i18n/extract-strings.mjs';
import { fragments } from '../scripts/i18n/lessons/patterns.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (ok, message) => {
  if (ok) return;
  failed += 1;
  console.error('✗ ' + message);
};

/* 1 */
check(resolveLang({}) === 'tr', 'varsayılan dil tr olmalı');
check(resolveLang({ browser: ['ru-RU', 'en'] }) === 'ru', 'tarayıcı dili ru seçilmeli');
check(resolveLang({ browser: ['de-DE', 'en-GB'] }) === 'en', 'desteklenen ilk tarayıcı dili seçilmeli');
check(resolveLang({ saved: 'tr', browser: ['ru'] }) === 'tr', 'kayıtlı tercih tarayıcıdan önce gelmeli');
check(resolveLang({ query: 'en', saved: 'ru' }) === 'en', '?lang kayıttan önce gelmeli');
check(resolveLang({ query: 'xx', saved: 'yy' }) === 'tr', 'geçersiz değerler yok sayılmalı');
check(lang === 'tr' && isLang('ru') && !isLang('de'), 'Node ortamında dil tr olmalı');
check(t('Beyaz {n} taş aldı. Sıra sende.', { n: 3 }) === 'Beyaz 3 taş aldı. Sıra sende.', 'tr modunda t() yer tutucuyu doldurmalı');

/* 2 */
const en = buildDict(1);
const ru = buildDict(2);
const sources = ['core/theme.js', 'core/i18n.js', 'core/hintTools.js', 'core/handicapLadder.js', 'home/heroBoard.js', 'robot/robotPage.js'];
const calls = new Set();
for (const file of sources) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const m of text.matchAll(/\btx?\(\s*'((?:[^'\\]|\\.)*)'/g)) calls.add(m[1].replace(/\\'/g, "'").replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))));
}
const ladder = fs.readFileSync(path.join(root, 'core/handicapLadder.js'), 'utf8');
for (const m of ladder.matchAll(/(?:title|lead): '([^']+)'/g)) calls.add(m[1]);
const hero = fs.readFileSync(path.join(root, 'home/heroBoard.js'), 'utf8');
for (const m of hero.matchAll(/(?:btn|cap|say|showFree)[:(]\s*'((?:[^'\\]|\\.)*)'/g)) calls.add(m[1].replace(/\\'/g, "'"));
const robot = fs.readFileSync(path.join(root, 'robot/robotPage.js'), 'utf8');
for (const m of robot.matchAll(/(?:setStatus|setHint|confirmTwice\([^,]+),\s*'([^']+)'|(?:setStatus|setHint)\('([^']+)'\)/g)) calls.add(m[1] || m[2]);
const hints = fs.readFileSync(path.join(root, 'core/hintTools.js'), 'utf8');
for (const m of hints.matchAll(/(?:return|\?|:)\s*'([^']*[ğüşıöçİ][^']*)'/g)) calls.add(m[1]);
for (const text of calls) {
  if (!/[ğüşıöçĞÜŞİÖÇ]/.test(text) && !/^(Gece|Pas)$/.test(text)) continue;
  check(text in en, `EN çevirisi eksik: ${text}`);
  check(text in ru, `RU çevirisi eksik: ${text}`);
}
check(calls.size > 60, `beklenenden az metin tarandı (${calls.size})`);

/* 3 */
const holes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
for (const [tr, enText, ruText] of STRINGS) {
  check(holes(tr) === holes(enText), `EN yer tutucusu uyuşmuyor: ${tr}`);
  check(holes(tr) === holes(ruText), `RU yer tutucusu uyuşmuyor: ${tr}`);
  check(enText && ruText, `boş çeviri: ${tr}`);
}

/* 4 */
for (const [code, dict] of [['en', en], ['ru', ru]]) {
  const built = (await import(`../locales/${code}.js`)).default;
  check(JSON.stringify(built) === JSON.stringify(dict), `locales/${code}.js güncel değil: node scripts/i18n/build-locales.mjs`);
}

/* 5 */
for (const page of ['index.html', 'go-nedir.html', 'robot.html']) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  check(html.includes('data-lang-switch'), `${page}: dil seçici yok`);
  check(html.includes("localStorage.getItem('antalyago-lang')"), `${page}: erken dil betiği yok`);
  check(html.includes('i18n-pending'), `${page}: çeviri bekleme sınıfı yok`);
  check(/hreflang="en"/.test(html) && /hreflang="ru"/.test(html), `${page}: hreflang bağlantıları yok`);
  check(html.includes('core/theme.js'), `${page}: theme.js (i18n.js'i yükler) yok`);
}

/* 6 — Ders sayfası (learning-scenes.html) */
const lessonHtml = fs.readFileSync(path.join(root, 'learning-scenes.html'), 'utf8');
check(lessonHtml.includes('data-i18n-bundle="lessons"'), 'learning-scenes.html: ders sözlüğü istenmiyor');
check(lessonHtml.includes('data-lang-switch'), 'learning-scenes.html: dil seçici yok');
check(/import '\.\/core\/i18n\.js\?v=[^']+';/.test(lessonHtml), 'learning-scenes.html: i18n.js sürüm damgasıyla yüklenmiyor');

const catalog = readCatalog();
const current = await collectLessonStrings();
const currentIds = new Set(current.map(s => stringId(s.text)));
const staleNew = current.filter(s => !(stringId(s.text) in catalog));
check(!staleNew.length, `lesson-catalog.json güncel değil (yeni metin: ${staleNew.slice(0, 3).map(s => s.text).join(' | ')}…): node scripts/i18n/extract-strings.mjs --catalog`);
check(Object.keys(catalog).every(id => currentIds.has(id)), 'lesson-catalog.json artık kullanılmayan metin içeriyor: node scripts/i18n/extract-strings.mjs --catalog');

const { parts } = await lessonSources();
const fragmentSet = new Set(fragments);
for (const [code, column] of [['en', 1], ['ru', 2]]) {
  const bundle = await buildLessonBundle(column);
  check(!bundle.unknown.length, `${code}: katalogda olmayan çeviri kimlikleri: ${bundle.unknown.join(', ')}`);
  const res = bundle.patterns.map(([source]) => patternRegex(source));
  let missing = 0;
  for (const [id, text] of Object.entries(catalog)) {
    if (fragmentSet.has(id) || !/[ğüşıöçĞÜŞİÖÇ]/.test(text)) continue;
    const norm = text.replace(/\s+/g, ' ').trim();
    if (norm in bundle.dict || res.some(re => re.test(norm))) continue;
    if (++missing <= 5) console.error(`  ${code} eksik: ${id}\t${text}`);
  }
  check(!missing, `${code}: ${missing} ders metninin çevirisi yok (scripts/i18n/lessons/part*.mjs)`);
  const built = await import(`../locales/lessons-${code}.js`);
  check(JSON.stringify(built.default) === JSON.stringify(bundle.dict) && JSON.stringify(built.patterns) === JSON.stringify(bundle.patterns),
    `locales/lessons-${code}.js güncel değil: node scripts/i18n/build-locales.mjs`);
}
for (const [id, [enText, ruText]] of Object.entries(parts)) {
  if (!(id in catalog)) continue;
  check(holes(catalog[id]) === holes(enText), `ders EN yer tutucusu uyuşmuyor: ${id}`);
  check(holes(catalog[id]) === holes(ruText), `ders RU yer tutucusu uyuşmuyor: ${id}`);
}

if (failed) {
  console.error(`\ni18n: ${failed} hata`);
  process.exit(1);
}
console.log(`i18n: tamam (${calls.size} JS metni, ${STRINGS.length} çeviri satırı)`);
