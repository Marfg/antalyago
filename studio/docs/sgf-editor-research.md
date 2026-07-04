# AG-STUDIO — SGF Motorları ve Go Editörleri Araştırma Raporu

**Faz:** A.5 araştırma kolu  
**Tarih:** 2026-07-04  
**Kapsam:** İç motor denetimi · SGF FF[4] standardı · Editör karşılaştırması · Mimari karar  

---

## 1. AntalyaGo Mevcut SGF Motoru Denetimi

### 1.1 sgf-parser.js — Mevcut Durum

Dosya: `sgf-parser.js` (kök dizin, IIFE modülü)

#### Yetenekler

| Yetenek | Durum | Not |
|---|---|---|
| SGF okuma | ✅ Var | Tokenizer + ağaç kurucusu çalışıyor |
| SGF yazma / export | ❌ Yok | Tamamen eksik |
| Koleksiyon desteği | ✅ Kısmi | `splitCollection()` birden fazla `(...)` bloku ayırıyor |
| Ana dal ve varyantlar | ⚠️ Kayıp | Ağaç ayrıştırılıyor ama düz problem formatına çevriliyor |
| Kurulum taşları (AB/AW/AE) | ✅ Var | Formation olarak okunuyor |
| Gerçek hamleler (B/W) | ✅ Kısmi | Yalnızca çözüm için ilk hamle alınıyor |
| Pass hamlesi | ✅ Var | `coord === '' \|\| coord === 'tt'` kontrol ediliyor |
| Bilinmeyen property koruması | ❌ Yok | `extractProps()` tüm property'leri alıyor ancak düz formata yalnızca belirli alanlar aktarılıyor |
| Ko noktası | ❌ Yok | KO property okunmuyor |
| Handicap (HA) | ❌ Yok | HA property okunmuyor |
| UTF-8 / Türkçe yorum | ⚠️ Kısmi | `cleanText()` ile yorumlar okunuyor; CA property kontrol edilmiyor |
| TR/SQ/CR/MA işaretleri | ❌ Yok | Parser alıyor ama çıktıya aktarılmıyor |
| LB etiket | ⚠️ Ağaç modda | FORMAT B'de LB varlığı problem tespiti için kullanılıyor, içerik alınmıyor |
| AR/LN ok/çizgi | ❌ Yok | Ayrıştırılmıyor |
| VW görünür bölge | ❌ Yok | Ayrıştırılmıyor |
| MN hamle numarası | ❌ Yok | Ayrıştırılmıyor |
| Sıkıştırılmış point list | ❌ Yok | `[ul:lr]` notasyonu işlenmiyor |
| SGF collection import-export | ❌ Yok | Yalnızca okuma + düz formata dönüşüm |
| fetch bağımlılığı | ❌ Node.js'te çalışmaz | `loadCollections()` ve `loadSingle()` browser `fetch` kullanıyor |
| DOM bağımlılığı | ✅ Yok | Parser mantığı temiz |

#### İki Format Modeli

**FORMAT A — Ayrı problem blokları (tsumego tarzı):**
```
(;FF[4]SZ[9]PL[B]AB[cd]AW[ef](;B[fg]))  ← problem 1
(;FF[4]SZ[9]...                          ← problem 2
```
Her `(...)` bloğu tek bir problem → ilk child = doğru hamle, diğerleri = yanlış hamle.

**FORMAT B — Tek büyük ağaç (Kogo sözlüğü tarzı):**
```
(;GM[1]FF[4]SZ[19]...(;B[qc]LB[pd:a]C[...](;W[pd]...)(;W[od]...)))
```
LB veya uzun yorum + birden fazla child = problem noktası kabul ediliyor.

#### Kritik Sorunlar

1. **Veri kaybı garantili:** Her iki format da ağaçları düz `{id, type, level, board, solution, wrong}` yapısına indirgiyor. Varyant ağacı, yorumlar, işaretler, bilinmeyen property'ler, ko, handicap tüm gidiyor.

2. **Yazma yok:** `SGFParser` nesnesinde `stringify`, `serialize`, `generate` veya benzeri hiçbir fonksiyon yok.

3. **Canonical pass eksik:** `coord === '' || coord === 'tt' || coord === 'pass'` — üç farklı pass temsili kabul ediliyor, canonical'ı ne?

4. **CA property görmezden geliniyor:** SGF'in varsayılan karakter seti ISO-8859-1'dir, UTF-8 değil. CGoban'ın `CA[UTF-8]` koymasıyla mevcut SGF'ler çalışıyor; CA kontrol edilmeyince bozuk Türkçe karakterler fark edilmeyebilir.

5. **Derinlik limiti:** FORMAT B'de `if (moveStack.length < 30)` ile maksimum 30 hamle derinliğinde incelenebiliyor.

### 1.2 studio/model/moveTree.js — Güçlü Temel

Bu dosya SGF'in iç veri modelini zaten karşılıyor:

| moveTree kavramı | SGF karşılığı |
|---|---|
| `root.formation.stones[]` | AB/AW kurulum taşları |
| `root.formation.turn` | PL property |
| `node.move.{x,y,color}` | B/W hamle property |
| `node.move.capture[]` | Yakalama sonrası kaldırılan taşlar |
| `node.children[]` | SGF varyant dalları `(;...)` |
| `node.preferredChildId` | Ana dal (SGF'de explicit değil — ilk child convention) |
| `node.comment` | C property |
| `node.annotations[]` | TR/SQ/CR/MA/LB/AR/LN — **şu an string[], tip ayrımı yok** |
| `node.id` | Dahili, SGF karşılığı yok (N property ile eşlenebilir) |

**Eksikler:**

- `annotations[]` şu an `string[]` — SGF markup'ı için `{type, x, y, label}` yapısına genişletilmeli
- Bilinmeyen property'leri tutacak `rawProperties` veya `extensions._sgf_raw` alanı yok
- `node.formation` yalnızca root'ta, ara düğümlerde yok — hamle zinciri rebuild gerektiriyor (ok, `rebuildBoardState()` var)
- Pass hamlesi temsili belirsiz (`move: null` mı?)
- Sıkıştırılmış point list desteği yok

### 1.3 desktop/ — Faz B Büyük Ölçüde Uygulanmış

**Kritik Bulgu:** Önceki oturumda yazılan `desktop-architecture.md` belgesi, `desktop/` klasörünün henüz var olmadığını varsayıyordu. Ancak bu klasör zaten büyük ölçüde uygulanmış:

| Dosya | İçerik |
|---|---|
| `desktop/main.cjs` | Tam Electron main process, BrowserWindow, dialog, IPC handler bağlamaları |
| `desktop/preload.cjs` | contextBridge IPC sözleşmesi |
| `desktop/config.cjs` | Ayarlar, varsayılan workspace yolu |
| `desktop/ipc/ipcChannels.cjs` | STUDIO_CHANNELS sabitleri (12 kanal) |
| `desktop/ipc/studioApi.cjs` | Renderer API wrapper |
| `desktop/ipc/pathPolicy.cjs` | `.agstudio` yol doğrulaması, path.relative() savunması |
| `desktop/ipc/settingsStore.cjs` | Ayar okuma/yazma |
| `desktop/ipc/fileHandlers.cjs` | .agstudio açma/kaydetme/listeleme, atomik yazma |
| `desktop/ipc/studioBoardAdapter.js` | moveTree ↔ BoardState köprüsü |
| `desktop/ipc/studioBoardAdapter.cjs` | CJS sarmalayıcı |
| `desktop/renderer/app.mjs` | Tam renderer uygulaması: moveTree UI, board, library, tree viewport |
| `desktop/renderer/studio.css` | Renderer stilleri |
| `desktop/index.html` | Electron giriş sayfası |

`renderer/app.mjs` içindeki `elements` nesnesi şunları ima ediyor: hamle ağacı görünümü (viewport, canvas, path, list), zoom kontrolleri, promoteVariant, addChildMove, deleteMoveNode, tüm moveTree API'leri kullanılıyor. **Bu, hamle ağacı editörünün zaten var olduğu anlamına gelir.**

### 1.4 Formations SGF Dosyaları İncelemesi

| Dosya | İçerik | Kullanım |
|---|---|---|
| `formations/b1-temel-kurallar/l3-tas-alma/3. adım.sgf` | 9x9, B hamlesi + AW/AB kurulum | Referans — motor okumadı |
| `formations/b1-temel-kurallar/l4-yasak-hamleler/*.sgf` | 9x9, AW/AB kurulum + SQ işareti | Referans |
| `formations/b1-temel-kurallar/l5-ko-kurali/1. adım.sgf` | 9x9, ko pozisyonu + SQ işareti | Referans |
| `formations/b2-temel-teknikler/l7-canli-gruplar/1. adım.sgf` | **19x19**, TR/SQ göz işaretleri, 100+ taş | CURRICULUM'a elle aktarıldı |
| `problems/joseki.sgf` | Kogo's Joseki Dictionary, 19x19, büyük varyant ağacı | FORMAT B parsera örnek |
| `problems/tsumego.sgf` | Bozuk (sadece bir git commit mesajı içeriyor) | ❌ Geçersiz dosya |

**önemli:** `tsumego.sgf` bir Go SGF dosyası değil — içeriği `"Commit changes"` string'i. Bu dosya ya silinmeli ya da doğru bir tsumego SGF ile değiştirilmeli.

### 1.5 content/problem-bank/ Durumu

3 problem JSON dosyası mevcut: `b1-l2-liberty-count-0001`, `b1-l3-capture-0001`, `b2-l10-ladder-sequence-0001`. Bunlar `core/problemBank.js`'in `validateProblem()` ile doğrulanan tam formatı kullanıyor. SGF bağlantısı yok — pozisyonlar elle girilmiş.

---

## 2. SGF FF[4] Destek Matrisi

### 2.1 Standart Özeti

SGF FF[4] (Smart Game Format, dosya formatı 4), Arno Hollosi tarafından yazılmış ve donmuş bir standarttır. Son güncelleme ~2000'li yıllardandır; değişmeyeceği bekleniyor.

**Kaynak:** https://www.red-bean.com/sgf/properties.html (erişim: 2026-07-04)

### 2.2 Temel Yapı

```sgf
collection  = GameTree+
GameTree    = "(" Sequence Variation* ")"
Sequence    = Node+
Node        = ";" Property*
Property    = PropIdent PropValue+
PropIdent   = [A-Z]+
PropValue   = "[" CValueType "]"
```

**Varyant örneği:**
```sgf
(;GM[1]FF[4]SZ[9]
  (;B[cc]
    (;W[cd]C[ana dal])
    (;W[dc]C[varyant])
  )
)
```

**Koleksiyon:** Birden fazla `(...)` bloğu — `splitCollection()` bunu zaten yapıyor.

### 2.3 Metin Encoding Kuralları

- **Default charset:** ISO-8859-1 (FF[4] spec). UTF-8 için `CA[UTF-8]` zorunlu.
- **Kaçış:** `\` sonraki karakteri literal yapar. `\]` kapanan köşeli parantez, `\\` ters eğik çizgi.
- **Yumuşak satır sonu (Text):** `\<newline>` → kaldırılır (birleştirme işareti).
- **Sert satır sonu (Text):** `<newline>` → korunur.
- **SimpleText:** Tüm satır sonları boşluğa dönüştürülür.
- **Türkçe:** `CA[UTF-8]` varsa ve uygulama doğru işliyorsa OK. CGoban çıktıları zaten `CA[UTF-8]` koyuyor.

### 2.4 Sıkıştırılmış Point List

`TR[aa:cc]` → (0,0)-(2,2) dikdörtgendeki tüm noktalar.  
Sadece AB/AW/AE/TR/SQ/CR/MA/LB değer listelerinde geçerli.  
**AntalyaGo'da hiçbir yerde desteklenmiyor — l7 SGF'indeki TR/SQ noktaları şans eseri tek tek listelenmiş.**

### 2.5 FF[4] Property Destek Planı

| Property | Açıklama | AG-STUDIO Hedef |
|---|---|---|
| **Kök / Oyun Bilgisi** | | |
| FF[4] | Dosya formatı | Tam — her zaman FF[4] yazılmalı |
| GM[1] | Oyun tipi (1=Go) | Tam |
| SZ[9/13/19] | Tahta boyutu | Tam |
| CA[UTF-8] | Karakter seti | Tam — her zaman CA[UTF-8] yazılmalı |
| AP[AgStudio:1.0] | Uygulama | Tam — export'ta eklenmeli |
| RU[Japanese] | Kural seti | Round-trip koruma |
| KM[6.5] | Komi | Round-trip koruma |
| HA[2] | Handicap taş sayısı | Round-trip koruma |
| RE[B+R] | Sonuç | Round-trip koruma |
| PB/PW | Oyuncu adları | Round-trip koruma |
| DT | Tarih (ISO) | Round-trip koruma |
| EV/PC/RO | Etkinlik/yer/tur | Round-trip koruma |
| GN | Oyun adı | Kısmi (title alanına) |
| GC | Oyun yorumu | Kısmi (summary alanına) |
| **Kurulum** | | |
| AB | Siyah taş ekle | Tam |
| AW | Beyaz taş ekle | Tam |
| AE | Taş kaldır | Tam |
| PL[B/W] | Sıradaki oyuncu | Tam |
| **Hamleler** | | |
| B[xy] | Siyah hamle | Tam |
| W[xy] | Beyaz hamle | Tam |
| B[] / W[] | Pass | Tam (null move olarak) |
| KO | İllegal hamleye izin | Round-trip koruma |
| MN | Hamle numarası | Round-trip koruma |
| **Yorum / Etiket** | | |
| C | Yorum (Text) | Tam |
| N | Düğüm adı (SimpleText) | Tam |
| **Düğüm değerlendirmesi** | | |
| GB/GW | Siyah/Beyaz için iyi | Round-trip koruma |
| DM | Dengeli pozisyon | Round-trip koruma |
| UC | Belirsiz pozisyon | Round-trip koruma |
| TE/DO/IT/BM | Hamle kalitesi | Round-trip koruma |
| HO | Sıcak nokta | Round-trip koruma |
| **İşaretler** | | |
| TR | Üçgen | Tam |
| SQ | Kare | Tam |
| CR | Daire | Tam |
| MA | X işareti | Tam |
| LB[xy:A] | Etiket | Tam |
| AR[xy:xy] | Ok | Kısmi (import'ta tam, export'ta basit) |
| LN[xy:xy] | Çizgi | Kısmi |
| VW | Görünür bölge | Round-trip koruma |
| DD | Soluk noktalar | Round-trip koruma |
| **Bilinmeyen** | | |
| Diğer tüm property'ler | Özel/gelecek | Round-trip koruma (`extensions._sgf_raw`) |

**Kategoriler:**
- **Tam:** Parse et, internal modele aktar, export'ta yeniden yaz
- **Kısmi:** Parse et ve dahili alanda sakla, export'ta kısmi
- **Round-trip koruma:** Parse et, `_sgf_raw` içinde sakla, export'ta olduğu gibi yaz (anlam kaybı yok)

### 2.6 Bozuk / Kısmen Geçerli SGF

Spec'e göre: bilinmeyen property'ler korunmalı, bozuk gameinfo property'leri düzeltilebilir, diğer bozuk property'ler silinmeli (uyarıyla). AG-STUDIO için strateji: **güvenli parse et, bilinen property'leri aktar, bilinmeyenleri `_sgf_raw`'a koy, hiçbir zaman sessizce veri kaybetme.**

---

## 3. Editör Karşılaştırması

Web erişimi bu araştırma için kullanıldı. Erişim tarihi: 2026-07-04. Bazı özellikler doğrudan kullanıcı deneyiminden değil, belge ve kaynak koddan alındı.

### 3.1 Sabaki

**Platform:** Electron (macOS/Windows/Linux) · **Lisans:** MIT · **Son sürüm:** v0.52.2 (Eylül 2022) · **Durum:** Aktif geliştirme durmuş görünüyor

**Kaynak:** https://github.com/SabakiHQ/Sabaki

| Özellik | Durum |
|---|---|
| Başlangıç formasyonu düzenleme | ✅ Edit modu |
| Hamle ekleme/silme | ✅ |
| Varyant oluşturma ve ana dala yükseltme | ✅ Copy & paste variations |
| Hamle ağacı sunumu | ✅ Fast game tree (grafik) |
| Klavye gezinmesi | ✅ Arrow keys |
| Yorum ve düğüm adı | ✅ Markdown desteği |
| TR/SQ/CR/MA işaretleri | ✅ Dahil lines & arrows |
| LB etiket | ✅ |
| AR/LN ok/çizgi | ✅ SGF4 uyumlu |
| Problem/çözüm ağacı | ⚠️ Genel editör, özel problem modu yok |
| SGF import/export | ✅ Tam, koleksiyon dahil |
| Bilinmeyen property koruması | ✅ (@sabaki/sgf kütüphanesi ile) |
| Analiz motoru entegrasyonu | ✅ GTP desteği |
| Büyük ağaçlarda kullanılabilirlik | ✅ Kogo sözlüğü test edilmiş |
| Geri alma/yineleme | ✅ Güçlü undo/redo |
| Otomatik kayıt/kurtarma | ⚠️ Bilgi yok |

**Güçlü yönler:** Electron tabanlı olması bizimle aynı ekosistem. @sabaki/sgf kütüphanesi MIT. Grafik ağaç görünümü. Tam SGF round-trip.

**Zayıf yönler:** 2022'den beri güncelleme yok. Problem/pedagoji özellikleri yok. Genel editör — AntalyaGo'nun problem-pedagoji senaryoları için özel bir araç değil.

**AG-STUDIO için ders:** Sabaki'nin @sabaki/sgf kütüphanesi ve grafik ağaç görünümü yaklaşımı referans alınabilir. Görsel kopyalama yapılmıyor — işlevsel kalıplar öğreniliyor.

---

### 3.2 KGS / CGoban 3

**Platform:** Java masaüstü · **Lisans:** Özel (dağıtım ücretsiz) · **Durum:** Aktif (KGS sunucusu aktif)

**Kaynak:** https://www.gokgs.com/help/app/editor.html

| Özellik | Durum |
|---|---|
| Başlangıç formasyonu düzenleme | ✅ F2 (Edit modu) |
| Hamle ekleme/silme | ✅ F1 (Move modu) |
| Varyant oluşturma | ✅ Cut/paste game tree parts |
| Hamle ağacı sunumu | ✅ Named nodes görünümü |
| Klavye gezinmesi | ✅ F1-F8 araç kısayolları |
| Yorum ve düğüm adı | ✅ Her düğüme ad verilebilir |
| TR/SQ/CR işaretleri | ✅ F4/F5/F6 |
| LB etiket | ✅ F7 |
| MA (X işareti) | ⚠️ Belirsiz |
| AR/LN | ❌ Yok |
| Problem modu | ⚠️ Yok (genel editör) |
| SGF import/export | ✅ Tam |
| Bilinmeyen property koruması | ✅ (belgelenmemiş ama büyük ihtimalle var) |
| Online işbirliği | ✅ Gerçek zamanlı paylaşım |
| Geri alma/yineleme | ✅ |
| Otomatik kayıt | ❌ Manuel |

**Güçlü yönler:** Move modu / Edit modu ayrımı nettir (anlık sezgisel öğrenme). Kurumsal kalitede SGF işleme. Online paylaşım eşsiz.

**Zayıf yönler:** Java teknolojisi eski. Kurulum karmaşık. UI 2000'lerin tasarımı. Ağaç görünümü grafik değil.

**AG-STUDIO için ders:** **Move/Edit modu ayrımı en önemli UX kararı.** Tahta üzerinde "kurulum modu" vs "hamle modu" — kullanıcının hangi modda olduğunu her zaman açıkça göster.

---

### 3.3 OGS İnceleme Tahtası / Demo Tahtası

**Platform:** Web (React) · **Lisans:** Özel (kaynak kısmen açık) · **Durum:** Aktif

**Kaynak:** https://ogs.readme.io/docs/reviews-and-demos (erişim: 2026-07-04)

| Özellik | Durum |
|---|---|
| Başlangıç formasyonu düzenleme | ✅ Tekli renk modu |
| Hamle ekleme/silme | ✅ |
| Varyant oluşturma | ✅ Otomatik dal |
| Hamle ağacı sunumu | ✅ (detay bilinmiyor) |
| Klavye gezinmesi | ✅ ←→ PgUp/PgDn Home/End |
| Yorum | ✅ Düğüm bazlı yorum kutusu |
| TR/SQ/CR/MA + freehand çizim | ✅ 5 araç (stone, label, draw, erase, delete) |
| LB etiket | ✅ Label aracı |
| Gerçek zamanlı işbirliği | ✅ OGS'nin öne çıkan özelliği |
| Problem modu | ❌ Yok |
| SGF import/export | ⚠️ Import var, export belgelenmemiş |
| "Break away" — bağımsız keşif | ✅ Benzersiz özellik |

**Güçlü yönler:** Freehand çizim öğrenme için güçlü. Gerçek zamanlı işbirliği emsalsiz. Klavye kısayolları standart ve sezgisel. "Break away" — başka bir kullanıcı inceleme yaparken kendi varyantını keşfedebilme — pedagogik açıdan değerli.

**Zayıf yönler:** Web bağımlı. Analiz motoru entegrasyonu sınırlı. Problem oluşturma yok. SGF export akışı belirsiz.

**OGS ile KGS arasındaki temel fark:** OGS işbirliğini ön plana alıyor; KGS editör derinliğini. OGS çizim aracı pedagojik gösterim için; KGS varyant ağacı analiz için.

**AG-STUDIO için ders:** Klavye kısayolları OGS standardını takip et (←→ için hamle, PgUp/PgDn için 10 hamle). "Break away" olmayacak ama **"inceleme modu"** vs **"düzenleme modu"** ayrımı değerli.

---

### 3.4 KaTrain

**Platform:** Python/Qt masaüstü · **Lisans:** MIT · **Durum:** Aktif (KataGo ile)

**Kaynak:** https://github.com/sanderland/katrain

| Özellik | Durum |
|---|---|
| Başlangıç formasyonu düzenleme | ⚠️ Sınırlı |
| Hamle ekleme | ✅ Hamle ekle |
| Düğüm silme | ✅ Ctrl+Delete |
| Varyant oluşturma | ✅ Otomatik |
| Klavye gezinmesi | ✅ ↑/↓ dal değiştirme, PgUp ana dal |
| Yorum | ⚠️ Sınırlı |
| Markup | ⚠️ Belgelenmemiş |
| SGF import | ✅ Clipboard (Ctrl+V) |
| SGF export | ✅ Clipboard (Ctrl+C) |
| Analiz motoru | ✅ KataGo entegrasyonu — birincil özellik |
| Problem modu | ❌ Yok |
| Bilinmeyen property koruması | Bilinmiyor |

**Güçlü yönler:** AI analiz için en kapsamlı araç. Hata maliyeti görselleştirmesi (noktalar ne kadar kayıplandığını gösteriyor) pedagogik açıdan güçlü.

**Zayıf yönler:** Python bağımlı. SGF editörü yardımcı araç, birincil odak değil. Kurulum karmaşık (KataGo motoru gerekiyor).

**AG-STUDIO için ders:** KaTrain'in AI analiz entegrasyonu Faz G sonrası hedeftir. Şu an kapsam dışı.

---

### 3.5 Lizzie / LizGoban

**Platform:** Java (Lizzie) / Electron (LizGoban) · **Lisans:** GPL · **Durum:** Lizzie eskimiş; LizGoban aktif

**Kaynak:** https://github.com/kaorahi/lizgoban

| Özellik | Durum |
|---|---|
| SGF açma/kaydetme | ✅ Analiz dahil |
| Varyant görüntüleme | ✅ |
| SGF editörü | ⚠️ Yardımcı araç |
| Analiz motoru | ✅ Leela Zero / KataGo |
| Markup | ❌ Yok |

**AG-STUDIO için ders:** Analiz motoru entegrasyonu için referans. GPL lisansı — kod kopyalanamaz. Yaklaşım öğrenilebilir.

---

### 3.6 SmartGo

**Platform:** iOS/Mac (commercial) · **Lisans:** Ticari · **Durum:** Aktif

**Kaynak:** https://smartgo.com/

| Özellik | Durum |
|---|---|
| Başlangıç formasyonu düzenleme | ✅ |
| Hamle ekleme/silme | ✅ Kolaylaştırılmış |
| iCloud sync | ✅ |
| Büyük veritabanı (137k+ oyun) | ✅ |
| Markup | ⚠️ Sınırlı belge |
| SGF import/export | ✅ |
| Zipped SGF collections | ✅ |

**AG-STUDIO için ders:** Inline game info düzenleme (popup olmadan) UX iyi. "Position as SGF" kopyalama özelliği basit ama güçlü. Ticari — kod kullanılamaz.

---

### 3.7 WGo.js / BesoGo (Web Kütüphaneleri)

**WGo.js:** https://github.com/waltheri/wgo.js · MIT lisans · Canvas tabanlı görüntüleyici/oynatıcı. SGF okuma var, yazma sınırlı.

**BesoGo:** https://github.com/yewang/besogo · MIT lisans · Saf JS, bağımlılık yok, üç modda çalışır: editör / görüntüleyici / diagram. SGF editörü olarak kullanılabilir.

**AG-STUDIO için değerlendirme:** BesoGo'nun yaklaşımı (bağımlılıksız, üç mod) AntalyaGo felsefesiyle uyumlu. Ancak doğrudan bağımlılık eklenmeyecek — davranıştan öğrenilecek.

---

## 4. Kaynak Bağlantıları ve Erişim Tarihleri

| Kaynak | URL | Erişim |
|---|---|---|
| SGF FF[4] property listesi | https://www.red-bean.com/sgf/properties.html | 2026-07-04 |
| SGF FF[4] tam spec | https://www.red-bean.com/sgf/sgf4.html | 2026-07-04 |
| SGF Wikipedia | https://en.wikipedia.org/wiki/Smart_Game_Format | 2026-07-04 |
| Sabaki GitHub | https://github.com/SabakiHQ/Sabaki | 2026-07-04 |
| @sabaki/sgf npm | https://www.npmjs.com/package/@sabaki/sgf | 2026-07-04 (403 dönüldü) |
| @sabaki/sgf GitHub | https://github.com/SabakiHQ/sgf | 2026-07-04 |
| KGS SGF Editor | https://www.gokgs.com/help/app/editor.html | 2026-07-04 |
| OGS Docs | https://ogs.readme.io/docs/reviews-and-demos | 2026-07-04 |
| KaTrain GitHub | https://github.com/sanderland/katrain | 2026-07-04 |
| LizGoban GitHub | https://github.com/kaorahi/lizgoban | 2026-07-04 |
| SmartGo blog | https://smartgo.blog/2022/04/07/smartgo-one-ui/ | 2026-07-04 |
| WGo.js GitHub | https://github.com/waltheri/wgo.js | 2026-07-04 |
| BesoGo GitHub | https://github.com/yewang/besogo | 2026-07-04 |
| smartgame npm | https://github.com/neagle/smartgame | 2026-07-04 |

**Doğrudan test edilemeyen kaynaklar:** OGS demo board arayüzü (giriş gerektiriyor), SmartGo iOS uygulaması, CGoban 3 masaüstü uygulaması.

---

## 5. Lisans Değerlendirmesi

| Araç / Kütüphane | Lisans | Kullanım Uygunluğu |
|---|---|---|
| @sabaki/sgf | MIT | ✅ Bağımlılık olarak eklenebilir, kod kopyalanabilir |
| Sabaki (editör) | MIT | ✅ Referans — kod kopyalanabilir ama tercih edilmez |
| WGo.js | MIT | ✅ Referans veya bağımlılık olarak kullanılabilir |
| BesoGo | MIT | ✅ Referans veya bağımlılık olarak kullanılabilir |
| smartgame | MIT | ✅ Referans olarak kullanılabilir |
| KGS/CGoban | Özel | ❌ Kod kopyalanamaz |
| OGS | Kaynak kısmen açık | ⚠️ Lisans net değil — kod kopyalanmaz |
| KaTrain | MIT | ✅ Python — direkt kullanılamaz, yaklaşım öğrenilebilir |
| LizGoban | GPL | ❌ GPL bulaşıcı — kod kopyalanamaz |
| SmartGo | Ticari | ❌ Kullanılamaz |
| Kogo's Joseki Dictionary (joseki.sgf) | Özel copyright | ❌ Yeniden dağıtım izin gerektirir — üretimde kullanılmamalı |

**Kritik not — joseki.sgf:** Dosya içinde açıkça belirtilmiş: "Commercial distribution without permission... is a copyright violation." Bu dosya yalnızca geliştirme/test amaçlı kullanılmalı, üretim veritabanına dahil edilmemeli.

---

## 6. Önerilen SGF Mimarisi

### 6.1 Analiz: Mevcut Boşluk

```
Mevcut durum:
  sgf-parser.js ──(tek yön, kayıplı)──> flat problem format
  moveTree.js   ──(kendi başına)──>      variant tree (SGF bağlantısı yok)

