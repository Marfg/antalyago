# Problem Stüdyosu

AntalyaGo problemi oluşturma ve düzenleme aracı. Yalnızca yerel ortamda çalışır; `localhost` dışına hiçbir veri gönderilmez.

## Başlatma

```
npm run studio
```

Tarayıcıda açılır: `http://127.0.0.1:4319`

## Klasör Yapısı

```
studio/
  index.html          — uygulama kabuğu
  studio.js           — istemci tarafı mantık
  studio.css          — bileşen stilleri
  boardRenderer.js    — SVG tahta önizlemesi
  config.example.json — yapılandırma şablonu
  model/
    studioDocument.js — veri modeli ve fabrika işlevleri
    validation.js     — doğrulama kuralları (saf, tarayıcıya uyumlu)
  server/
    server.mjs        — HTTP API sunucusu
    projectStore.mjs  — belge I/O (atomik yazma, yedekleme)
    pathPolicy.mjs    — güvenli dosya yolu çözümlemesi
  schema/
    studio-document.schema.json — JSON Schema 2020-12
  adapters/
    capabilities.js   — gelecek çıktı tanımları
  workspace/          — taslak belgeler (git tarafından izlenmez)
```

## Yapılandırma

Kök dizinde `studio/config.local.json` oluşturun (git tarafından izlenmez):

```json
{
  "port": 4319,
  "host": "127.0.0.1",
  "workspaceDir": "studio/workspace"
}
```

Varsayılanlar `config.example.json` dosyasında görülebilir.

## Güvenlik

- Sunucu yalnızca `127.0.0.1` üzerinde dinler.
- CSRF token her başlatmada üretilir ve HTML'e `<meta name="studio-token">` olarak eklenir.
- Tüm POST/PUT istekleri `X-Studio-Token` başlığı zorunludur.
- `studio/workspace/` dosyaları statik URL üzerinden erişilemez.
- Belge ID'leri `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$` regex ile sınırlandırılmıştır.
- Atomik yazma: `.tmp` → doğrula → yedek al → `rename`.

## Faz Planı

| Faz | Kapsam |
|-----|--------|
| **A** (bu) | Veri modeli, doğrulama, sunucu, taslak CRUD, SVG tahta, JSON önizleme |
| B | Taş ekleme/çıkarma (tıklama ile), hamle sekansı |
| C | Çözüm / varyant yönetimi |
| D | Batch import, SGF okuma |
| E | Çıktı adaptörleri: Problem Bank JSON, 3D motor adımı, SGF, Obsidian |
| F | Görsel çıktılar: PNG/SVG, hareket JSON'u, JSONL/CSV |

## Testler

```
npm run test-studio
```

Belge model testleri → sunucu entegrasyon testleri → Playwright UI testleri sırasıyla çalışır.

Playwright testi için tarayıcı yolu gerekiyorsa:

```
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" npm run test-studio
```
