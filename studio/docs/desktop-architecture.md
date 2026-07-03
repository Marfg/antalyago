# AG-STUDIO — Masaüstü Mimari Karar Belgesi

**Faz:** A.5 — Masaüstü Mimari Yön Düzeltme
**Tarih:** 2026-07-03
**Durum:** Onay bekliyor

---

## 1. Mevcut Faz A Değerlendirmesi

### Güçlü Yönler

| Bileşen | Dosya | Değerlendirme |
|---|---|---|
| BoardState | `core/boardState.js` | Tam yeniden kullanılabilir — DOM yok, Node yok, saf JS |
| RuleEngine | `core/ruleEngine.js` | Tam yeniden kullanılabilir — saf fonksiyonlar |
| Problem doğrulama | `core/problemBank.js` | validateProblem, createProblemVariant → doğrudan kullanım |
| SGF ayrıştırıcı | `sgf-parser.js` | Parser mantığı saf; yükleme katmanı `fetch` bağımlı |
| StudioDocument modeli | `studio/model/studioDocument.js` | Düz JSON, taşınabilir, migration altyapısı var |
| Doğrulayıcı | `studio/model/validation.js` | Saf fonksiyon, tarayıcı ve Node uyumlu |
| Atomik yazma | `studio/server/projectStore.mjs` | Mantık doğru; platformu değil, nereye bağlandığı değişecek |
| Path policy | `studio/server/pathPolicy.mjs` | path.relative() savunması → main process'e taşınacak |
| Güvenlik modeli | `studio/server/server.mjs` | CSRF/Host/Origin doğrulama → IPC sözleşmesi ile ikame edilecek |
| Testler | `tests/studio-*.test.js` | Korunuyor; IPC testleri ekleniyor |

### Yapısal Sorunlar

**Web sunucusu modeli masaüstü için gereksiz yük:**
HTTP server, CSRF token, Origin başlığı, port yönetimi → Electron IPC ile bunların tümüne gerek kalmaz.

**`fetch` bağımlılıkları:**
`core/problemBank.js:loadProblemBank` ve `sgf-parser.js:loadCollections` browser `fetch` kullanıyor.
Masaüstünde bunlar `fs.readFile` ile ikame edilmeli, saf parser mantığı bozulmadan korunmalı.

**Gömülü büyük HTML dosyaları:**
`ogren-3d.html` içinde CURRICULUM sabit kodlu. Bu pattern Studio ile çakışmaz ama ilerideki
modüler LessonEngine adaptasyonu için CURRICULUM'un ayrı bir veri dosyasına taşınması
gerekebilir. Bu Faz A.5 kapsamı dışıdır; Faz E'de önerilecek.

**Renk sözleşmesi tutarsızlığı:**
Problem Bank: `"B"/"W"` (büyük harf) — `core/problemBank.js`, `content/problem-bank/schema/`
StudioDocument / BoardState / RuleEngine: `"black"/"white"` (küçük harf)
Bu fark zaten belgelenmiş; adaptör katmanı (Faz D) dönüşümü kapsar.

---

## 2. Masaüstü Teknoloji Kararı: Electron

### Değerlendirme Matrisi

| Ölçüt | Electron | Tauri | NW.js | Web (mevcut) |
|---|---|---|---|---|
| Mevcut JS kodu uyumu | ★★★★★ | ★★★ | ★★★★ | ★★★★★ |
| Node.js dosya/DB erişimi | ★★★★★ | ★★★ (Rust) | ★★★★ | ✗ |
| Windows paketleme | ★★★★★ | ★★★★ | ★★★ | ✗ |
| `.agstudio` dosya ilişkilendirmesi | ★★★★★ | ★★★★ | ★★★ | ✗ |
| Ekip bilgi eğrisi | ★★★★★ | ★★ (Rust gerekir) | ★★★ | ★★★★★ |
| boardState/ruleEngine yeniden kullanımı | ★★★★★ | ★★★ (WASM) | ★★★★ | ★★★★★ |
| Güvenlik modeli | ★★★★ | ★★★★★ | ★★ | ★★★ |
| Uygulama boyutu | ★★ (~150 MB) | ★★★★★ (~5 MB) | ★★ | ✗ |
| Canvas/WebGL desteği | ★★★★★ | ★★★★★ | ★★★★ | ★★★★★ |
| İleride video render | ★★★★★ | ★★★ | ★★★ | ✗ |
| Toplam | **45** | **34** | **32** | — |

### Karar: Electron

**Birincil gerekçe:**
`core/boardState.js` ve `core/ruleEngine.js` saf JS olduğu için Electron renderer'da değiştirmeden çalışır.
Mevcut `studio/` HTML/CSS/JS kodu minimum uyarlama ile renderer olur.
Ekip Rust bilgisi olmadığından Tauri ciddi bir öğrenme ve bakım yükü getirir.
`electron-builder` ile Windows NSIS kurulumu ve `.agstudio` dosya ilişkilendirmesi birkaç satır konfigürasyonla çalışır.

