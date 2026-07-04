# AG-STUDIO — Ürün Yol Haritası

**Sürüm:** 0.3 (SGF araştırması sonrası güncelleme)  
**Tarih:** 2026-07-04  
**Önceki belgeler:** `desktop-architecture.md` (Faz A.5), `sgf-editor-research.md`  

---

## Mevcut Durum Özeti

`desktop-architecture.md`'nin yazıldığı oturumdan bu yana `desktop/` klasörü büyük ölçüde uygulanmış durumda. **Bu belge gerçek mevcut durumu yansıtır.**

### Tamamlanan Altyapı

| Katman | Dosya | Durum |
|---|---|---|
| Electron main | `desktop/main.cjs` | ✅ Tam — BrowserWindow, dialog, IPC handler |
| Preload | `desktop/preload.cjs` | ✅ Tam — contextBridge IPC sözleşmesi |
| Konfigürasyon | `desktop/config.cjs` | ✅ Tam |
| IPC kanalları | `desktop/ipc/ipcChannels.cjs` | ✅ 12 kanal tanımlı |
| Stüdyo API | `desktop/ipc/studioApi.cjs` | ✅ Tam — invoke/on wrapper |
| Yol politikası | `desktop/ipc/pathPolicy.cjs` | ✅ Tam — path.relative() savunması, .agstudio kuralları |
| Ayar deposu | `desktop/ipc/settingsStore.cjs` | ✅ Tam |
| Dosya işleyicisi | `desktop/ipc/fileHandlers.cjs` | ✅ Tam — atomik yazma, .agstudio liste/oku/yaz |
| Board adapter | `desktop/ipc/studioBoardAdapter.js/cjs` | ✅ Tam — moveTree ↔ BoardState |
| Renderer uygulaması | `desktop/renderer/app.mjs` | ✅ Büyük ölçüde tam — moveTree UI mevcut |
| Renderer stili | `desktop/renderer/studio.css` | ✅ Mevcut |
| Electron HTML | `desktop/index.html` | ✅ Mevcut |
| Veri modeli | `studio/model/studioDocument.js` | ✅ Tam |
| Variant ağacı | `studio/model/moveTree.js` | ✅ Tam — D0 sözleşmesi tamamlandı |
| Doğrulayıcı | `studio/model/validation.js` | ✅ Tam — moveTree annotation doğrulama eklendi |
| Board renderer | `studio/boardRenderer.js` | ✅ SVG modu mevcut |
| Test altyapısı | `tests/studio-*.test.js` | ✅ 151 test (36 doc + 75 tree + 40 server) |

### D0 — Veri Modeli Sertleştirmesi [TAMAMLANDI — 2026-07-04]

| Özellik | Durum |
|---|---|
| Typed annotation discriminated union (9 tip) | ✅ |
| Zorunlu + benzersiz annotation id | ✅ |
| Tip bazlı strict alan doğrulama | ✅ |
| Label uzunluk limiti (`ANNOTATION_LABEL_MAX_LENGTH=64`) | ✅ |
| `MAX_ANNOTATIONS_PER_NODE=100` | ✅ |
| Canonical pass `{color, pass:true}` | ✅ |
| `rawProperties` — SGF round-trip, prototype pollution koruması | ✅ |
| `MAX_TREE_NODES=2000`, `MAX_TREE_DEPTH=500` | ✅ |
| İteratif ağaç gezinme (yığın taşması yok) | ✅ |
| Legacy string annotation → `rawProperties._LEGACY_ANNOTATIONS` | ✅ |
| Schema sürümü 1.0.0 → 1.1.0, migration zinciri | ✅ |
| Migration idempotency testleri | ✅ |
| Legacy fixture dosyaları | ✅ |
| Pass hamle smoke testi (masaüstü "Pas" görünümü) | ✅ |

### Bilinen Eksikler

