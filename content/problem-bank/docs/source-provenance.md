# Kaynak / Provenance S?zle?mesi

Problem bankas?nda iki ayr? otorite katman? vard?r:

1. JSON problem verisi: ?al??ma ve yay?n verisinin tek kayna??
2. Obsidian notlar?: ara?t?rma, tasnif ve editoryal takip katman?

?ift y?nl? kontrols?z senkronizasyon yoktur.

## Canonical problem source modeli

Problem kay?tlar?nda canonical source ?u ?? alanla s?n?rl?d?r:

- `source.sourceId`
- `source.locator.type`
- `source.locator.value`
- `source.usage`

Legacy provenance ayr?nt?lar? (`documentId`, `page`, `name`, `type`, `hash`, `importedAt`, `license` vb.) kaynak katalo?unda veya migration ge?mi?inde tutulur; problem kayd?nda zorunlu de?ildir.

## S?n?fland?rma ve migration notu

- `source.locator.type`: `pdf-page` / `printed-page` / `section` / `unresolved`
- `source.usage`: `concept_reference` / `adapted` / `original`
- `source.locator.value`: sayfa, b?l?m ya da belirsiz locator de?eri
- canonical migration, kaynak ayr?nt?lar?n? problem kayd?ndan sadele?tirir; katalog referans? korunur

## Katalog ile ayr?m

Kaynak katalo?u ?u ayr?nt?lar? tutar:

- kaynak ad? ve alternatif adlar
- belge metadata's?
- dil ve text layer durumu
- visible title / visible author
- rights / lisans / distribution scope
- file hash ve page count
- page locator ve confidence

Problem kayd? bunlar? tekrar etmez; yaln?zca katalog referans?n? ta??r.

## G?venli varsay?mlar

- Bilinmeyen importedAt uydurulmaz.
- Problem JSON hash'i source.hash olarak kullan?lmaz.
- Hak ve lisans kararlar? katalogda do?rulan?r; problem kayd? kopya hak verisi ta??maz.
