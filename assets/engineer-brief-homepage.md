# Mühendis Brief — AntalyaGo.net Modern Giriş Sayfası

**Hazırlayan:** Design Agent  
**Hedef:** index.html için katmanlı, animasyonlu, 3D hissiyatlı hero section  
**Teknoloji:** Vanilla JS + CSS (Three.js veya Canvas opsiyonel)

---

## 1. GENEL MİMARİ

### Katman Sırası (z-index düşükten yükseğe)

```
z-0   hero-bg.png         — full-bleed arka plan, parallax yok, sabit
z-1   hero-texture.png    — ultra-wide overlay, opacity 0.18, blend-mode: screen
z-2   hero-board.png      — orta sağ konumda, parallax aktif, scale animasyonu
z-3   .hero__content      — sol metin bloğu, CTA butonları
z-4   .assistant-zone     — sağ alt köşe, maskot alanı
z-5   .site-header        — sabit header (mevcut)
```

---

## 2. HERO SECTION YAPISI

### HTML İskeleti

```html
<section class="hero" id="hero">

  <!-- Katman 0: Arka plan -->
  <div class="hero__bg" aria-hidden="true">
    <img src="assets/hero-bg.png" alt="" class="hero__bg-img"
         width="1920" height="1080" fetchpriority="high" decoding="async" />
  </div>

  <!-- Katman 1: Doku overlay -->
  <div class="hero__texture" aria-hidden="true"></div>

  <!-- Katman 2: Tahta görseli -->
  <div class="hero__board" aria-hidden="true" id="hero-board">
    <img src="assets/hero-board.png" alt=""
         width="900" height="675" decoding="async" />
  </div>

  <!-- Katman 3: Metin + CTA -->
  <div class="hero__content">
    <p class="hero__eyebrow">Antalya Go Topluluğu</p>
    <h1 class="hero__heading">
      Bir tahta.<br>İki renk.<br>Sonsuz olasılık.
    </h1>
    <p class="hero__tagline">
      Go öğrenmek için bir neden yeterli: merak.
    </p>
    <div class="hero__cta">
      <a href="ogren-3d.html" class="btn btn-primary">Go Öğrenmeye Başla</a>
      <a href="#topluluk"     class="btn btn-secondary">Topluluğu Keşfet</a>
    </div>
    <div class="hero__social">
      <a href="https://instagram.com/antalyago" target="_blank" rel="noopener">Instagram</a>
      <a href="https://facebook.com/AntalyaGo"  target="_blank" rel="noopener">Facebook</a>
    </div>
  </div>

  <!-- Katman 4: Asistan alanı (şimdilik placeholder) -->
  <div class="assistant-zone" id="assistant-zone" aria-hidden="true">
    <div class="assistant-zone__pulse"></div>
  </div>

</section>
```

---

## 3. CSS SPESİFİKASYONU

### Hero Temel Layout

```css
.hero {
  position: relative;
  min-height: 100svh;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 3rem;
  padding: 7rem 1.5rem 4rem;
  max-width: 1100px;
  margin: 0 auto;
  overflow: hidden;
}
```

### Arka Plan Katmanı

```css
/* full-bleed — grid dışına taşar */
.hero__bg {
  position: fixed;           /* parallax hissi için fixed */
  inset: 0;
  z-index: -2;
  pointer-events: none;
}

.hero__bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 40%;
  filter: brightness(0.45) saturate(0.85);
  will-change: transform;
}
```

### Doku Overlay

```css
.hero__texture {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: url('assets/hero-texture.png');
  background-size: cover;
  background-position: center;
  opacity: 0.12;
  mix-blend-mode: screen;
}
```

### Tahta Katmanı (Parallax)

```css
.hero__board {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: boardReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both;
  will-change: transform, opacity;
}

.hero__board img {
  width: 100%;
  max-width: 520px;
  height: auto;
  border-radius: 6px;
  filter: brightness(0.88) saturate(0.92);
  box-shadow:
    0 24px 80px rgba(0,0,0,0.55),
    0 4px 16px rgba(0,0,0,0.3);
}

@keyframes boardReveal {
  from { opacity: 0; transform: translateY(32px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
```

### Asistan Zone

```css
.assistant-zone {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 64px;
  height: 64px;
  z-index: 40;
}

.assistant-zone__pulse {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 35%, #2a2620, #0e0d0b);
  border: 1px solid rgba(184,149,90,0.3);
  box-shadow: 0 0 0 0 rgba(184,149,90,0.25);
  animation: assistantPulse 3s ease-in-out infinite;
}

@keyframes assistantPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(184,149,90,0.25); }
  50%       { box-shadow: 0 0 0 10px rgba(184,149,90,0); }
}

@media (max-width: 768px) {
  .assistant-zone { bottom: 5.5rem; right: 1rem; width: 48px; height: 48px; }
}
```

### Responsive

```css
@media (max-width: 900px) {
  .hero {
    grid-template-columns: 1fr;
  }
  .hero__board { display: none; }
  .hero__bg-img {
    /* mobilde dikey versiyonu kullan */
    content: url('assets/hero-mobile.png');
    object-position: center 30%;
  }
}
```

---

## 4. ANİMASYON SİSTEMİ

### A — Sayfa Yüklenme Sekansı (mevcut stone-drop korunur)

```
0.08s  stone-drop başlar (mevcut)
0.38s  stone-drop biter
0.40s  hero__bg fade-in (CSS: opacity 0 → 1, 600ms)
0.55s  hero__content fadeUp başlar (mevcut zincir korunur)
0.40s  hero__board boardReveal (CSS keyframe)
1.05s  stone-drop overlay kaldırılır (mevcut JS)
```

### B — Scroll Parallax (opsiyonel, JS)