| Eksik | Etki | Faz |
|---|---|---|
| SGF I/O yok | Formation import, SGF export yok | E.1 |
| Sıkıştırılmış point list desteği yok | Bazı SGF dosyaları yanlış parse edilebilir | E.1 |
| Problem Bank import/export yok | Adaptör adaptörü yok | D |
| Paketleme yok | Dağıtılabilir uygulama yok | G |
| `tsumego.sgf` bozuk | Geliştirme test fixture eksik | Acil |
| `joseki.sgf` telif hakkı sorunu | Üretimde dağıtılamaz | Acil |

---

## Faz Haritası

```
Tamamlandı:     [Faz A] Temel altyapı (web server, studioDocument, testler)
Tamamlandı:     [D0] Veri modeli sertleştirmesi (annotation, pass, rawProps, limitler)
Büyük ölçüde:   [Faz B] Electron kabuğu (desktop/ klasörü mevcut)
Sonraki:        [Faz C] Etkileşimli tahta düzenleme
                [Faz D] Problem Bank entegrasyonu
                [Faz E] SGF I/O + formations içe aktarma
                [Faz F] Çıktı adaptörleri
                [Faz G] Paketleme ve dağıtım
```

---

## Faz B — Electron Kabuğu (Büyük ölçüde tamamlandı)

### B.1 — Annotation Tipi [TAMAMLANDI — D0'da kapatıldı]

Typed discriminated union, zorunlu id, strict alan doğrulama, label limiti — tümü `studio/model/moveTree.js`'de uygulandı.

**Çözüm:**
```js
// Mevcut (yetersiz):
annotations: string[]

// Hedef:
annotations: Array<{
  type: 'triangle'|'square'|'circle'|'cross'|'label'|
        'arrow'|'line'|'viewport'|'node-name'|'hotspot',
  x?: number, y?: number,     // nokta işaretleri için
  text?: string,              // LB etiketi, N adı
  from?: {x:number,y:number}, // AR/LN için
  to?: {x:number,y:number},
  region?: {ul:{x,y}, lr:{x,y}}, // VW için
}>
```

**Etkilenen dosyalar:** `studio/model/moveTree.js`, `tests/studio-text-tree.test.js`, `desktop/renderer/app.mjs`

**Kabul ölçütleri:**
- [ ] `createMoveNode()` yeni annotation yapısını kabul ediyor
- [ ] `setMoveNodeAnnotations()` typed nesneleri doğruluyor
- [ ] Mevcut testler geçiyor (string[] kullanan testler güncelleniyor)
- [ ] `desktop/renderer/app.mjs`'de annotation render doğru çalışıyor

---

### B.2 — Pass Hamlesi Canonical Temsili [Acil]

**Problem:** Pass hamlesinin moveTree'deki temsili belirsiz.

**Çözüm:**
```js
// Pass hamlesi canonical formu:
node.move = { color: 'black'|'white', pass: true, x: null, y: null }

// addChildMove()'da:
if (moveInput.pass || (moveInput.x == null && moveInput.y == null)) {
  // pass — ruleEngine kontrolü yok
}
```

**Kabul ölçütleri:**
- [ ] `addChildMove()` pass hamlesi ekleyebiliyor
- [ ] `serializeMainlineMoves()` pass hamlelerini serialize ediyor
- [ ] `rebuildBoardState()` pass hamlelerini atlıyor (sıra değişimi yapıyor)
- [ ] Test: pass → normal hamle → pass round-trip

---

### B.3 — Desktop Entegrasyon Testleri [Bu hafta]

`tests/studio-electron.test.js` mevcut ama hangi durumda olduğu belirsiz.

**Kabul ölçütleri:**
- [ ] `node tests/studio-electron.test.js` hatasız çalışıyor
- [ ] `node tests/studio-text-tree.test.js` hatasız çalışıyor
- [ ] `npm run test-all` yeşil

---

### B.4 — Bozuk/Sorunlu Dosyaların Temizlenmesi [Bu hafta]

1. **`problems/tsumego.sgf`** — Geçersiz içerik ("Commit changes"). Geçerli bir tsumego fixture ile değiştirilmeli veya silinmeli.
2. **`problems/joseki.sgf`** — Kogo's Joseki Dictionary, özel telif hakkı. `NOTES.md` veya `.gitignore` ile üretim dışı işaretlenmeli.