Hedef durum:
  .agstudio (moveTree) ←──── SGF Adapter ────> .sgf dosyası
                              (iki yönlü, kayıpsız)
```

### 6.2 Seçenek Karşılaştırması

| Seçenek | Veri kaybı | Varyant doğruluğu | Lisans | Bakım | Electron | Test |
|---|---|---|---|---|---|---|
| **A. sgf-parser.js geliştir** | Düşük (düzeltince) | Tam | Yok (kendi kod) | Biziz | ✅ | Birim test yazılır |
| **B. @sabaki/sgf kullan** | Çok düşük | Tam (test edilmiş) | MIT | 2019'dan beri yok, ama spec donmuş | ✅ | Sabaki test suite var |
| **C. Hibrit: @sabaki/sgf + adapter** | Çok düşük | Tam | MIT | @sabaki/sgf stable, adapter biziz | ✅ | İki katman test |
| **D. BesoGo / WGo.js** | Düşük | Kısmi | MIT | Aktif değil | ✅ | Değişken |

### 6.3 Karar: Seçenek A + C Hibrit

**`studio/adapters/sgfAdapter.js` — yeni modül (Faz E)**

Mimari:
```
.agstudio (moveTree) 
    ↓ (adapter: toSGF)     ↑ (adapter: fromSGF)
