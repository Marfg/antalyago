# Problem Bank Source Catalog

Bu klas?r, problem bankas?nda kullan?lan d?? kaynaklar?n g?venli ve izlenebilir bir kayd?n? tutar.

Kurallar:

- Yay?nlanabilir JSON dosyalar?na mutlak yerel yollar yaz?lmaz.
- Kaynak dosyalar? repoya kopyalanmaz.
- Lisans durumu do?rulanmam?? kay?tlar `permission-required` veya `unknown` olarak b?rak?l?r.
- Bu klas?r, problem JSON migration yerine kaynak kimli?i ve uzla?t?rma preview'si sa?lar.
- `reconciliation-preview.json` generated dosyad?r; canonical repo ??kt?s? de?ildir.

Dosyalar:

- `source.schema.json`: katalog ?emas?
- `catalog.json`: do?rulanm?? kaynak listesi
- `local-paths.example.json`: yerel makinedeki dosya e?lemesi i?in ?rnek ?ablon

?u anda iki kaynak katalogland?:

- `falling-in-love-with-baduk`: mevcut ?? problem kayd?n?n temel kayna??
- `igotext`: ilerideki ingestion ?al??malar? i?in ayr?lan ek kaynak
