# AntalyaGo Problem Havuzu

Bu klas?r, problem bankas?n?n ?al??ma alan?d?r. JSON problem verisi yay?n ve ?al??ma kayd?d?r; kaynak ayr?nt?lar? ayr? kaynak katalo?unda tutulur.

## Mevcut s?zle?me

- Problem kay?tlar? `index.json` ile dosya d?zeyinde izlenir.
- `content/problem-bank/schema/problem.schema.json` legacy `1.0.0` kay?tlar?n? ve canonical `1.1.0` kay?tlar?n? birlikte kabul eden k?pr? ?emad?r.
- Canonical problem source modeli ?? alanla s?n?rl?d?r:
  - `source.sourceId`
  - `source.locator.type` / `source.locator.value`
  - `source.usage`
- `source.documentId`, `source.page` ve di?er ayr?nt?l? provenance alanlar? yaln?zca legacy giri? veya migration ad?mlar?nda g?r?l?r.
- Hak, lisans, import tarihi, visible title/author ve dosya hash'i gibi ayr?nt?lar kaynak katalo?unda tutulur.

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
- [Kaynak katalo?u](sources/README.md)

## S?zle?me notu

Kanonik modelde JSON ?al??ma/yay?n verisinin tek kayna??d?r. Obsidian notlar? ara?t?rma ve editoryal takip katman?d?r. Kaynak katalo?u rights modelini, lisans? ve da??t?m kapsam?n? a??k?a ta??r.