Intermediate SGF tree        Intermediate SGF tree
    ↓ (serializer)           ↑ (parser)
.sgf metin                  .sgf metin
```

**Ara katman seçimi:**

- İlk aşama: `sgf-parser.js` tokenizer + ağaç kurucusu **korunur ve genişletilir** — yazma desteği ve property preservation eklenir. Bu sıfırdan yazma değil, mevcut kodu genişletme.
- Eğer bu çok karmaşık hale gelirse: @sabaki/sgf bağımlılık olarak eklenir (MIT, donmuş spec için kabul edilebilir).

**Gerekçe:**  
AntalyaGo Go problemleri ve ders formasyonlarıyla çalışıyor — tam joseki ağacı gibi dev SGF dosyaları değil. sgf-parser.js'in tokenizer ve ağaç kurucusu sağlam; yalnızca property preservation ve stringify eksik. Bu boşluk ~200 satır kodla kapatılabilir. Dış bağımlılık olmadan, test edilebilir, Electron uyumlu.

---

## 7. AG-STUDIO Veri Eşleme Modeli

### 7.1 SGF → .agstudio Dönüşümü

```
SGF root node properties:
  FF[4]        → (doğrulama) agstudioVersion oluşturulurken kontrol
  GM[1]        → (doğrulama) Go değilse reddet
  SZ[9]        → board.size
  CA[UTF-8]    → encoding kontrolü, eksikse uyar
  AP[...]      → extensions._sgf_raw.AP (korunur)
  RU[Japanese] → extensions._sgf_raw.RU (korunur)
  KM[6.5]      → extensions._sgf_raw.KM (korunur)
  HA[2]        → extensions._sgf_raw.HA (korunur)
  RE[B+R]      → extensions._sgf_raw.RE (korunur)
  PB/PW        → extensions._sgf_raw.PB / .PW (korunur)
  GN           → title (varsa)
  GC           → summary (varsa)
  DT           → extensions._sgf_raw.DT (korunur)

