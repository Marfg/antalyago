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

### Stata göre zorunluluk

#### draft

- zorunlu: `source.type`
- zorunlu: `source.name` veya `source.documentId`
- isteğe bağlı: `source.page`, `source.usage`, `source.hash`, `source.importedAt`, `source.license`, `source.author`, `source.publication`, `source.fileRef`, `source.editorialNote`, `source.derivedFrom`
- eksik `importedAt` draft migration'ı bloke etmez; `INCOMPLETE_PROVENANCE` uyarısı üretilir

#### review

- zorunlu: `source.type`
- zorunlu: `source.name` veya `source.documentId`
- `source.page` ve `source.usage` beklenir
- `importedAt` hâlâ isteğe bağlıdır; eksikse uyarı üretilir

#### approved / published / retired

- zorunlu: `source.type`
- zorunlu: `source.name` veya `source.documentId`
- zorunlu: `source.page`
- zorunlu: `source.usage`
- zorunlu: `source.hash`
- zorunlu: `source.importedAt`
- zorunlu: `source.license`
- `source.pageLocator` ve `verificationLevel` pratikte beklenir

### Mevcut kayıtlarla uyumluluk

Şimdiki problem bankası kayıtlarında asgari iz şu alanlarda tutuluyor:

- `source.documentId`
- `source.page`
- `source.usage`

Bu alanlar yeterli bir ilk iz sağlar; ancak canonical provenance için eksik kabul edilir.

## Hash kullanımı

- Hash, kaynak içerikte sessiz değişiklikleri yakalamak için kullanılır.
- Aynı problem birden fazla kaynaktan türetildiyse her kaynak ayrı hash ile izlenir.
- Hash çakışması olduğunda kayıt otomatik yayınlanmaz.
