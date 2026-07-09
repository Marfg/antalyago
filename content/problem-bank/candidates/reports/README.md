# Candidate Reports

Bu dizin, aday tarama, review ve promotion preview çıktıları için ayrılmıştır.

Kural:

- Kalıcı, canonical problem JSON'u burada tutulmaz.
- Review raporları JSON ana kaynak olarak üretilir; gerekiyorsa Markdown yalnızca ikincil özet olabilir.
- Geçici preview raporları test veya CI tarafında yeniden üretilebilir.
- Gerçek problem havuzuna aktarım, sadece insan onaylı review kapısından sonra yapılır.
- Varsayılan komutlar dosya yazmaz; `--output` açıkça verildiğinde rapor saklanabilir.

Önerilen dosya adları:

- `<candidateId>.review-report.json`
- `<candidateId>.promotion-report.json`
- `review-candidates-report.json`
- `promotion-report.json`
