import { createDocument, touchUpdatedAt, migrateDocument, slugify, STUDIO_VERSION, SAFE_ID_RE, VALID_STATUSES, VALID_BOARD_SIZES, VALID_PLAYER_COLORS, VALID_OUTPUTS } from '../studio/model/studioDocument.js';
import { validateDocument, canSaveDraft } from '../studio/model/validation.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓', name); passed++; }
  catch (e) { console.error('  ✗', name, '-', e.message); failed++; }
}
function ok(val, msg = 'assertion failed') { if (!val) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

const FIXED_NOW = new Date('2026-01-15T10:00:00.000Z');
const opts = { now: FIXED_NOW };

console.log('\n─── studio-document.test.js ───\n');

// ── Schema enums ile doğrulayıcı uyumu ──────────────────────────────
test('STUDIO_VERSION doğrulayıcıyla uyumlu', () => {
  eq(STUDIO_VERSION, '1.0.0');
  const doc = createDocument({ id: 'test-1', title: 'T' }, opts);
  const r = validateDocument(doc);
  ok(r.valid, r.errors.join('; '));
});
test('VALID_STATUSES doğrulayıcı enumlarıyla eşleşiyor', () => {
  for (const s of VALID_STATUSES) {
    const doc = createDocument({ id: 'x1', title: 'T', status: s }, opts);
    const r = validateDocument(doc);
    ok(!r.errors.some(e => e.includes('status')), `${s} reddedildi`);
  }
});
test('VALID_BOARD_SIZES doğrulayıcı boyutlarıyla eşleşiyor', () => {
  for (const sz of VALID_BOARD_SIZES) {
    const doc = createDocument({ id: 'x2', title: 'T', board: { size: sz, turn: 'black', ko: null, stones: [], markers: [], regions: [], viewport: null } }, opts);
    const r = validateDocument(doc);
    ok(!r.errors.some(e => e.includes('board.size')), `boyut ${sz} reddedildi`);
  }
});
test('VALID_PLAYER_COLORS doğrulayıcı renkleriyle eşleşiyor', () => {
  for (const c of VALID_PLAYER_COLORS) {
    const doc = createDocument({ id: 'x3', title: 'T', board: { size: 9, turn: c, ko: null, stones: [], markers: [], regions: [], viewport: null } }, opts);
    const r = validateDocument(doc);
    ok(!r.errors.some(e => e.includes('board.turn')), `renk ${c} reddedildi`);
  }
});
test('VALID_OUTPUTS doğrulayıcıyla uyumlu', () => {
  const outputs = Object.fromEntries(VALID_OUTPUTS.map(k => [k, false]));
  const doc = createDocument({ id: 'x4', title: 'T', outputs }, opts);
  const r = validateDocument(doc);
  ok(!r.warnings.some(w => w.includes('outputs.')), JSON.stringify(r.warnings));
});

// ── createDocument ────────────────────────────────────────────────────
test('varsayılan belge geçerlidir', () => {
  const doc = createDocument({ id: 'test-1', title: 'Test Başlık' }, opts);
  const r = validateDocument(doc);
  ok(r.valid, r.errors.join('; '));
});
test('studioVersion 1.0.0 olarak ayarlanır', () => {
  const doc = createDocument({}, opts);
  eq(doc.studioVersion, '1.0.0');
});
test('audit.createdAt sabit saat ile deterministiktir', () => {
  const d1 = createDocument({ id: 'a', title: 'T' }, opts);
  const d2 = createDocument({ id: 'a', title: 'T' }, opts);
  eq(d1.audit.createdAt, d2.audit.createdAt);
  eq(d1.audit.createdAt, FIXED_NOW.toISOString());
});
test('override iç içe alanları birleştirir', () => {
  const doc = createDocument({ id: 'a', title: 'T', board: { size: 13 } }, opts);
  eq(doc.board.size, 13);
  eq(doc.board.turn, 'black'); // default korunur
});
test('JSON round-trip belgeyi korur', () => {
  const doc = createDocument({ id: 'round-trip-1', title: 'Round Trip' }, opts);
  const restored = JSON.parse(JSON.stringify(doc));
  eq(JSON.stringify(doc), JSON.stringify(restored));
});

// ── slugify ───────────────────────────────────────────────────────────
test('slugify Türkçe karakterleri dönüştürür', () => {
  const s = slugify('Merdiven Yönünü Belirleme');
  ok(/^[a-z0-9-]+$/.test(s), `slug geçersiz: ${s}`);
  ok(!s.startsWith('-') && !s.endsWith('-'), `başta/sonda tire: ${s}`);
});
test('slugify ardışık tireleri temizler', () => {
  const s = slugify('aaa  ---  bbb');
  ok(!s.includes('--'), `ardışık tire kaldı: ${s}`);
});

// ── SAFE_ID_RE ────────────────────────────────────────────────────────
test('tek karakterli ID geçerlidir', () => ok(SAFE_ID_RE.test('a')));
test('iki karakterli ID geçerlidir', () => ok(SAFE_ID_RE.test('a1')));
test('baştaki tire geçersiz', () => ok(!SAFE_ID_RE.test('-abc')));
test('sondaki tire geçersiz', () => ok(!SAFE_ID_RE.test('abc-')));
test('ardışık tire geçersiz', () => ok(!SAFE_ID_RE.test('a--b')));
test('büyük harf geçersiz', () => ok(!SAFE_ID_RE.test('Abc')));

// ── validateDocument hata durumları ──────────────────────────────────
test('id eksikse hata', () => {
  const r = validateDocument(createDocument({ title: 'T' }, opts));
  ok(r.errors.some(e => e.includes('id')));
  ok(!r.valid);
});
test('title eksikse hata', () => {
  const r = validateDocument(createDocument({ id: 'a', title: '' }, opts));
  ok(r.errors.some(e => e.includes('title')));
});
test('geçersiz status hatası', () => {
  const doc = createDocument({ id: 'a', title: 'T', status: 'pending' }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('status')));
});
test('geçersiz tahta boyutu hatası', () => {
  const doc = createDocument({ id: 'a', title: 'T', board: { size: 7, turn: 'black', stones: [], ko: null, markers: [], regions: [], viewport: null } }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('board.size')));
});
test('tahta dışı taş koordinatı hatası', () => {
  const doc = createDocument({ id: 'a', title: 'T', board: { size: 9, turn: 'black', stones: [{ color: 'black', x: 9, y: 0 }], ko: null, markers: [], regions: [], viewport: null } }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('dışında')));
});
test('aynı noktada iki taş hatası', () => {
  const stones = [{ color: 'black', x: 4, y: 4 }, { color: 'white', x: 4, y: 4 }];
  const doc = createDocument({ id: 'a', title: 'T', board: { size: 9, turn: 'black', stones, ko: null, markers: [], regions: [], viewport: null } }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('iki taş')));
});
test('dolu noktada ko hatası', () => {
  const stones = [{ color: 'black', x: 4, y: 4 }];
  const doc = createDocument({ id: 'a', title: 'T', board: { size: 9, turn: 'black', stones, ko: { x: 4, y: 4 }, markers: [], regions: [], viewport: null } }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('ko')));
});
test('geçersiz taş rengi hatası', () => {
  const doc = createDocument({ id: 'a', title: 'T', board: { size: 9, turn: 'black', stones: [{ color: 'red', x: 0, y: 0 }], ko: null, markers: [], regions: [], viewport: null } }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('color')));
});
test('geçersiz board.turn hatası', () => {
  const doc = createDocument({ id: 'a', title: 'T', board: { size: 9, turn: 'green', stones: [], ko: null, markers: [], regions: [], viewport: null } }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('board.turn')));
});
test('negatif timeline.durationMs hatası', () => {
  const doc = createDocument({ id: 'a', title: 'T', timeline: { durationMs: -1, events: [] } }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('durationMs')));
});
test('bozuk ISO 8601 tarihi hatası', () => {
  const doc = createDocument({ id: 'a', title: 'T', audit: { createdAt: '2026/01/01', updatedAt: '2026/01/01', author: '', reviewedAt: null } }, opts);
  const r = validateDocument(doc);
  ok(r.errors.some(e => e.includes('ISO')));
});
test('bilinmeyen output türü uyarı verir (hata değil)', () => {
  const doc = createDocument({ id: 'a', title: 'T', outputs: { unknownOutput: true } }, opts);
  const r = validateDocument(doc);
  ok(r.warnings.some(w => w.includes('outputs.unknownOutput')));
  ok(r.valid, 'bilinmeyen output hataya dönüştü');
});

