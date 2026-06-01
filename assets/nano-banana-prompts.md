# Nano Banana — AntalyaGo.net Hero Görselleri

Her prompt: VS Code'da aşağıdaki metin bloğunu seç →
Sağ tık → "Generate Image with Nano Banana Pro"

Ayarları her prompt öncesinde kontrol et (parantez içinde belirtildi).

---

## LAYER 1 — Hero Background
**Ayarlar:** Style: `photorealistic` · Aspect: `16:9` · Size: `2K`
**Dosya adı:** `hero-bg.png`

```
A wide cinematic scene of a Go board resting on a dark polished wooden table, photographed at a low angle. Warm amber and golden light falls diagonally from the upper left, casting soft shadows across the wooden grid lines. Several black and white polished stones are scattered naturally on the board. The background is softly blurred — deep warm browns and ochre tones, with subtle bokeh suggesting an intimate indoor space, perhaps near a large window with diffused Mediterranean afternoon light. The composition leaves the left third empty with clean negative space for overlaid text. No text, no writing, no logos. Cinematic, calm, premium, and deeply atmospheric.
```

---

## LAYER 2 — Go Board Focus (Interaktif Katman Tabanı)
**Ayarlar:** Style: `photorealistic` · Aspect: `4:3` · Size: `2K`
**Dosya adı:** `hero-board.png`

```
Close-up overhead view of a 9x9 Go board made of pale golden wood, perfectly clean grid lines carved into the surface. A few black glass stones and white shell stones are placed near the center, catching warm directional light from the upper right. The stones have a subtle wet-glass sheen and soft specular highlights. The board surface shows natural wood grain texture. Shallow depth of field — the board fills the frame, corners slightly soft. The background is completely neutral dark. No people, no hands, no text, no labels. Minimal, aesthetic, precise. Suitable as a base for interactive animation overlay.
```

---

## LAYER 3 — Atmospheric Texture (Overlay / Arka Plan Doku)
**Ayarlar:** Style: `3d-render` · Aspect: `21:9` · Size: `2K`
**Dosya adı:** `hero-texture.png`

```
An abstract ultra-wide 3D render suggesting the essence of a Go board: thin golden grid lines receding into perspective on a very dark matte surface, lit from a low warm angle. The lines catch amber light along their edges. A few perfect black spheres rest on intersection points, casting soft shadows. The scene is serene, geometric, minimal. Far edges fade to darkness. No text, no labels, no writing. The mood is contemplative, architectural, and elegant — like a meditation on space and strategy.
```

---

## LAYER 4 — Mobile Hero (Dikey Format)
**Ayarlar:** Style: `photorealistic` · Aspect: `9:16` · Size: `2K`
**Dosya adı:** `hero-mobile.png`

```
Vertical cinematic composition. A Go board occupies the lower two-thirds of the frame, shot from a slightly elevated angle. Warm afternoon light from the side highlights the wooden surface and a few carefully placed black and white stones. The upper third is clear, very dark, and empty — space for text overlay. The mood is quiet, focused, and warm. Natural shallow depth of field. No text, no writing, no symbols, no logos. Premium mobile wallpaper aesthetic.
```

---

## LAYER 5 — Assistant Placeholder Scene
**Ayarlar:** Style: `3d-render` · Aspect: `1:1` · Size: `1K`
**Dosya adı:** `assistant-placeholder.png`

```
A small, clean 3D render of a minimalist figure or abstract form — a smooth dark oval shape with a faint warm glow, suggesting presence and calm intelligence. It sits in the lower right area of the frame on a very dark background. The figure has a subtle soft amber highlight on one side and a faint inner glow. No facial features, no text, no labels. The form should feel like a welcoming, thoughtful assistant — still, attentive, and non-intrusive. Suitable as a placeholder for an AI assistant mascot area.
```

---

## LAYER 6 — Stone Detail (Mikro Asset)
**Ayarlar:** Style: `photorealistic` · Aspect: `1:1` · Size: `1K`
**Dosya adı:** `stone-detail.png`

```
Extreme close-up photograph of a single black Go stone resting on a light wooden Go board surface. The stone is perfectly round, polished obsidian-black with a subtle highlight on the upper left. The wood grain is visible and warm. Very shallow depth of field, soft creamy bokeh background. No text, no other objects. Pure, meditative, detail shot. Suitable for favicon, loading screen, or transition animation base.
```

---

## KULLANIM KILAVUZU

### Her prompt için adımlar:
1. Bu dosyayı VS Code'da aç
2. İstediğin prompt'un kod bloğundaki metni **seç** (``` içindeki kısmı)
3. Sağ tık → **Generate Image with Nano Banana Pro**
4. Style picker'dan parantezdeki stili seç
5. Aspect ratio'yu ayarla
6. Üret — dosya otomatik `assets/` klasörüne kaydedilir
7. Çıktıyı yukarıdaki **Dosya adı** ile yeniden adlandır

### Öncelik sırası:
1. `hero-bg.png` — ana sayfa hero arka planı (en kritik)
2. `hero-board.png` — interaktif tahta katmanı
3. `hero-mobile.png` — mobil versiyon
4. `hero-texture.png` — ultra-wide atmosfer
5. `stone-detail.png` — mikro asset
6. `assistant-placeholder.png` — maskot alanı (son)
