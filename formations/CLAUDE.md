# Antalya GO — Claude Çalışma Kılavuzu

Bu dosya her Claude penceresinde otomatik yüklenir. Çok pencereli çalışmada
ortak bağlam sağlar. Değişiklik yaparken bu dosyayı da güncelle.

---

## Proje Özeti

Go oyununu öğreten interaktif Türkçe web uygulaması.
Repo: `c:\Users\Ekim\antalyago` · Branch: `main` · GitHub: Marfg/antalyago

Ana sayfalar:
- `index.html` — giriş / navigasyon
- `learning-scenes.html` — **ders sahneleri** (aktif geliştirme)
- `problem.html` — tsumego çözme
- `etud.html` — etüt tahtası
- `oyna.html` — oyun modu
- `canli.html` — OGS canlı maç entegrasyonu

---

## Pencere Sorumlulukları

| Pencere | Dizin | Görev |
|---|---|---|
| **Pencere A** (bu) | `antalyago/` | Ders sahneleri, müfredat verisi |
| **Pencere B** | `antalyago/formations/` | Formation JSON dosyaları, SGF dosyaları |

**Senkronizasyon kuralı:** Her iki pencere de `git pull` yaparak diğerinin
değişikliklerini alabilir. Çakışma riskini azaltmak için:
- Pencere A `core/curriculum.js` içindeki CURRICULUM'u yönetir
- Pencere B `formations/**/*.json` ve `formations/**/*.sgf` dosyalarını yönetir

---

## Formations Klasör Yapısı

```
formations/
  b1-temel-kurallar/
    l1-tahta-ve-taslar/     adim-1.json, adim-2.json, adim-3.json
    l2-nefes-noktalari/     adim-1..3.json
    l3-tas-alma/            adim-1..3.json, 3. adım.sgf
    l4-yasak-hamleler/      adim-1..2.json, 1. adım.sgf, 2. adım.sgf
    l5-ko-kurali/           adim-1..2.json, 1. adım.sgf, 2. adım.sgf
    l6-oyun-sonu-ve-sayim/  adim-1..2.json, 1. adım.sgf
  b2-temel-teknikler/
    l7-canli-gruplar/       adim-1..2.json, 1. adım.sgf  ← 19x19 SGF
    l8-kesme-ve-baglama/    adim-1..2.json
    l9-cift-atari/          adim-1..2.json
    l10-merdiven-shicho/    adim-1..2.json
    l11-ag-geta/            adim-1.json
    l12-snapback/           adim-1.json
  b3-strateji/
    l13-acilis-fuseki/      adim-1..3.json
    l14-orta-oyun/          adim-1..2.json
    l15-son-oyun-yose/      adim-1..2.json
```

**Not:** Formation JSON'ları şu an doğrudan kullanılmıyor; `core/curriculum.js`
içindeki CURRICULUM sabit kodlu. SGF dosyaları referans/kaynak olarak tutuluyor.

---

## SGF Koordinat Çevirisi

SGF `[XY]` → `x = X-'a'`, `y = Y-'a'` (a=0, b=1, ..., s=18)
- `[aa]` → (0,0) sol üst köşe
- `[sa]` → (18,0) sağ üst köşe
- `[as]` → (0,18) sol alt köşe

Motor koordinat sistemi: x=sütun (sol→sağ), y=satır (üst→aşağı).

SGF renkleri: `AW[...]` = beyaz taşlar, `AB[...]` = siyah taşlar
SGF işaretler: `TR[...]` = üçgen, `SQ[...]` = kare, `CR[...]` = daire

---

## Adım Verisi Formatı

```js
{
  text: `<p>HTML açıklama metni</p>`,
  size: 9,          // tahta boyutu (9/13/19), varsayılan 9
  board: [          // başlangıç taş dizilimi
    {color:'B', x:3, y:3},
    {color:'W', x:4, y:4},
  ],
  markers: [        // opsiyonel: SGF işaretler
    {x:1, y:2, type:'triangle'},
  ],
  auto: true,       // true → öğrenci hamle yapmaz, sadece izler
  turn: 'black',    // interaktif adımda sıra kimin
  answer: {x:4, y:5},          // tek doğru cevap
  answers: [{x:4,y:5},{x:3,y:5}], // birden fazla doğru cevap
  answers: 'any',              // her nokta kabul edilir
  camera: CAM.corner_tl,       // kamera animasyonu
  fb:     {t:'Mesaj', c:'info'},         // başlangıç geri bildirim
  fb_ok:  'Doğru mesajı',
  fb_err: 'Yanlış mesajı',
  capture: [{x:4,y:4}],        // doğru hamlede kaldırılan taşlar
  moves: [{color:'B', x:3, y:3, capture:[...]}], // otomatik hamle sekansı
  showLiberties: true,         // nefes noktası görseli
  forbidden: [{x:5,y:0}],     // kırmızı X işaretler
  koPoint: {x:4, y:4, color:'red'}, // ko göstergesi
  blackTerritory: [{x:5,y:0}],
  whiteTerritory: [{x:1,y:0}],
  boardSelector: true,         // tahta boyutu seçici göster
}
```

---

## Mevcut Müfredat Durumu (2026-03-21)

### B1 — Temel Kurallar
- l1 Tahta ve Taşlar — tam (3 adım)
- l2 Nefes Noktaları — tam (3 adım)
- l3 Taş Alma — tam (4 adım)
- l4 Yasak Hamleler — tam (2 adım)
- l5 Ko Kuralı — tam (2 adım)
- l6 Oyun Sonu ve Sayım — tam (2 adım)

### B2 — Temel Teknikler
- **l7 Canlı Gruplar (İki Göz)** — 2 adım
  - Adım 1: **19x19**, SGF'den 5 canlı grup, △/□ göz işaretleri, board19 kamera
  - Adım 2: 9x9, sahte göz örneği
- l8 Kesme ve Bağlama — tam (2 adım)
- l9 Çift Atari — tam (2 adım)
- l10 Merdiven (Shicho) — tam (2 adım)
- l11 Ağ (Geta) — tam (1 adım)
- l12 Snapback — tam (1 adım)

### B3 — Strateji
- l13 Açılış (Fuseki) — tam (3 adım)
- l14 Orta Oyun — tam (2 adım)
- l15 Son Oyun (Yose) — tam (2 adım)

---

## Önemli Kararlar

1. **Müfredat `core/curriculum.js` içinde sabit kodlu** — formation JSON'ları henüz
   motora bağlanmamış. İleride dinamik yükleme planlanabilir.

2. **2D öğrenme motoru kaldırıldı** — `ogren.html`, `ogren.js`, `prototype-3d.html`, `mobile-mockup.html` ve `ogren-3d.html` silindi.

3. **19x19 desteği aktif** — l7 adım-1 ile test edildi, motor tüm boyutlarda çalışıyor.

4. **Commit mesajları Türkçe** — proje genelinde Türkçe commit geleneği var.
