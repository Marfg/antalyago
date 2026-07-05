# AntalyaGo Problem Havuzu

Bu klasör, yayınlanan problem kayıtlarının çalışma karşılığıdır. Kaynak notları Obsidian'da, yayın verisi ise JSON problem bankasında tutulur.

## Mevcut durum

- Problem sayısı küçük bir başlangıç kümesidir; fazların amacı bu yapıyı sözleşmeye bağlamaktır.
- Mevcut kayıtlar `index.json` ile dosya düzeyinde ayrışır.
- `content/problem-bank/schema/problem.schema.json` legacy `1.0.0` kayıtlarını ve canonical `1.1.0` adaylarını kabul eden köprü şemadır.

## Kullanım

- Doğrulama: `npm run validate-problems`
- Envanter ve kalite denetimi: `npm run audit-problem-bank`
- Güvenli migration dry-run: `npm run migrate-problem-bank`
- Güvenli apply: `npm run migrate-problem-bank -- --apply`
- Bir problem kaydını 3B derse çevirme: `problemToLessonStep(problem)`

## Dokümanlar

- [Taksonomi](docs/taxonomy.md)
- [Kaynak/provenance](docs/source-provenance.md)
- [Schema versioning ve migration](docs/schema-versioning.md)
- [Studio adaptör sözleşmesi](docs/studio-adapter-contract.md)
- [PDF ingestion workflow](docs/pdf-ingestion-workflow.md)

## Sözleşme notu

Kanonik modelde JSON çalışma/yayın verisinin tek kaynağıdır. Obsidian notları, araştırma ve editoryal takip katmanı olarak kalır.
