# AntalyaGo Problem Havuzu

Bu klas?r, yay?nlanan problem kay?tlar?n?n ?al??ma kar??l???d?r. Kaynak notlar? Obsidian'da, yay?n verisi ise JSON problem bankas?nda tutulur.

## Mevcut durum

- Problem say?s? k???k bir ba?lang?? k?mesidir; fazlar?n amac? bu yap?y? s?zle?meye ba?lamakt?r.
- Mevcut kay?tlar `index.json` ile dosya d?zeyinde ayr???r.
- `content/problem-bank/schema/problem.schema.json` legacy `1.0.0` kay?tlar?n? ve canonical `1.1.0` adaylar?n? kabul eden k?pr? ?emad?r.

## Kullan?m

- Do?rulama: `npm run validate-problems`
- Envanter ve kalite denetimi: `npm run audit-problem-bank`
- G?venli migration dry-run: `npm run migrate-problem-bank`
- G?venli apply: `npm run migrate-problem-bank -- --apply`
- Bir problem kayd?n? 3B derse ?evirme: `problemToLessonStep(problem)`

## Dok?manlar

- [Taksonomi](docs/taxonomy.md)
- [Kaynak/provenance](docs/source-provenance.md)
- [Schema versioning ve migration](docs/schema-versioning.md)
- [Studio adapt?r s?zle?mesi](docs/studio-adapter-contract.md)
- [PDF ingestion workflow](docs/pdf-ingestion-workflow.md)
- [Kaynak katalogu](sources/README.md)

## S?zle?me notu

Kanonik modelde JSON ?al??ma/yay?n verisinin tek kayna??d?r. Obsidian notlar?, ara?t?rma ve editoryal takip katman? olarak kal?r. Kaynak katalo?unda rights modeli lisans ve da??t?m kapsam?n? boolean d???nda a??k?a ta??r.