**Kabul edilen uzlaşma:**
Electron paketi büyüktür (~150 MB kurulum). Bu, AntalyaGo hedef kitlesinin (masaüstü kullanıcı, bant genişliği sorunu yok) için kabul edilebilir.
Boyut endişesi kritik hale gelirse Tauri geçişi Faz G'de yeniden değerlendirilir.

---

## 3. Süreç ve Modül Diyagramı

```
┌─────────────────────────────────────────────────────────────────────┐
│  AntalyaGo Studio (Electron)                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  RENDERER PROCESS (studio/index.html → studio/studio.js)    │   │
│  │                                                             │   │
│  │  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐  │   │
│  │  │  Tahta UI    │  │  Inspector    │  │  Kütüphane     │  │   │
│  │  │  (SVG/Canvas)│  │  (form alanı) │  │  Paneli        │  │   │
│  │  └──────┬───────┘  └───────┬───────┘  └────────┬───────┘  │   │
│  │         │                  │                    │          │   │
│  │  ┌──────▼──────────────────▼────────────────────▼───────┐  │   │
│  │  │  studio.js — UI controller ve state yöneticisi        │  │   │
│  │  │  · BoardState / RuleEngine (doğrudan import)          │  │   │
│  │  │  · validation.js (doğrudan import)                    │  │   │
│  │  │  · studioDocument.js (doğrudan import)                │  │   │
│  │  └──────────────────────────┬────────────────────────────┘  │   │
│  │                             │  window.studioAPI (preload)   │   │
│  └─────────────────────────────┼───────────────────────────────┘   │
│                                │ contextBridge — dar IPC sözleşmesi │
│  ┌─────────────────────────────▼───────────────────────────────┐   │
│  │  PRELOAD SCRIPT (desktop/preload.js)                        │   │
│  │  · Yalnızca izin verilen kanalları açar                     │   │
│  │  · Node API'si renderer'a sızmaz                            │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │ ipcRenderer.invoke / ipcMain.handle│
│  ┌─────────────────────────────▼───────────────────────────────┐   │
│  │  MAIN PROCESS (desktop/main.js)                             │   │
│  │                                                             │   │
│  │  ┌──────────────────┐  ┌─────────────────────────────────┐ │   │
│  │  │ Dosya İşleyicisi │  │ Problem Bank İşleyicisi          │ │   │
│  │  │ · open/save/     │  │ · index.json okuma (salt okuma) │ │   │
│  │  │   save-as .agst  │  │ · problem JSON okuma            │ │   │
│  │  │ · atomik yazma   │  │ · doğrulama → yazma + yedek     │ │   │
│  │  │ · yedekleme      │  │ · kaynak sürüm takibi           │ │   │
│  │  └──────────────────┘  └─────────────────────────────────┘ │   │
│  │                                                             │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │ Yol Politikası (desktop/ipc/pathPolicy.js)             │ │   │
│  │  │ · path.relative() sınır doğrulaması (Faz A.5'ten taşı)│ │   │
│  │  │ · .agstudio uzantı doğrulaması                         │ │   │
│  │  │ · problem-bank/ salt-okunur erişim kontrolü            │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  PAYLAŞILAN MOTORLAR (core/) — her iki process'te çalışır     │ │
│  │  · boardState.js  · ruleEngine.js  · problemBank.js (saf kısım│ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

      ↕ fs (Node.js)

┌─────────────────────────────────────────────────────┐
│  Yerel Dosya Sistemi                                │
│  ~/Documents/AntalyaGo Studio/                      │
│    belgem.agstudio                                  │
│    diger-belge.agstudio                             │
│                                                     │
│  antalyago/ (kaynak repo — kontrollü erişim)        │
│    content/problem-bank/index.json  ← salt-okunur  │
│    content/problem-bank/problems/   ← salt-okunur  │
│    content/problem-bank/problems/   → doğrulama + │
│                                       onay sonrası  │
│                                       yazma         │
└─────────────────────────────────────────────────────┘
```

---

## 4. Önerilen Klasör Yapısı