```js
// hero__board'a hafif parallax — scroll ile yukarı kayar
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  const board = document.getElementById('hero-board');
  if (board && y < window.innerHeight) {
    board.style.transform = `translateY(${y * 0.12}px)`;
  }
}, { passive: true });
```

### C — Board Hover (opsiyonel, 3D tilt)

```js
// hero__board'a mouse pozisyonuyla hafif 3D tilt
const board = document.getElementById('hero-board');
if (board && window.matchMedia('(hover: hover)').matches) {
  board.addEventListener('mousemove', (e) => {
    const r = board.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width  - 0.5) * 8;
    const y = ((e.clientY - r.top)  / r.height - 0.5) * 8;
    board.style.transform = `perspective(800px) rotateY(${x}deg) rotateX(${-y}deg)`;
  });
  board.addEventListener('mouseleave', () => {
    board.style.transform = '';
  });
}
```

---

## 5. STATİK vs ANİMASYONLU ASSETler

| Asset | Tür | Açıklama |
|---|---|---|
| `hero-bg.png` | Statik | Sabit arka plan, JS yok |
| `hero-texture.png` | Statik | CSS opacity + blend-mode |
| `hero-board.png` | CSS animasyonlu | boardReveal + parallax scroll + hover tilt |
| `hero-mobile.png` | Statik | Mobilde hero-bg yerine geçer |
| `stone-detail.png` | İleride | Yükleme / geçiş animasyonu için rezerv |
| `assistant-placeholder.png` | İleride | Maskot asset gelince burada kullanılır |
| `logo.png` | Statik | Header — mevcut |
| `og-image.jpg` | Statik | Meta tag — mevcut |

---

## 6. MOBİL PERFORMANS STRATEJİSİ

```
- hero-texture.png mobilde gizle (display: none veya opacity: 0)
- hero__board display: none (mobil görsel yok, hero-mobile.png yeterli)
- parallax JS: IntersectionObserver ile hero görünürdeyken çalıştır
- boardReveal animasyonu: prefers-reduced-motion kontrolü
- İki görseli lazy değil fetchpriority=high ile erken yükle (hero-bg + hero-mobile)
- hero__bg position: fixed → mobilde absolute yap (scroll performansı)
```

```css
@media (max-width: 900px) {
  .hero__bg { position: absolute; }
  .hero__texture { display: none; }
}
```

---

## 7. DOSYA ADLANDIRMA STANDARDI

```
assets/
  hero-bg.png           — 16:9, photorealistic, masaüstü ana arka plan
  hero-board.png        — 4:3, photorealistic, interaktif tahta katmanı
  hero-texture.png      — 21:9, 3d-render, overlay doku
  hero-mobile.png       — 9:16, photorealistic, mobil arka plan
  stone-detail.png      — 1:1, photorealistic, mikro asset
  assistant-placeholder.png — 1:1, 3d-render, maskot rezerv alanı
  logo.png              — mevcut (400×400, transparan)
  hero.jpg              — mevcut (topluluk fotoğrafı, hero sağ sütun)
  og-image.jpg          — mevcut (1200×630, sosyal medya)
  favicon.svg / favicon-32.png / apple-touch-icon.png — mevcut
```

---

## 8. UYGULAMA AŞAMALARI

### Faz 1 — Minimum Viable Hero (hemen uygulanabilir)

Mevcut `index.html` zaten çalışıyor. Nano Banana görselleri üretildikçe şu sırayla entegre et:

1. `hero-bg.png` geldiğinde: mevcut `assets/hero.jpg` yerine koy (CSS brightness ayarla)
2. `hero-board.png` geldiğinde: mevcut `.hero__image` bloğunu `.hero__board` ile değiştir, boardReveal animasyonu ekle
3. `.assistant-zone` HTML + pulse CSS'i ekle (görsel gelmeden önce de çalışır)
4. `hero-texture.png` geldiğinde: `.hero__texture` div'ini aktifleştir

### Faz 2 — Parallax + Interaktivite

- Scroll parallax JS ekle (hero__board)
- Mouse hover 3D tilt ekle (hero__board)
- `hero-mobile.png` mobil medya query'sine bağla

### Faz 3 — Maskot Entegrasyonu

- `assistant-placeholder.png` → `.assistant-zone` içine gerçek asset olarak yerleştir
- Konuşma balonu sistemi bağla
- `stone-detail.png` → loading screen veya geçiş animasyonu olarak kullan

---

## 9. RENK, IŞIK, TİPOGRAFİ ÖNERİSİ

### Renkler (mevcut token sistemiyle uyumlu)
```
--bg:         #0E0D0B    zemin
--bg-surface: #161411    yüzey kartları
--accent:     #B8955A    amber — Go tahtası tonu, CTA vurgusu
--fg:         #F2EFE9    ana metin
--fg-muted:   #9A9187    ikincil metin, alt başlıklar
```

### Işık Felsefesi
- Tek yönlü sıcak ışık (sol üstten veya sağdan) — tüm görsellerde tutarlı
- Ambient: koyu, derin, neredeyse siyah zemin
- Vurgu: amber altın — Go tahtasının ahşap tonu
- Parlama yok, flash yok, neon yok — her şey mat ve derin

### Tipografi
- Font: Space Grotesk (mevcut)
- H1: weight 500, letter-spacing -0.02em — güçlü ama yüklü değil
- Eyebrow (küçük üst etiket): weight 700, ALL CAPS, letter-spacing 0.14em, amber renk
- Tagline: weight 400, muted renk, geniş satır aralığı

### Atmosfer Özeti
> Bir Go ustasının çalışma odasına giriyorsunuz. Ahşap, taş, sessizlik, sıcak ışık.
> Hiçbir şey sizi zorlamıyor. Sadece oturmaya davet ediyor.