SGF setup node (ilk düğüm veya root):
  AB[xy]...    → board.stones: [{color:'black', x, y}, ...]
  AW[xy]...    → board.stones: [{color:'white', x, y}, ...]
  AE[xy]...    → board.stones'dan kaldır
  PL[B]        → board.turn: 'black'
  PL[W]        → board.turn: 'white'

SGF move node → moveTree node:
  ;B[xy]       → node.move: {color:'black', x, y}
  ;W[xy]       → node.move: {color:'white', x, y}
  ;B[]         → node.move: {color:'black', pass:true}  (pass)
  C[metin]     → node.comment
  N[ad]        → node.annotations ekle: {type:'node-name', text: ad}
  TR[xy]...    → node.annotations ekle: {type:'triangle', x, y}
  SQ[xy]...    → node.annotations ekle: {type:'square', x, y}
  CR[xy]...    → node.annotations ekle: {type:'circle', x, y}
  MA[xy]...    → node.annotations ekle: {type:'cross', x, y}
  LB[xy:A]     → node.annotations ekle: {type:'label', x, y, text:'A'}
  AR[from:to]  → node.annotations ekle: {type:'arrow', from:{x,y}, to:{x,y}}
  LN[from:to]  → node.annotations ekle: {type:'line', from:{x,y}, to:{x,y}}
  VW[ul:lr]    → node.annotations ekle: {type:'viewport', region:{ul,lr}}
  Diğerleri    → node.rawProperties: {PROPNAME: [değerler]}