```
antalyago/
│
├── core/                          ← KORUMA (değişmez)
│   ├── boardState.js              ← tam yeniden kullanım
│   ├── ruleEngine.js              ← tam yeniden kullanım
│   ├── problemBank.js             ← saf fonksiyonlar korunur;
│   │                                loadProblemBank() → Faz D'de Node wrapper
│   ├── lessonEngine.js            ← korunur
│   ├── curriculum.js              ← korunur
│   └── theme.js                   ← web'e özel, Studio'da kullanılmaz
│
├── content/problem-bank/          ← SALT OKUNUR kaynak (Studio değiştirmez)
│   ├── index.json
│   ├── problems/
│   └── schema/problem.schema.json
│
├── formations/                    ← KAYNAK MATERYAL (Studio içe aktarır, yerinde değiştirmez)
│
├── sgf-parser.js                  ← ORTAK — saf parser mantığı korunur;
│                                    fetch bağımlılığı → Faz D'de Node wrapper
│
├── studio/                        ← STÜDYO KÖK
│   ├── docs/
│   │   └── desktop-architecture.md   ← BU BELGE
│   │
│   ├── model/                     ← KORUMA
│   │   ├── studioDocument.js      ← temel veri modeli (genişletilecek ama bozulmayacak)
│   │   └── validation.js          ← saf doğrulayıcı (korunur)
│   │
│   ├── schema/                    ← KORUMA + genişletme
│   │   ├── studio-document.schema.json   ← mevcut (korunur)
│   │   └── agstudio-v1.schema.json       ← YENİ (Faz B) — .agstudio tam şeması
│   │
│   ├── adapters/                  ← BÜYÜYECEK
│   │   ├── capabilities.js        ← korunur
│   │   ├── problemBankAdapter.js  ← YENİ (Faz D) — problem JSON ↔ .agstudio
│   │   └── sgfAdapter.js          ← YENİ (Faz E) — SGF → .agstudio
│   │
│   ├── boardRenderer.js           ← KORUMA + canvas genişletme (Faz C)
│   ├── studio.css                 ← KORUMA — yeniden yapılandırılacak (Faz B)
│   ├── studio.js                  ← GÜNCELLENİR — HTTP API → window.studioAPI (Faz B)
│   ├── index.html                 ← GÜNCELLENİR — Electron renderer olarak (Faz B)
│   ├── config.example.json        ← KORUNUR
│   ├── README.md                  ← GÜNCELLENİR
│   │
│   ├── server/                    ← KULLANIMDAN KALDIRILIYOR (Faz B'de)
│   │   ├── server.mjs             ← kaldırılır — IPC yerine geçer
│   │   ├── projectStore.mjs       ← mantık → desktop/ipc/fileHandlers.js
│   │   └── pathPolicy.mjs         ← mantık → desktop/ipc/pathPolicy.js
│   │
│   └── workspace/                 ← geçici (Faz B sonunda kaldırılır; .agstudio belgeler)
│
├── desktop/                       ← YENİ (Faz B) — Electron ana süreç
│   ├── main.js                    ← Electron main process — pencere, yaşam döngüsü
│   ├── preload.js                 ← contextBridge — dar IPC sözleşmesi
│   ├── menu.js                    ← uygulama menüsü (Faz B)
│   ├── ipc/
│   │   ├── pathPolicy.js          ← studio/server/pathPolicy.mjs'ten taşındı + .agstudio kuralları
│   │   ├── fileHandlers.js        ← .agstudio open/save/save-as/autosave/backup
│   │   ├── problemBankHandlers.js ← problem bank okuma + onaylı yazma (Faz D)
│   │   └── boardHandlers.js       ← gerekirse sunucu taraflı board validasyonu (isteğe bağlı)
│   └── build/                     ← YENİ (Faz G) — electron-builder config
│       └── electron-builder.yml
│
└── tests/
    ├── studio-document.test.js    ← KORUMA
    ├── studio-server.test.js      ← GÜNCELLENİR — Faz B'de IPC test haline döner
    └── verify-studio.mjs          ← GÜNCELLENİR — Playwright → Electron Playwright
```

---

## 5. `.agstudio` Belge Sözleşmesi

### Format Kararı: Düz JSON (`.agstudio`)

**JSON tercih edildi, çünkü:**
- İnsan okunabilir ve inceleme altında git ile versiyonlanabilir
- Mevcut `studioDocument.js` modeli zaten JSON
- Ek bağımlılık yok (zip/arşiv ayrıştırıcısı gerektirmez)
- Bozulma tespiti kolay (JSON.parse yeterli)
- Gelecekte bundled arşiv (örn. `.agstudio.zip`) gerekirse migration yolu açık

**Kompromis:** Resim, PDF veya büyük SGF gibi binary dosyalar `.agstudio` içine gömülmez.
Bu kaynaklar dış yollarla referanslanır (URL veya mutlak yol).
Faz G'de arşiv formatı değerlendirilebilir.

### Belge Şeması (v1.0)