---

## Faz C — Etkileşimli Tahta Düzenleme

### Hedef

Kullanıcı stüdyo tahtasına tıklayarak taş ekleyip kaldırabilir, marker yerleştirebilir, hamle varyantları oluşturabilir.

### C.1 — Tahta Tıklama ve Taş Yerleştirme

**Gereksinimler:**

- **Kurulum modu:** Her tıklama taş yerleştirir (formation düzenleme). Renk seçici: siyah / beyaz / silgi.
- **Hamle modu:** `addChildMove()` ile yeni moveTree düğümü oluşturur. Ko ve intihar kuralları uygulanır.
- **Mod göstergesi:** Her zaman görünür, yanlış anlaşılma imkânı yok. KGS'nin F1/F2 ayırımından ilham alındı.

**Klavye kısayolları (OGS standardına uygun):**
```
← / →     : önceki / sonraki hamle
↑ / ↓     : dal değiştir (varyant)
PgUp      : ana dale git (preferredChild)
Home      : kök düğüme git
End       : ana hattın son düğümüne git
Ctrl+Z    : geri al
Ctrl+Y    : yinele
Ctrl+S    : kaydet
Ctrl+Shift+S : farklı kaydet
```

**Kabul ölçütleri:**
- [ ] Kurulum modunda taş ekleme/kaldırma
- [ ] Hamle modunda geçerli/geçersiz hamle ayrımı
- [ ] Ko ihlali hata mesajıyla reddediliyor
- [ ] Tüm klavye kısayolları çalışıyor
- [ ] Undo/Redo 50+ adım

### C.2 — Marker ve Annotation Düzenleme

**Gereksinimler:**

- TR/SQ/CR/MA araç çubuğu (4 ikon)
- LB etiket ekleme (tıkla + yazı girişi)
- Seçili markeri kaldırma (tekrar tıklama veya silgi)
- AR/LN ok ve çizgi (iki nokta seçimi)
- Annotation panel: mevcut annotationları listele, düzenle, sil