// ── canSaveDraft ──────────────────────────────────────────────────────
test('hatasız belge draft olarak kaydedilebilir', () => {
  const doc = createDocument({ id: 'b1', title: 'T' }, opts);
  ok(canSaveDraft(validateDocument(doc)));
});
test('hatalı belge draft olarak kaydedilemez', () => {
  const doc = createDocument({}, opts);
  ok(!canSaveDraft(validateDocument(doc)));
});
test('yalnız uyarı olan belge kaydedilebilir', () => {
  const doc = createDocument({ id: 'w1', title: 'T' }, opts); // section/lesson eksik → warning
  const r = validateDocument(doc);
  ok(r.warnings.length > 0, 'uyarı oluşmadı');
  ok(canSaveDraft(r));
});

// ── touchUpdatedAt ────────────────────────────────────────────────────
test('touchUpdatedAt clock injection ile çalışır', () => {
  const doc = createDocument({ id: 'a', title: 'T' }, opts);
  const later = new Date('2026-06-01T12:00:00.000Z');
  const updated = touchUpdatedAt(doc, { now: later });
  eq(updated.audit.updatedAt, later.toISOString());
  eq(doc.audit.updatedAt, FIXED_NOW.toISOString()); // orijinal değişmedi
});

// ── migrateDocument ───────────────────────────────────────────────────
test('aynı sürüm belgeyi olduğu gibi döndürür', () => {
  const doc = createDocument({ id: 'a', title: 'T' }, opts);
  const migrated = migrateDocument(doc);
  eq(JSON.stringify(doc), JSON.stringify(migrated));
});
test('null/undefined belge döndürür', () => {
  eq(migrateDocument(null), null);
  eq(migrateDocument(undefined), undefined);
});

console.log(`\nToplam: ${passed + failed}  ✓ ${passed}  ✗ ${failed}`);
if (failed) process.exit(1);