```jsonc
{
  // ── Sürüm ──────────────────────────────────────────────────────────
  "agstudioVersion": "1.0",           // Dosya formatı sürümü
  "studioVersion":   "1.0.0",         // Uygulama modeli sürümü
  "createdWith":     "AG-Studio 1.0", // İnsan okunabilir versiyon

  // ── Kimlik ──────────────────────────────────────────────────────────
  "id":    "b1-l3-capture-0002",      // kebab-case, tekil
  "title": "Merdiveni yönlendir",
  "slug":  "merdiveni-yonlendir",
  "summary": "...",

  // ── İş akışı durumu ─────────────────────────────────────────────────
  "status": "draft",                  // draft | review | approved | published | archived
  "workflowNote": "",                 // inceleme notu

  // ── Başlangıç konumu (formation) ───────────────────────────────────
  "board": {
    "size":  9,                       // 9 | 13 | 19
    "turn":  "black",                 // black | white
    "ko":    null,                    // {x,y} | null
    "stones": [{ "color": "black", "x": 3, "y": 3 }],
    "markers": [{ "x": 1, "y": 2, "type": "triangle", "label": "" }],
    "arrows":  [{ "from": {"x":0,"y":0}, "to": {"x":2,"y":2} }],
    "regions": [{ "points": [{"x":1,"y":1}], "label": "", "color": "blue" }],
    "viewport": null                  // {x,y,w,h} | null — odak bölgesi
  },

  // ── Hamle dizisi ─────────────────────────────────────────────────────
  "moves": [
    { "color": "black", "x": 4, "y": 5, "annotation": "doğru hamle" },
    { "color": "white", "x": 4, "y": 6, "annotation": "" }
  ],

  // ── Varyant/çözüm ağacı ─────────────────────────────────────────────
  // Her düğüm: { move, children, isMainLine, annotation }
  "solutionTree": {
    "move": null,
    "children": [
      {
        "move": { "color": "black", "x": 4, "y": 5 },
        "isMainLine": true,
        "annotation": "Doğru — yakalama",
        "children": []
      },
      {
        "move": { "color": "black", "x": 3, "y": 5 },
        "isMainLine": false,
        "annotation": "Yanlış — beyaz kaçar",
        "children": []
      }
    ]
  },

  // ── Problem tanımı ───────────────────────────────────────────────────
  "problem": {
    "question":     "Beyaz grubu tek hamlede yakala.",
    "interactionType": "capture_goal",
    "goal": {
      "type":        "capture_group",
      "targetGroup": [{ "x": 4, "y": 4 }],
      "maxMoves":    1
    },
    "acceptedMoves": [{ "x": 4, "y": 5 }],
    "wrongMoves":    [],
    "hints": [
      { "level": 1, "type": "concept", "text": "Son nefesi bul." }
    ],
    "feedback": {
      "initial":   "İlk hamleyi seç.",
      "correct":   "Beyaz yakalandı!",
      "incorrect": "Tekrar dene."
    }
  },

  // ── Sınıflandırma ────────────────────────────────────────────────────
  "classification": {
    "type":        "tsumego",         // tsumego|sequence|judgment|count|construct|save
    "difficulty":  "beginner",        // beginner|intermediate|advanced
    "authorLevel": 1,                 // 1–5
    "playerToMove": "black",
    "goals":       ["capture"],
    "concepts":    ["atari", "liberty"],
    "tags":        []
  },

  // ── Müfredat bağlantısı ──────────────────────────────────────────────
  "curriculum": {
    "section":   "B1",
    "lesson":    "l3",
    "step":      "",
    "objectives": [],
    "skills":     [],
    "prerequisites": []
  },

  // ── Kaynaklar ────────────────────────────────────────────────────────
  "sources": [
    {
      "documentId": "falling-in-love-with-baduk",
      "page":       21,
      "usage":      "concept_reference",
      "url":        ""
    }
  ],

  // ── Motion / zaman çizelgesi ─────────────────────────────────────────
  "timeline": {
    "durationMs": 0,
    "events": [
      // { "type": "move"|"highlight"|"camera"|"wait"|"annotation",
      //   "atMs": 0, "data": {} }
    ]
  },

  // ── AntalyaGo kaynak kaydı ──────────────────────────────────────────
  // Belge bir Problem Bank girdisinden içe aktarıldıysa doldurulur.
  "antalyagoSource": {
    "problemId":    "b1-l3-capture-0001",  // orijinal problem ID'si
    "importedAt":   "2026-07-03T10:00:00.000Z",
    "sourceHash":   "sha256:abc123...",    // içe aktarma anındaki dosya hash'i
    "lastSyncedAt": null,
    "syncStatus":   "not_linked"           // not_linked | in_sync | modified | conflict
  },

  // ── Hak ve yetki ────────────────────────────────────────────────────
  "rights": {
    "status": "original",             // original|licensed|public_domain|review_required
    "notes":  ""
  },

  // ── Çıktı profilleri ─────────────────────────────────────────────────
  "outputs": {
    "problemBank": false,
    "lesson3d":    false,
    "sgf":         false,
    "motion":      false,
    "obsidian":    false,
    "image":       false
  },

  // ── Denetim ──────────────────────────────────────────────────────────
  "audit": {
    "createdAt":  "2026-07-03T10:00:00.000Z",
    "updatedAt":  "2026-07-03T10:00:00.000Z",
    "author":     "Marfg",
    "reviewedAt": null
  },

  // ── Genişletme alanı ─────────────────────────────────────────────────
  "extensions": {}
}
```