Varyantlar:
  (;B[cc]        → root → child[0] (preferredChild = true)
    (;W[cd])     → child[0] → child[0]
    (;W[dc])     → child[0] → child[1] (varyant)
  )

SGF koleksiyon (birden fazla oyun):
  splitCollection() ile böl
  Her oyun ayrı .agstudio belgesi olarak import edilir
  Toplu import → liste sunumu
```

### 7.2 .agstudio → SGF Dönüşümü

```
.agstudio root:
  board.size     → SZ[n]
  board.turn     → PL[B|W]  (eğer != 'black' default)
  board.stones   → AB[...] AW[...] ayrı ayrı (sıkıştırılmamış)
  title          → GN[title]  (varsa)
  summary        → GC[summary]  (varsa)
  audit.createdAt→ DT[YYYY-MM-DD]
  extensions._sgf_raw → tüm orijinal property'ler round-trip

moveTree traversal (DFS, pre-order):
  node.move      → ;B[xy] veya ;W[xy] veya ;B[] (pass)
  node.comment   → C[yorum]  (varsa)
  node.annotations → TR/SQ/CR/MA/LB/AR/LN  (türüne göre)
  node.rawProperties → olduğu gibi yaz
  node.children  → her child için (;...) bloğu aç

Varyantlar:
  preferredChild önce yazılır (ana dal convention)
  Diğer childlar sonra yazılır

