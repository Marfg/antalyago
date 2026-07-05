# Kaynak / Provenance Sözleşmesi

Problem bankasında iki otorite katmanı vardır:

1. JSON problem verisi: çalışma ve yayın verisinin tek kaynağı
2. Obsidian notları: araştırma, tasnif ve editoryal takip katmanı

Çift yönlü kontrolsüz senkronizasyon yoktur.

## Canonical provenance alanları

### Temel izleme

- `source.type`: `pdf` / `sgf` / `studio` / `manual` / `web`
- `source.name`: kaynak başlığı
- `source.author`: yazar / editör
- `source.publication`: yayın / kitap / makale adı
- `source.page`: sayfa numarası
- `source.problemNumber`: kaynak içi problem numarası
- `source.fileRef`: dosya yolu veya Obsidian referansı
- `source.importedAt`: içeri aktarma zamanı
- `source.license`: telif veya kullanım durumu
- `source.hash`: kaynak hash'i
- `source.editorialNote`: editoryal not
- `source.derivedFrom`: türetilmiş / uyarlanmış ilişkisi

### Mevcut kayıtlarla uyumluluk

Şimdiki problem bankası kayıtlarında asgari iz şu alanlarda tutuluyor:

- `source.documentId`
- `source.page`
- `source.usage`

Bu alanlar yeterli bir ilk iz sağlar; ancak canonical provenance için eksik kabul edilir.

## Önerilen zorunluluk seviyesi

### Draft / review

Zorunlu:

- `source.type` veya legacy eşdeğeri
- `source.documentId` / `source.name`
- `source.page`
- `source.usage`
- `rights.status`

İsteğe bağlı:

- `source.author`
- `source.publication`
- `source.problemNumber`
- `source.fileRef`
- `source.importedAt`
- `source.hash`
- `source.editorialNote`
- `source.derivedFrom`

### Approved / published

Zorunlu:

- yukarıdaki draft alanları
- `revision`
- tam provenance izi
- editoryal not
- lisans/telif durumu

## Hash kullanımı

- Hash, kaynak içerikte sessiz değişiklikleri yakalamak için kullanılır.
- Aynı problem birden fazla kaynaktan türetildiyse her kaynak ayrı hash ile izlenir.
- Hash çakışması olduğunda kayıt otomatik yayınlanmaz.