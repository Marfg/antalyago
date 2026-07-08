# AntalyaGo Problem Havuzu

Bu dizin, problem bankasının kanonik veri katmanıdır.

## Kanonik problem modeli

Canonical problem JSON'u yalnızca gerekli alanları taşır:

- `source.sourceId`
- `source.locator.type`
- `source.locator.value`
- `source.usage`

Kaynak kopyaları, PDF dosyaları, mutlak yerel yollar ve lisans kanıtları ayrı kaynak katalogunda tutulur. Problem kaydında redundant provenance alanları saklanmaz.

## Aday hattı

PDF/SGF/insan yardımlı çıkarımlar önce `content/problem-bank/candidates/` altında aday olarak tutulur. Bu hat, canonical problem bankasından ayrıdır ve insan onayı olmadan `content/problem-bank/problems/` altına yazmaz.

Aday statüleri:

- `extracted`
- `needs-review`
- `rejected`
- `promoted`

## Kullanım

- Problem denetimi: `npm run audit-problem-bank`
- Kaynak denetimi: `npm run audit-problem-sources`
- Aday denetimi: `npm run audit-problem-candidates`
- Güvenli migration dry-run: `npm run migrate-problem-bank`

## Dokümanlar

- [Taksonomi](docs/taxonomy.md)
- [Kaynak/provenance](docs/source-provenance.md)
- [Schema versioning ve migration](docs/schema-versioning.md)
- [Studio adaptör sözleşmesi](docs/studio-adapter-contract.md)
- [PDF ingestion workflow](docs/pdf-ingestion-workflow.md)
- [Kaynak kataloğu](sources/README.md)
- [Aday hattı](candidates/README.md)

## Not

JSON problem bankası, yayın ve çalışma verisinin tek kanonik kaynağıdır. Obsidian notları ve aday hattı, araştırma ve editoryal taslak katmanıdır.