Header:
  (;GM[1]FF[4]CA[UTF-8]AP[AgStudio:1.0]SZ[n]...
```

### 7.3 Motion Verisi — SGF Dışında Tutulacak

`.agstudio` dosyasındaki `timeline.events[]` (animasyon, kamera, bekleme zamanlaması) SGF'e **kesinlikle gömülmez**.

SGF, Go oyun/problem mantığını taşır. Motion/timeline verisi `.agstudio`'ya özeldir.

**İsteğe bağlı gelecek:** Eğer gerekirse özel property `AGST[...]` kullanılabilir. Ancak bu, bilinmeyen property olarak other uygulamalar tarafından görmezden gelinecek — kabul edilebilir.

### 7.4 Problem Bank ↔ .agstudio ↔ SGF Üçgeni

```
Problem Bank JSON (B/W renk, toPlay)
    ↕ problemBankAdapter (Faz D)
.agstudio (black/white renk, board.turn)
    ↕ sgfAdapter (Faz E)
.sgf (B/W renk, PL property)
```

Renk dönüşümü yalnızca adapter katmanlarında yapılır. İç veri modeli her zaman `"black"/"white"` kullanır.

---

## 8. Test ve Fixture Stratejisi

### 8.1 Semantik Eşdeğerlik vs Byte-for-byte Eşitlik

**Semantik eşdeğerlik:** Parse edilmiş ağaç, aynı düğümlere, aynı taşlara, aynı yorumlara sahip.

**Byte-for-byte eşitlik:** Mümkün değil. SGF'de property sırası, whitespace, yorum encoding farklılıkları olabilir. **Test hedefi semantik eşdeğerliktir.**

### 8.2 Test Fixture Planı

```
tests/fixtures/sgf/
  ├── simple-9x9.sgf          — 2 oyuncu, 10 hamle, yorum
  ├── simple-19x19.sgf        — 19x19, 50 hamle
  ├── formation-only.sgf      — AB/AW/PL, hamle yok
  ├── handicap.sgf            — HA[4], yerleştirilmiş taşlar
  ├── pass.sgf                — B[], W[] pass hamleleri
  ├── capture-ko.sgf          — yakalama + ko senaryosu
  ├── deep-variants.sgf       — 5 derinlik, her düğümde 3 varyant
  ├── many-variants-1node.sgf — tek düğümde 10+ varyant
  ├── turkish-comment.sgf     — CA[UTF-8], Türkçe C[...] yorumlar
  ├── all-markers.sgf         — TR SQ CR MA LB AR LN tümü
  ├── unknown-props.sgf       — CUSTOM[değer] bilinmeyen property
  ├── collection.sgf          — 3 oyun tek dosyada
  ├── partial-corrupt.sgf     — bozuk property, geçersiz coord
  └── compressed-points.sgf   — AB[aa:cc] sıkıştırılmış
```

### 8.3 Round-trip Test Kategorileri

| Test | Beklenti |
|---|---|
| SGF → moveTree → SGF | Semantik eşdeğerlik |
| Problem Bank → .agstudio → Problem Bank | Tam eşitlik (lossless) |
| .agstudio → SGF → .agstudio | Semantik eşdeğerlik (round-trip meta kayıpları kabul) |
| Bilinmeyen property | `rawProperties` içinde korunmuş |
| Türkçe yorum | Encoding bozukluğu (mojibake) yok |
| Pass hamlesi | Canonical temsil korunmuş |
| Sıkıştırılmış point list | Açılmış, tekrar sıkıştırılmadan yazılmış (kabul edilebilir) |
| Bozuk coord | Hata fırlatılmış, sessiz veri kaybı yok |
| Koleksiyon import | Her oyun ayrı .agstudio belgesi |

### 8.4 Veri Kaybı ve Canonicalization

Kabul edilen farklar (semantik eşdeğerlik ihlali değil):
- Property sırası değişebilir
- Whitespace normalleşir
- Soft line break `\<newline>` → kaldırılır ve geri yazılmaz
- Sıkıştırılmış point list → açılmış olarak tekrar yazılır (veri kaybı yok, format değişimi var)
- AP[CGoban:3] → AP[AgStudio:1.0] (export'ta değişir)

Kabul edilmeyen (bu durumda test başarısız sayılır):
- Herhangi bir B/W hamlesi veya setup taşı kaybı
- Yorum metni kaybı veya bozulması
- Varyant dalı kaybı
- Bilinmeyen property kaybı (rawProperties'e kaydedilmemişse)

---

## 9. AG-STUDIO Yol Haritasına Etkisi

### 9.1 Mevcut Durumun Yeniden Değerlendirmesi

`desktop/` klasörü zaten mevcut ve büyük ölçüde işlevsel. `desktop-architecture.md` belgesi bu klasörün var olmadığını varsayıyordu — **belge güncellenmeli**.

`studio/model/moveTree.js` SGF variant tree'nin iç modelini zaten sağlıyor. Eksik yalnızca SGF I/O (parse ve serialize).

### 9.2 Araştırmanın Getirdiği Yeni Öncelikler

1. **`tsumego.sgf` bozuk** — ya silinmeli ya da geçerli bir tsumego SGF ile değiştirilmeli.

2. **`joseki.sgf` telif hakkı sorunu** — sadece geliştirme/test için kullanılmalı, üretimde dağıtılmamalı.

3. **`moveTree.js`'deki `annotations[]` genişletilmeli** — şu an `string[]`, SGF markup için `{type, x, y, label, from, to}` yapısına genişletilmeli.

4. **Sıkıştırılmış point list desteği** — `l7-canli-gruplar/1. adım.sgf` gibi dosyalar şu an şans eseri tek-tek listelenmiş; parser bu formatı desteklemeli.

5. **Pass hamlesi temsili** — `moveTree.js`'de pass hamlesinin canonical temsili tanımlanmalı (`move: null` mı? `move: {pass: true}` mı?).

### 9.3 SGF Entegrasyonu için Önerilen Faz

Mevcut Faz E (İçerik Kütüphanesi) kapsamına **SGF Adapter** eklenmeli:

- `studio/adapters/sgfAdapter.js` — SGF ↔ moveTree dönüştürücü
- `sgf-parser.js` genişletmesi — property preservation + basic stringify
- Test fixtures dizini
- Formation SGF dosyaları için otomatik içe aktarma
- Bilinmeyen property preservation testi

---

## 10. Sıradaki Küçük ve Uygulanabilir Faz

Araştırma bulgularına göre **en az riskli ve en yüksek değerli ilk adım:**

### Faz B.1 — moveTree.js Annotation Genişletmesi

**Hedef:** moveTree.js'deki `annotations[]` alanını `string[]`'den `{type, x, y, label?, from?, to?}[]`'e genişlet.

**Neden şimdi:**
- Desktop renderer `setMoveNodeAnnotations()` çağırıyor ancak tip bilgisi yok
- SGF import/export için typed annotation zorunlu
- Veri modeli değişikliği — erken yapılmalı, sonra API değişimi maliyetli

**Değişecek dosyalar:** `studio/model/moveTree.js`, `tests/studio-text-tree.test.js`

**Commit mesajı önerisi:** `moveTree: annotations düz string yerine typed obje olarak tanımlandı`

### Faz B.2 — Pass Hamlesi Canonical Temsili

**Hedef:** `moveTree.js`'de pass hamlesini `{color, pass:true, x:null, y:null}` olarak tanımla. `addChildMove()` null/undefined koordinatı pass olarak yorumlasın.

**Değişecek dosyalar:** `studio/model/moveTree.js`, test dosyası

### Faz E.1 (Sonraki büyük faz) — SGF Adapter

**Hedef:** `studio/adapters/sgfAdapter.js` — formatSGF() + parseSGF() — moveTree ↔ SGF round-trip.

---

*Araştırma web kaynaklarına dayanıyor; editörlerin bir kısmı doğrudan kullanıcı deneyimi yerine belge ve kaynak koddan değerlendirildi.*