**Kabul ölçütleri:**
- [ ] Tüm 7 annotation tipi eklenip kaydedilebiliyor
- [ ] Annotation panel aktif düğümdeki işaretleri gösteriyor
- [ ] SGF round-trip sonrası annotationlar korunuyor (Faz E'de test edilecek)

### C.3 — Hamle Ağacı Görünümü

`desktop/renderer/app.mjs`'de `treeCanvas`, `treeViewport`, `treeList`, zoom kontrolleri zaten mevcut.

**Gereksinimler:**

- Her düğüm: hamle koordinatı, renk, aktif=vurgulu
- Dal ayrımı: ana dal vurgulu, varyantlar soluk
- Ana dala yükseltme (promote): tercih edilen child değiştir
- Düğüm silme: dal sil, bağlı alt dallarıyla

**Kabul ölçütleri:**
- [ ] Grafik ağaç doğru renderleniyor
- [ ] Tıklama ile ağaçta geziniliyor
- [ ] Promote ve delete işlemleri çalışıyor
- [ ] Kogo sözlüğü gibi büyük ağaçlarda lag yok (sanal scroll veya lazy render)

---

## Faz D — Problem Bank Entegrasyonu

### Hedef

Problem Bank JSON dosyaları `.agstudio` belgelerine aktarılabilir; düzenleme sonrası doğrulanmış olarak geri yazılabilir.

### D.1 — Problem Bank Adaptörü

**`studio/adapters/problemBankAdapter.js`**

```
importFromProblemBank(problemId, repoRoot)
  → problem JSON oku (salt-okunur)
  → board, solution, classification alanlarını .agstudio'ya aktar
  → antalyagoSource { problemId, importedAt, sourceHash } doldur
  → belge döndür (henüz kaydedilmez)

exportToProblemBank(agstudioDoc, repoRoot)
  → .agstudio → Problem Bank JSON dönüşümü
  → validateProblem() çalıştır (çift doğrulama)
  → mevcut dosya hash'ini karşılaştır → çakışma varsa uyar
  → kullanıcı onayı iste
  → atomik yazma

checkSyncStatus(agstudioDoc, repoRoot)
  → "in_sync" | "modified" | "conflict" | "not_linked"
```

**Renk dönüşümü (kritik):**
```
.agstudio "black"/"white" ←→ Problem Bank "B"/"W"
board.turn                ←→ board.toPlay
```

### D.2 — Problem Library Panel

- Sol panel: `content/problem-bank/index.json`'dan yüklenen problem listesi
- Arama/filtre: chapter, lesson, status, concept
- İçe aktarma sihirbazı: problem seç → önizle → .agstudio oluştur
- Çakışma göstergesi: `antalyagoSource.syncStatus`

### D.3 — IPC Handler Genişletmesi

`desktop/ipc/problemBankHandlers.cjs`:
```
pb:list-problems
pb:import-problem
pb:check-sync
pb:export-problem  (kullanıcı onayı gerektirir)
```

**Kabul ölçütleri:**
- [ ] Problem listesi kütüphane panelinde görünüyor
- [ ] Import: .agstudio belgesi oluşturuluyor, sourceHash doğru
- [ ] Export: validateProblem() geçmeden yazma yapılmıyor
- [ ] Çakışma: kaynak değişmişse uyarı gösteriliyor
- [ ] Export: kullanıcı onayı olmadan yazma yapılmıyor
- [ ] Export: atomik yazma (tmp → rename)

---

## Faz E — SGF I/O ve İçerik Kütüphanesi

### E.1 — SGF Adapter

**`studio/adapters/sgfAdapter.js`**

```
parseSGF(text) → moveTree (dahili format)
  - tokenize → buildTree (sgf-parser.js'den alınan ve genişletilen mantık)
  - AB/AW/AE → board.stones (formation)
  - PL → board.turn
  - B/W hamleleri → moveTree düğümleri
  - C yorum → node.comment
  - TR/SQ/CR/MA/LB/AR/LN → node.annotations (typed)
  - Bilinmeyen property'ler → node.rawProperties
  - Sıkıştırılmış point list [ul:lr] → açılmış nokta listesi
  - Pass B[]/W[] → {pass:true} hamlesi
  - Koleksiyon → array of moveTrees

formatSGF(moveTree, options?) → string
  - DFS pre-order traversal
  - FF[4]GM[1]CA[UTF-8]AP[AgStudio:1.0]SZ[n] header
  - AB/AW setup → formation
  - ;B[xy] / ;W[xy] hamleler
  - Annotation → TR/SQ/CR/MA/LB/AR/LN
  - rawProperties → olduğu gibi yaz
  - Varyantlar → (;...)(;...) dallar
```

**Test planı (sgf-editor-research.md Bölüm 8.2'den):**
- simple-9x9, 19x19, formation-only, handicap, pass, capture-ko
- deep-variants, many-variants, turkish-comment
- all-markers, unknown-props, collection, partial-corrupt, compressed-points
- Round-trip: SGF → moveTree → SGF (semantik eşdeğerlik)

### E.2 — Node.js fs Wrapper

**`core/problemBank.js:loadProblemBank`** ve **`sgf-parser.js:loadCollections`** browser `fetch` kullanıyor.

Electron main process'te `fs.readFile` ile ikame edilmiş wrapper:

```js
// desktop/ipc/fsLoader.cjs
async function loadFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}
// sgf-parser.js'nin parser kısmı reuse edilir; loading kısmı ikame edilir
```

### E.3 — Formation Tarayıcısı

- Sol panel sekmesi: `formations/` klasöründeki SGF/JSON dosyaları
- Formation SGF → .agstudio içe aktarma
- Müfredat bağlantısı (b1-temel-kurallar/l3-tas-alma/)

### E.4 — Varyant Ağacı Düzenleme (Gelişmiş)

- Düğüm adı (N property) düzenleme
- Dal birleştirme (merge variation)
- Sequans copy-paste (KGS'den ilham)

**Kabul ölçütleri:**
- [ ] Formation SGF içe aktarılıyor, .agstudio belgesi oluşuyor
- [ ] SGF round-trip: all-markers fixture semantik eşdeğerlik
- [ ] Türkçe yorum: mojibake yok
- [ ] Bilinmeyen property'ler korunuyor (unknown-props fixture)
- [ ] SGF export: oluşan dosya CGoban veya Sabaki ile açılıyor
- [ ] `problems/joseki.sgf` ağaç formatı başarıyla parse ediliyor

---

## Faz F — Çıktı Adaptörleri

### F.1 — Problem Bank JSON Export (Tam)

Problem Bank şemasına uygun tam doğrulama ve export. Faz D'deki kısmi implementasyonu tamamlar.

### F.2 — Lesson 3D Step Export

`.agstudio` → `ogren-3d.html` CURRICULUM step formatı. Formation + hamle sekansı + markers.

```js
// Örnek çıktı:
{
  text: `<p>...</p>`,
  size: 9,
  board: [...stones],
  markers: [...annotations],
  moves: [...moveSequence],
  camera: 'center',
  auto: true
}
```

### F.3 — SGF Export

`sgfAdapter.formatSGF()` ile Faz E'den geliyor. Bu faz: dosyaya kaydetme diyaloğu ve export sonrası doğrulama.

### F.4 — PNG/SVG Diagram Export

`studio/boardRenderer.js` SVG üretiyor. Faz F'de: dosyaya kaydet, boyut seçimi, koordinat etiketleri.

### F.5 — Motion JSON Export

Timeline eventleri için export formatı. Şu an kapsam belirsiz — Faz F'de tanımlanacak.

**Kabul ölçütleri (F.2 — Lesson 3D):**
- [ ] Export edilen step, `ogren-3d.html`'de hatasız yükleniyor
- [ ] Markers (TR/SQ/CR/MA) doğru render ediliyor
- [ ] 9x9, 13x13, 19x19 boyutları çalışıyor

---

## Faz G — Paketleme ve Dağıtım

### G.1 — electron-builder Kurulumu

**`desktop/build/electron-builder.yml`:**
```yaml
appId: io.antalyago.studio
productName: AntalyaGo Studio
directories:
  output: dist
win:
  target: nsis
  icon: desktop/assets/icon.ico
  fileAssociations:
    - ext: agstudio
      name: AntalyaGo Studio Document
      icon: desktop/assets/doc-icon.ico
```

### G.2 — Windows NSIS Kurulumu

- Başlat menüsü kısayolu
- Masaüstü kısayolu (opsiyonel)
- `.agstudio` dosya ilişkilendirmesi
- Kaldırma (uninstaller)

### G.3 — Uygulama İkonu

AntalyaGo tasarım sistemiyle uyumlu ikon seti: `.ico`, `.icns`, `.png` (16/32/48/256px).

### G.4 — İlk Çalıştırma Deneyimi

- Workspace klasörü seçimi (dialog)
- Kısa "Nasıl kullanılır" ipucu
- Örnek .agstudio belgesi (geliştirici şablonu)

**Kabul ölçütleri:**
- [ ] `npm run build` → `dist/AntalyaGo Studio Setup.exe`
- [ ] `.agstudio` dosyaya çift tıkla → uygulama açılıyor
- [ ] Kurulum ve kaldırma sorunsuz
- [ ] Başlat menüsünde görünüyor
- [ ] İnternet olmadan açılıyor

---

## Ürün Kararları (Güncel)

### Çözülmüş Kararlar

| Karar | Sonuç | Faz |
|---|---|---|
| Masaüstü teknolojisi | Electron (JS ekosistemi, boardState/ruleEngine doğrudan çalışır) | A.5 |
| Belge formatı | `.agstudio` (düz JSON, human-readable, git-uyumlu) | A.5 |
| SGF bağlantısı | `studio/adapters/sgfAdapter.js` (sgf-parser.js genişletilir) | E.1 |
| Renk sözleşmesi | Dahili `"black"/"white"`, export'ta `"B"/"W"` | D |
| Problem Bank yazma | Atomik + onay + hash kontrolü | D |
| Unknown property | `node.rawProperties` alanında korunur | E.1 |
| Pass canonical | `{color, pass:true, x:null, y:null}` | B.2 |
| joseki.sgf telif | Yalnızca geliştirme/test | Acil |
| Motion/SGF ayrımı | Motion `.agstudio`'da kalır, SGF'e gömülmez | E.1 |

### Açık Kalan Kararlar

1. **Otomatik kayıt:** Her değişimde mi (debounce ~3s) yoksa manuel mi? — Kullanıcı deneyimi etkisi yüksek, Faz C başında karar verilmeli.

2. **Problem Bank repo konumu:** Stüdyo AntalyaGo reposunu nerede bulur? İlk açılışta "kaynak klasörü seç" diyaloğu mu (fleksible ama karmaşık) yoksa settings.json'a sabit yol mu (basit ama esnek değil)?

3. **SGF parser stratejisi:** sgf-parser.js genişlet mi yoksa @sabaki/sgf (MIT, 2019) bağımlılığı mı? Her iki seçenek de Faz E'de geçerli.

4. **Büyük ağaç render stratejisi:** Hamle ağacı grafik görünümü için virtual scroll veya canvas-based render? Kogo sözlüğü 10,000+ düğüm içeriyor.

5. **Birden fazla belge eş zamanlı:** Tek dokümanlı arayüz (şu an) mi yoksa sekme/split view mi?

---

## Öncelik Sıralaması

### Bu hafta (Acil)
1. `problems/tsumego.sgf` — geçerli fixture ile değiştir veya sil
2. `problems/joseki.sgf` — telif uyarısı ekle (NOTES.md veya .gitignore)
3. `moveTree.annotations[]` tipi düzelt (Faz B.1)
4. Pass hamlesi canonical temsili (Faz B.2)
5. `studio-electron.test.js` ve `studio-text-tree.test.js` çalışır hale getir

### Kısa vadeli (2-3 hafta)
6. Etkileşimli tahta: kurulum modu + hamle modu (Faz C.1)
7. Klavye kısayolları (Faz C.1)
8. Marker araç çubuğu (Faz C.2)
9. Grafik hamle ağacı görünümü (Faz C.3)

### Orta vadeli (1-2 ay)
10. Problem Bank adaptörü (Faz D)
11. SGF adapter (Faz E.1)
12. Formation tarayıcısı (Faz E.3)

### Uzun vadeli
13. Çıktı adaptörleri (Faz F)
14. Paketleme (Faz G)
15. Analiz motoru entegrasyonu (Faz H — kapsam dışı şimdilik)

---

## Mimari Kısıtlamalar ve İlkeler

1. **`core/`'a dokunma:** `boardState.js` ve `ruleEngine.js` değiştirilmez — her iki process'te saf JS olarak çalışıyor.

2. **Renderer'da Node.js API kullanılmaz:** Tüm dosya I/O main process'te. preload yalnızca invoke/on kullanır.

3. **Renk modeli:** Dahili her zaman `"black"/"white"`. Dış dönüşüm adapter katmanında.

4. **Bilinmeyen property'ler asla sessizce atılmaz:** `rawProperties` alanında korunur.

5. **Atomik yazma:** Tüm dosya yazma işlemleri `.tmp → rename` zinciri. `fileHandlers.cjs`'deki pattern.

6. **SGF ile motion ayrımı:** `timeline.events[]` SGF'e gömülmez.

7. **Problem Bank salt-okunur kaynak:** Stüdyo `content/problem-bank/` dosyalarını yalnızca onaylı export akışıyla değiştirir.

---

## Sonraki Güncelleme

Bu belge Faz C tamamlandığında (`moveTree` etkileşimli düzenleme) tekrar güncellenecek.  
`desktop-architecture.md` Faz B'nin zaten büyük ölçüde uygulandığını yansıtacak şekilde güncellenecek.
