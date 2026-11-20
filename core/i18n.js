/**
 * core/i18n.js
 *
 * Sitenin dil katmanı (TR / EN / RU). Türkçe metin HTML'de ve JS'te kaynak
 * olarak kalır; çeviri sözlükleri (locales/en.js, locales/ru.js) Türkçe
 * cümleyi anahtar olarak kullanır. Böylece JS kapalıyken ya da bir çeviri
 * eksikken sayfa Türkçe kalır, hiçbir şey kırılmaz.
 *
 * Dil seçimi sırası: ?lang= > kayıtlı tercih > tarayıcı dili (en/ru) > tr.
 * Sayfanın <head>'indeki satır içi betik aynı kararı erken verir, <html lang>
 * değerini koyar ve çeviri bitene kadar gövdeyi gizler (i18n-pending).
 */

export const LANG_KEY = 'antalyago-lang';
export const LANGS = Object.freeze(['tr', 'en', 'ru']);
export const isLang = value => LANGS.includes(value);

const LABELS = { tr: 'Türkçe', en: 'English', ru: 'Русский' };

export function resolveLang({ query = null, saved = null, browser = [] } = {}) {
  if (isLang(query)) return query;
  if (isLang(saved)) return saved;
  for (const tag of browser) {
    const base = String(tag || '').toLowerCase().slice(0, 2);
    if (isLang(base)) return base;
  }
  return 'tr';
}

function readSaved(storage) {
  try { return storage?.getItem(LANG_KEY) ?? null; } catch { return null; }
}

export function persistLang(lang, storage = globalThis.localStorage) {
  if (!isLang(lang)) return false;
  try { storage?.setItem(LANG_KEY, lang); return true; } catch { return false; }
}

function detectLang() {
  if (typeof location === 'undefined') return 'tr';
  const query = new URLSearchParams(location.search).get('lang');
  const lang = resolveLang({
    query,
    saved: readSaved(globalThis.localStorage),
    browser: globalThis.navigator?.languages || [globalThis.navigator?.language],
  });
  if (isLang(query)) persistLang(query);
  return lang;
}

export const lang = detectLang();

/* Sayfa ek bir sözlük isteyebilir: <html data-i18n-bundle="lessons"> →
   locales/lessons-<dil>.js (ders sahneleri; kalıplar dahil). */
const bundle = typeof document !== 'undefined' ? document.documentElement.dataset.i18nBundle || '' : '';

let dict = {};
let patterns = [];
if (lang !== 'tr') {
  // Sözlükler, bu modülün sürüm damgasını (?v=…) taşır: eski çeviri önbellekten gelmesin.
  const release = new URL(import.meta.url).searchParams.get('v');
  const suffix = release ? `?v=${release}` : '';
  const files = [`../locales/${lang}.js${suffix}`];
  if (/^[a-z]+$/.test(bundle)) files.push(`../locales/${bundle}-${lang}.js${suffix}`);
  const mods = await Promise.all(files.map(file => import(file).catch(error => {
    console.warn('Çeviri yüklenemedi, Türkçe gösteriliyor:', error);
    return null;
  })));
  for (const mod of mods) {
    if (!mod) continue;
    Object.assign(dict, mod.default);
    for (const [source, target] of mod.patterns || []) patterns.push(compilePattern(source, target));
  }
}