### Mevcut StudioDocument ile Fark

| Alan | StudioDocument (Faz A) | .agstudio (v1.0) |
|---|---|---|
| Tanımlayıcı | `studioVersion` | `agstudioVersion` + `studioVersion` |
| Hamle dizisi | `timeline.events[]` (genel) | `moves[]` + `solutionTree` (ayrı) |
| Problem | `solution` (kısmi) | `problem` (tam — question, goal, hints, feedback) |
| Kaynaklar | `sources[]` | aynı |
| AntalyaGo bağlantısı | yok | `antalyagoSource` |
| Renk | `"black"/"white"` | `"black"/"white"` (Problem Bank'a aktarımda `"B"/"W"`'ye çevrilir) |

Migration yolu: `studioDocument.js:migrateDocument()` fonksiyonu `agstudioVersion` kontrolü ile genişletilir.

---

## 6. AntalyaGo Problem Veritabanı Adaptörü

### İlke

Stüdyo `content/problem-bank/` dosyalarına **doğrudan ve kontrolsüz** yazmamalıdır.

```
problem-bank/problems/xyz.json  →  import  →  xyz.agstudio  (çalışma belgesi)
xyz.agstudio  →  doğrulama  →  kullanıcı onayı  →  export  →  problem-bank/problems/xyz.json
```

### `studio/adapters/problemBankAdapter.js` (Faz D)

```
importFromProblemBank(problemId, repoRoot)
  → problem JSON oku (salt-okunur)
  → StudioBoardAdapter.fromProblemJson(problem) ile .agstudio'ya dönüştür
  → antalyagoSource { problemId, importedAt, sourceHash } doldur
  → .agstudio belge döndür (henüz kaydedilmez)

exportToProblemBank(agstudioDoc, repoRoot)
  → agstudio → Problem Bank JSON dönüşümü
  → validateProblem() çalıştır
  → mevcut dosyayı oku → hash karşılaştır → çakışma varsa uyar
  → kullanıcı onayı iste (IPC üzerinden)
  → atomik yazma: .tmp → yedek al → rename
  → index.json güncelle (gerekirse)

checkSyncStatus(agstudioDoc, repoRoot)
  → kaynak dosya okunur, hash hesaplanır
  → antalyagoSource.sourceHash ile karşılaştırılır
  → "in_sync" | "modified" | "conflict" | "not_linked" döner
```

### Renk Dönüşümü (kritik)

```
.agstudio / BoardState / RuleEngine  →  Problem Bank JSON
"black"                               →  "B"
"white"                               →  "W"
board.turn: "black"                   →  board.toPlay: "B"
```

Bu dönüşüm **yalnızca export adımında** yapılır. Stüdyo içi veri modeli her zaman `"black"/"white"` kullanır.

---

## 7. StudioBoardAdapter Sınırı

### Tasarım Prensibi

Yeni bir Go motoru yazılmaz. `core/boardState.js` ve `core/ruleEngine.js` doğrudan kullanılır.
`StudioBoardAdapter`, motorun üzerine stüdyoya özgü işlevleri (undo, formasyon/hamle ayrımı, timeline) ekler.

### `studio/model/studioBoardAdapter.js` (Faz C)

```
StudioBoardAdapter {
  // State
  formation:   BoardState   // başlangıç pozisyonu (düzenlenebilir)
  moveHistory: Move[]       // uygulanan hamleler
  currentIndex: number      // oynatma konumu
  undoStack:   Command[]    // undo/redo için komut yığını

  // Tahta düzenleme (formation üzerinde)
  addStone(x, y, color)       // RuleEngine.isValidMove kontrolü YOK (düzenleme modu)
  removeStone(x, y)
  setTurn(color)
  clearBoard()
  setBoardSize(size)

  // Hamle uygulama (moveHistory üzerinde)
  applyMove(x, y)             // RuleEngine.isValidMove → applyMove → moveHistory
  undoMove()
  redoMove()

  // Oynatma
  goToMove(index)
  currentState():  BoardState  // formation + moveHistory[0..currentIndex] uygulanmış hali

  // Dönüşüm
  toAgstudioBoard():  AgstudioBoard   // .agstudio board alanına
  toFormationStones(): Stone[]        // Problem Bank stone listesine
  fromAgstudioBoard(board): void      // .agstudio belgesinden yükle
}
```

**Renderer'da çalışır** — IPC gerektirmez.
`BoardState.clone()` immutable güvenlik sağlar.