function norm(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/* Kalıp yer tutucuları: {0} herhangi bir metin, {0#} yalnız sayı. */
function compilePattern(source, target) {
  const literal = source.replace(/\{\d+#?\}/g, '').replace(/<[^>]*>/g, '').trim();
  const escaped = source.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d+)#\}/g, '(\\d+(?:[.,]\\d+)?)');
  // Aynı kalıp iki biçimde denenir: kısa (lazy) ve uzun (greedy) yakalama.
  // "{0} {1}/{2} nokta denendi." gibi kalıplarda doğru bölünme ikincisidir.
  const res = ['([\\s\\S]+?)', '([\\s\\S]+)'].map(hole => new RegExp('^' + escaped.replace(/\{(\d+)\}/g, hole) + '$'));
  const order = [...source.matchAll(/\{(\d+)#?\}/g)].map(m => Number(m[1]));
  return { res, target: target.replace(/\{(\d+)#\}/g, '{$1}'), order, weight: literal.length + (source.match(/\{\d+#\}/g) || []).length / 2 };
}

/* Harf içermeyen ya da koordinat/sayı gibi çevrilmesi gerekmeyen parça. */
const neutral = part => !/[A-Za-zÇĞİÖŞÜçğıöşü]{2}/.test(part);
const SENTENCE = /(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9“"(«])/;
const memo = new Map();

/** Sözlükte ya da kalıplarda karşılığı olan çeviri; yoksa undefined.
    Kalıbın yakaladığı parçalar (ör. "Siyah", iç içe cümle) de çevrilir.
    Birden çok kalıp eşleşirse bütün parçaları çevrilebilen en ağır kalıp
    seçilir; olmazsa metin cümlelerine bölünüp her cümle ayrı çevrilir. */
export function lookup(text) {
  const key = norm(text);
  if (!key) return undefined;
  if (key in dict) return dict[key];
  if (!patterns.length) return undefined;
  const full = complete(key, 0);
  if (full !== undefined) return full;
  // Tam çeviri yoksa en ağır kalıp, çevrilemeyen parçalar olduğu gibi kalarak.
  const best = matchPatterns(key)[0];
  return best ? fill(best, 0, false) : undefined;
}

/* Yalnız bütünüyle çevrilebilen metnin çevirisi; yoksa undefined. */
function complete(text, depth) {
  const key = norm(text);
  if (!key) return undefined;
  if (key in dict) return dict[key];
  if (depth > 3) return undefined;
  if (memo.has(key)) return memo.get(key);
  memo.set(key, undefined); // döngüye karşı
  const result = resolve(key, depth);
  memo.set(key, result);
  return result;
}

function matchPatterns(key) {
  const matches = [];
  for (const p of patterns) {
    for (const re of p.res) {
      const m = re.exec(key);
      if (m) matches.push({ p, m });
    }
  }
  return matches.sort((a, b) => b.p.weight - a.p.weight);
}

function fill({ p, m }, depth, strict) {
  const holes = {};
  for (let i = 0; i < p.order.length; i++) {
    const part = m[i + 1];
    const out = neutral(part) ? part : complete(part, depth + 1);
    if (out === undefined && strict) return undefined;
    holes[p.order[i]] = out ?? part;
  }
  return p.target.replace(/\{(\d+)\}/g, (s, n) => (n in holes ? holes[n] : s));
}

function resolve(key, depth) {
  for (const match of matchPatterns(key)) {
    const out = fill(match, depth, true);
    if (out !== undefined) return out;
  }
  const sentences = key.split(SENTENCE);
  if (sentences.length > 1) {
    const parts = sentences.map(s => complete(s, depth + 1));
    if (parts.every(s => s !== undefined)) return parts.join(' ');
  }
  return undefined;
}

/** Türkçe kaynak metnin çevirisi; {ad} yer tutucuları vars ile doldurulur. */
export function t(source, vars) {
  let out = dict[norm(source)] ?? source;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
  return out;
}

export const hasTranslation = source => lang === 'tr' || norm(source) in dict;

/** Sayıyı seçili dile göre yazar (tr/ru: 6,5 · en: 6.5). */
export const formatNumber = n => (lang === 'en' ? String(n) : String(n).replace('.', ','));

/* ── Sayfa çevirisi ─────────────────────────────────────────────────────
   Bir "birim", doğrudan metin taşıyan ve içinde yalnız satır içi öğeler
   olan en dıştaki öğedir (p, h2, <strong>'lu span…). Birimin innerHTML'i
   sözlükte varsa bütünüyle değiştirilir; yoksa olduğu gibi kalır. */
const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'CANVAS', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);
const INLINE = new Set(['A', 'ABBR', 'B', 'BR', 'CODE', 'EM', 'I', 'KBD', 'MARK', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U']);
const ATTRS = ['alt', 'aria-label', 'title', 'placeholder'];

function hasOwnText(el) {
  for (const node of el.childNodes) if (node.nodeType === 3 && node.nodeValue.trim()) return true;
  return false;
}

function isUnit(el) {
  if (!hasOwnText(el)) return false;
  for (const child of el.children) if (!INLINE.has(child.tagName) || child.hasAttribute('data-i18n-skip')) return false;
  return true;
}

function translateAttrs(el) {
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (!value) continue;
    const hit = lookup(value);
    if (hit !== undefined && hit !== value) el.setAttribute(name, hit);
  }
}

/* Birimin içi bütünüyle yeniden yazılabilir mi? Kimliği ya da veri
   özniteliği olan bir alt öğe varsa sayfa kodu ona referans tutuyor
   olabilir; o zaman yalnız metin düğümleri tek tek çevrilir. */
function safeToRewrite(el) {
  for (const child of el.querySelectorAll('*')) {
    if (child.id || [...child.attributes].some(a => a.name.startsWith('data-'))) return false;
  }
  return true;
}

function translateTextNode(node) {
  const value = node.nodeValue;
  if (!value.trim()) return;
  const hit = lookup(value);
  if (hit !== undefined && hit !== value.trim()) node.nodeValue = value.replace(value.trim(), hit);
}

export function translateTree(root) {
  if (lang === 'tr' || !root) return;
  if (root.nodeType === 3) { translateTextNode(root); return; }
  if (root.nodeType !== 1) return;
  const walk = el => {
    if (el.hasAttribute('data-i18n-skip')) return;
    translateAttrs(el);
    if (SKIP.has(el.tagName.toUpperCase())) return;
    if (isUnit(el)) {
      if (!el.children.length || safeToRewrite(el)) {
        const html = el.innerHTML;
        const hit = lookup(html);
        if (hit !== undefined) {
          if (hit !== norm(html)) el.innerHTML = hit;
          return;
        }
      }
    }
    for (const node of [...el.childNodes]) {
      if (node.nodeType === 3) translateTextNode(node);
      else if (node.nodeType === 1) walk(node);
    }
  };
  walk(root);
}

/* Canlı çeviri: sahneler metni sonradan yazar ve değiştirir. Eklenen ya da
   değişen her düğüm, bulunduğu birimle birlikte yeniden çevrilir. Kendi
   yazdığımız çeviriler sözlükte anahtar olmadığından döngü oluşmaz. */
let observer = null;
export function observeTranslations(root = document.body) {
  if (lang === 'tr' || observer || typeof MutationObserver === 'undefined') return;
  const unitOf = node => {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== root && el.parentElement && isUnit(el.parentElement) && INLINE.has(el.tagName)) el = el.parentElement;
    return el;
  };
  observer = new MutationObserver(records => {
    const targets = new Set();
    for (const r of records) {
      if (r.type === 'attributes') { translateAttrs(r.target); continue; }
      if (r.type === 'characterData') { targets.add(unitOf(r.target)); continue; }
      for (const node of r.addedNodes) {
        if (node.nodeType === 1) targets.add(node.parentElement && isUnit(node.parentElement) ? unitOf(node) : node);
        else if (node.nodeType === 3) targets.add(unitOf(node));
      }
    }
    for (const el of targets) if (el && el.isConnected) translateTree(el);
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Sayfadaki birimler: sözlük hazırlarken çevrilecek metinleri listelemek için. */
export function collectUnits(root = document.body) {
  const out = new Set();
  const walk = el => {
    if (el.hasAttribute('data-i18n-skip')) return;
    for (const name of ATTRS) if (el.getAttribute(name)?.trim()) out.add(norm(el.getAttribute(name)));
    if (SKIP.has(el.tagName.toUpperCase())) return;
    if (isUnit(el)) { out.add(norm(el.innerHTML)); return; }
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.nodeValue.trim()) out.add(norm(node.nodeValue));
      else if (node.nodeType === 1) walk(node);
    }
  };
  walk(root);
  return [...out];
}

function translateHead(doc) {
  doc.title = lookup(doc.title) ?? doc.title;
  doc.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]').forEach(meta => {
    const value = meta.getAttribute('content');
    const hit = value && dict[norm(value)];
    if (hit) meta.setAttribute('content', hit);
  });
  const locale = { tr: 'tr_TR', en: 'en_US', ru: 'ru_RU' }[lang];
  doc.querySelector('meta[property="og:locale"]')?.setAttribute('content', locale);
}

/* ── Dil seçici ─────────────────────────────────────────────────────── */
export function switchLang(next, { storage = globalThis.localStorage } = {}) {
  if (!isLang(next) || next === lang) return;
  persistLang(next, storage);
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.replace(url.href);
}

export function mountSwitchers(root = document) {
  root.querySelectorAll('[data-lang-switch]').forEach(box => {
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', t('Dil seçimi'));
    box.innerHTML = LANGS.map(code =>
      `<button type="button" class="lang-switch__btn" data-lang="${code}" lang="${code}" aria-pressed="${code === lang}" title="${LABELS[code]}" aria-label="${LABELS[code]}">${code.toUpperCase()}</button>`
    ).join('');
    box.addEventListener('click', event => {
      const btn = event.target.closest('[data-lang]');
      if (!btn) return;
      // Dar ekranda yalnız etkin dil görünür (CSS); ona dokunmak listeyi açar/kapatır.
      if (btn.dataset.lang === lang) {
        const open = !box.classList.contains('is-open');
        box.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
        return;
      }
      switchLang(btn.dataset.lang);
    });
  });
}

if (typeof document !== 'undefined') {
  const doc = document;
  doc.documentElement.lang = lang;
  if (lang !== 'tr') {
    translateHead(doc);
    translateTree(doc.body);
    if (bundle) observeTranslations(doc.body);
  }
  mountSwitchers(doc);
  doc.documentElement.classList.remove('i18n-pending');
  globalThis.addEventListener?.('storage', event => {
    if (event.key === LANG_KEY && isLang(event.newValue) && event.newValue !== lang) location.reload();
  });
}