---

## 8. IPC ve Güvenlik Modeli

### Preload Sözleşmesi (`desktop/preload.js`)

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioAPI', {

  // Dosya işlemleri
  newDocument:    ()      => ipcRenderer.invoke('studio:new-document'),
  openDocument:   ()      => ipcRenderer.invoke('studio:open-document'),
  openFilePath:   (path)  => ipcRenderer.invoke('studio:open-file-path', path),
  saveDocument:   (doc)   => ipcRenderer.invoke('studio:save-document', doc),
  saveDocumentAs: (doc)   => ipcRenderer.invoke('studio:save-document-as', doc),
  getRecentFiles: ()      => ipcRenderer.invoke('studio:get-recent-files'),

  // Problem Bank (Faz D)
  listProblems:      (filter) => ipcRenderer.invoke('pb:list-problems', filter),
  importProblem:     (id)     => ipcRenderer.invoke('pb:import-problem', id),
  checkSyncStatus:   (doc)    => ipcRenderer.invoke('pb:check-sync', doc),
  exportToProblemBank: (doc, opts) => ipcRenderer.invoke('pb:export', doc, opts),

  // Doğrulama (Ana süreçte çalışır — çift doğrulama)
  validateDocument: (doc) => ipcRenderer.invoke('studio:validate', doc),

  // Sistem
  getVersion:  ()          => ipcRenderer.invoke('studio:get-version'),

  // Dosya ilişkilendirme — main → renderer bildirim
  onOpenFile: (callback)   => ipcRenderer.on('studio:file-open', (_, path) => callback(path)),
});
```

### Güvenlik Kuralları

| Kural | Uygulama |
|---|---|
| Renderer'a doğrudan Node erişimi yok | `nodeIntegration: false` |
| Context isolation | `contextIsolation: true` |
| Uzak içerik yok | `webSecurity: true`, `allowRunningInsecureContent: false` |
| Dosya işlemleri yalnızca main'de | preload yalnızca `invoke` kullanır, `require('fs')` değil |
| Path traversal koruması | `desktop/ipc/pathPolicy.js` — `path.relative()` sınırı (Faz A'dan taşındı) |
| `.agstudio` uzantı zorunluluğu | `openDocument` IPC handler filter uygular |
| Problem Bank atomik yazma | .tmp → yedek → rename (projectStore.mjs mantığından taşındı) |
| Geçersiz belge reddi | `validateDocument()` main'de tekrar çalışır (renderer'a güvenilmez) |
| Harici içerik çalıştırma yok | PDF ve URL referansları shell.openExternal ile açılır, eval yok |

---

## 9. Fazlara Ayrılmış Uygulama Sırası

### Faz B — Electron Kabuğu

**Hedef:** Stüdyo, tarayıcı sunucusu yerine Electron uygulaması olarak açılır.

1. `package.json`'a `electron`, `electron-builder` eklenir
2. `desktop/main.js` — BrowserWindow, yaşam döngüsü, menü
3. `desktop/preload.js` — dar IPC sözleşmesi
4. `desktop/ipc/fileHandlers.js` — open/save/save-as, .agstudio uzantı kontrolü
5. `desktop/ipc/pathPolicy.js` — studio/server/pathPolicy.mjs'ten taşındı + genişletildi
6. `studio/studio.js` — HTTP API çağrıları → `window.studioAPI.xxx()` çağrıları
7. `studio/index.html` — CSRF meta tag ve sunucu script'leri kaldırılır
8. `studio/server/` klasörü arşivlenir (silinmez — web modu geri dönüş seçeneği)
9. `agstudio-v1.schema.json` oluşturulur
10. `studio/workspace/` kullanımdan kalkar — belgeler `~/Documents/AG Studio/`'ya taşınır
11. Testler güncellenir: HTTP integration → Electron IPC mock

### Faz C — Etkileşimli Tahta

1. `studio/boardRenderer.js` → canvas 2D renderer eklenir (SVG kod yolu korunur)
2. `studio/model/studioBoardAdapter.js` oluşturulur
3. Taş ekleme/kaldırma (tıklama)
4. Marker, ok, bölge düzenleme
5. Ko ve yakalama görsel geri bildirimi
6. Undo/Redo (Command pattern)
7. Hamle dizisi listesi (alt panel / timeline)

### Faz D — Problem Bank Entegrasyonu

1. `studio/adapters/problemBankAdapter.js` oluşturulur
2. `core/problemBank.js:loadProblemBank` → Node.js fs wrapper
3. `desktop/ipc/problemBankHandlers.js`
4. Sol kütüphane paneli — problem listesi, arama, içe aktarma
5. İçe aktarma sihirbazı (problem JSON → .agstudio önizleme)
6. Dışa aktarma akışı — diff göster → kullanıcı onayı → atomik yazma
7. Çakışma algılama ve kaynak takibi (hash)

### Faz E — İçerik Kütüphanesi

1. Formations tarayıcısı (SGF/JSON okuma)
2. `sgf-parser.js` → Node.js fs wrapper
3. SGF → .agstudio dönüşümü
4. Hamle varyant ağacı UI
5. Müfredat ve beceri bağlantıları
6. Obsidian çıktı adaptörü

### Faz F — Çıktı Adaptörleri

1. Problem Bank JSON export (tam)
2. Lesson 3D step export
3. SGF export
4. PNG/SVG görsel export (canvas → png)
5. Motion JSON export

### Faz G — Paketleme

1. `electron-builder.yml` yapılandırması
2. Windows NSIS kurulumu
3. `.agstudio` dosya ilişkilendirmesi
4. Uygulama ikonu
5. Auto-update altyapısı (isteğe bağlı)

---

## 10. Her Faz İçin Kabul Ölçütleri

### Faz B — Electron Kabuğu

- [ ] `npm run studio` → Electron penceresi açılır (tarayıcı değil)
- [ ] Dosya menüsünden yeni/aç/kaydet/farklı kaydet çalışır
- [ ] `.agstudio` dosyasına çift tıklandığında uygulama açılır ve belge yüklenir
- [ ] SVG tahta önizlemesi çalışır (Faz A'dan taşındı)
- [ ] Inspector form alanları çalışır
- [ ] Doğrulama ve JSON önizleme sekmeleri çalışır
- [ ] Tüm mevcut stüdyo testleri geçer (uyarlanmış)
- [ ] `npm run test-all` yeşil

### Faz C — Etkileşimli Tahta

- [ ] Tahtaya tıklayarak siyah/beyaz taş konulabilir
- [ ] Kaldırma modu çalışır
- [ ] Ko ihlali hata mesajıyla reddedilir
- [ ] Yakalama animasyonla gösterilir
- [ ] Undo/Redo en az 50 adım çalışır
- [ ] Hamle listesi alt panelde görünür
- [ ] Marker (△/□/○) ekleme/kaldırma çalışır

### Faz D — Problem Bank Entegrasyonu

- [ ] Kütüphane paneli `content/problem-bank/index.json`'dan yüklenir
- [ ] Herhangi bir problemi içe aktar → `.agstudio` belgesi oluşur
- [ ] `antalyagoSource.sourceHash` doğru hesaplanır
- [ ] Export → doğrulama başarısız olursa hata gösterilir, yazılmaz
- [ ] Export → kaynak dosya değişmişse çakışma uyarısı çıkar
- [ ] Export → kullanıcı onayladıktan sonra atomik yazma yapılır
- [ ] `validateProblem()` export öncesi geçmelidir
- [ ] Çift tıklama ile belge açıldığında problemId yüklenir

### Faz G — Paketleme

- [ ] `npm run build` → `dist/AntalyaGo Studio Setup.exe` oluşur
- [ ] Kurulum tamamlandıktan sonra `.agstudio` uzantısı uygulamaya bağlıdır
- [ ] Kurulumda başlangıç menüsü ve masaüstü kısayolu oluşur
- [ ] Internet bağlantısı olmadan uygulama açılır ve çalışır

---

## 11. Riskler ve Geri Dönüş Stratejileri

| Risk | Olasılık | Etki | Geri Dönüş |
|---|---|---|---|
| Electron renderer ↔ main IPC performans sorunu (büyük board state) | Orta | Orta | Seri hale getirmeyi küçük paketlere böl; board işlemlerini renderer'da tut |
| Electron güvenlik güncellemesi bağımlılığı | Düşük | Yüksek | LTS sürümlerine bağlı kal; electron-builder yükseltme boru hattı kur |
| `.agstudio` format değişikliği (yeni alan) | Yüksek | Düşük | `migrateDocument()` altyapısı hazır; her yeni alanı opsiyonel yap |
| Problem Bank export çakışması | Orta | Yüksek | Atomik yazma + hash takibi + kullanıcı onayı + 5 yedek (Faz A'dan kalıtım) |
| `ogren-3d.html` ile bağımsızlık sorunu | Düşük | Orta | CURRICULUM'u ayrı veri dosyasına taşımak Faz E'de önerilebilir; zorlanmaz |
| Dosya ilişkilendirmesi Windows güncellemesiyle kaybolabilir | Düşük | Düşük | Electron API'si aracılığıyla yeniden kayıt kolayca yapılır |
| Electron paketi boyutu (~150 MB) | Yüksek | Düşük | Hedef kitle masaüstü kullanıcıları; Tauri geçişi Faz G'de seçenek olarak değerlendirilir |
| Büyük SGF dosyası (joseki.sgf) yükleme süresi | Düşük | Düşük | Lazy loading veya arka plan thread ile çözülür |

---

## 12. Faz A'dan Korunacak Dosyalar

Hiçbir Faz A dosyası bu belgede tanımlanan mimari karar öncesinde değiştirilmez.

| Dosya | Durum | Not |
|---|---|---|
| `core/boardState.js` | ✓ Aynen korunur | DOM yok, Node yok — her iki process'te kullanılır |
| `core/ruleEngine.js` | ✓ Aynen korunur | Saf fonksiyonlar |
| `core/problemBank.js` | ✓ Korunur | validateProblem vb. saf; loadProblemBank Faz D'de wrapper alır |
| `studio/model/studioDocument.js` | ✓ Korunur | SAFE_ID_RE, createDocument, migrateDocument |
| `studio/model/validation.js` | ✓ Korunur | Saf doğrulayıcı |
| `studio/schema/studio-document.schema.json` | ✓ Korunur | Faz B'de yeni .agstudio şeması eklenir |
| `studio/adapters/capabilities.js` | ✓ Korunur | Genişletilecek |
| `studio/boardRenderer.js` | ✓ Korunur | Faz C'de canvas yolu eklenir |
| `studio/studio.css` | ✓ Korunur | Faz B'de yeniden yapılandırılır |
| `tests/studio-document.test.js` | ✓ Aynen korunur | 36 birim testi |
| `tests/studio-server.test.js` | ✓ Korunur | Faz B'de IPC testine dönüşür |
| `tests/verify-studio.mjs` | ✓ Korunur | Playwright → Electron Playwright uyarlanır |
| `content/problem-bank/` | ✓ Salt-okunur | Stüdyo değiştirmez; Faz D adaptörü kontrollü yazar |
| `formations/` | ✓ Salt-okunur | Referans materyal |
| `sgf-parser.js` | ✓ Korunur | Faz E'de Node.js wrapper eklenir |
| `.gitignore` | ✓ Korunur | Faz B'de `desktop/build/` eklenir |

---

## 13. Değiştirilecek veya Kullanımdan Kaldırılacak Dosyalar

| Dosya | İşlem | Faz | Açıklama |
|---|---|---|---|
| `studio/server/server.mjs` | Arşivle / kaldır | B | HTTP server → Electron IPC |
| `studio/server/projectStore.mjs` | Taşı | B | Mantık → `desktop/ipc/fileHandlers.js` |
| `studio/server/pathPolicy.mjs` | Taşı | B | Mantık → `desktop/ipc/pathPolicy.js` |
| `studio/studio.js` | Güncelle | B | `api()` HTTP → `window.studioAPI.*` |
| `studio/index.html` | Güncelle | B | CSRF meta tag, server script kaldırılır |
| `studio/workspace/` | Kaldır | B | Belgeler `~/Documents/AG Studio/`'ya taşınır |
| `studio/README.md` | Güncelle | B | Electron kullanım talimatları |
| `package.json` | Güncelle | B | Electron, electron-builder bağımlılıkları + scripts |

**Not:** Tüm bu değişiklikler Faz B başlangıcında yapılır. Faz A kodu, bu belgede değişiklik izni verilene kadar dokunulmadan bırakılır.

---

## Açık Kalan Ürün Kararları

Bu belgede cevaplanmayan ve Faz B başlamadan önce yanıt bekleyen sorular:

1. **Otomatik kayıt sıklığı:** `.agstudio` dosyaları her değişiklikte mi (debounce) kaydedilmeli, yoksa kullanıcı kaydet mi demeli? Faz A autosave modeli (3 saniye debounce, idLocked sonrası) referans alınabilir.

2. **Belge konumu:** Kullanıcı `.agstudio` dosyasını istediği yere mi kaydedebilmeli (Finder/Explorer gibi), yoksa sabit bir uygulama klasörü mü kullanılmalı? Tavsiye: serbest konum (herhangi bir dizin).

3. **Problem Bank konum yapılandırması:** Stüdyo, AntalyaGo reposunun nerede olduğunu nasıl öğrenir? İlk açılışta "AntalyaGo klasörünü seç" diyaloğu mu, yoksa `config.local.json`'a yazılmış sabit yol mu?

4. **Öğrenci vs. içerik üretici modu:** Stüdyo yalnızca içerik üretimi için mi, yoksa gelecekte öğrenciler de `.agstudio` belgelerini oynatma/çözme modunda açabilmeli mi?

5. **Öncelikli içerik türü:** İlk Faz B-D iterasyonu için hangi içerik türü öncelikli? Problem oluşturma, formasyon düzenleme veya ders adımı oluşturma?

---

*Bu belge bağlayıcı bir spesifikasyon değil, mimari rehberdir. Uygulama sırasında keşfedilen teknik kısıtlamalar veya yeni ürün kararları bu belgenin güncellenmesini gerektirebilir.*
