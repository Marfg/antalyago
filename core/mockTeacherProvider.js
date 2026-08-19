/**
 * core/mockTeacherProvider.js
 *
 * Provider sözleşmesi (bkz. spesifikasyon §4):
 *   { name: string, async generateTeacherResponse(context) -> {
 *       ok: boolean, raw: string|object, error: string|null,
 *       latencyMs: number, provider: string,
 *   } }
 *
 * Gerçek bir API çağrısı yapmadan önce TÜM Teacher Assistant hattının
 * (validation, fallback, Teacher Panel, event log) internet olmadan test
 * edilebilmesi için mock provider. Context'e göre SABİT (rastgelelik yok),
 * yapılandırılmış bir cevap üretir — core/claudeTeacherProvider.js ile
 * TAMAMEN aynı sözleşmeyi uygular; core/teacherAssistant.js hangisinin
 * kullanıldığını bilmez.
 *
 * v0.4 — kademeli yardım: attempt 1-2'de sözlü ipucu (give_hint), attempt
 * 3+'te (yalnızca uygun bir boardObservation varsa) "show_liberties" tool
 * talebi. Mock'un kendisi de her zaman olduğu gibi hiçbir koordinat
 * üretmez — action adından fazlasını döndürmez, gerçek hedefi
 * core/teacherToolRouter.js bulur.
 *
 * v0.5 — context.studentModel.status varsa hint tonu buna göre değişir:
 * "mastered" bir kavramda öğrenciye daha kısa/az destekleyici bir mesaj
 * verilir (bkz. spesifikasyon §15/§27 örnekleri). Student Model YALNIZCA
 * okunur — mock hiçbir zaman onu değiştirmez.
 *
 * v0.6 — context.retrieval.matched ise (atari VEYA atarisiz saf kavram
 * tanıma adımlarında — ör. l2'nin liberty-only adımları, bkz. v0.5.1)
 * ilk seviye hint/onay için ÖNCE retrieval'in metnini kullanır — sabit
 * kodlu cümle yerine. Mock bir retrieval ENGINE'i DEĞİLDİR: yalnız
 * "retrieval item varsa kullanılabilir" davranışını göstermek için
 * uygulanır; retrieval yoksa (context.retrieval eksik/matched:false)
 * davranış v0.5 ile birebir aynı kalır.
 */

function colorTr(color) {
  return color === 'white' ? 'Beyaz' : 'Siyah';
}

function hintLevelFor(attempt) {
  return attempt <= 1 ? 1 : 2;
}

function mockResponseFor(context) {
  const attempt = context?.student?.attempt ?? 1;
  const evalResult = context?.evaluation?.result;
  const obs = context?.boardObservation;
  const retrievedText = context?.retrieval?.matched ? (context.retrieval.items?.[0]?.text ?? null) : null;

  if (evalResult === 'correct') {
    const count = context?.evaluation?.capturedCount ?? 0;
    const message = retrievedText || (count > 1
      ? `Harika! ${count} taşı birden yakaladın — grubun son nefes noktasını doğru buldun.`
      : 'Harika! Taşın son nefes noktasını doğru buldun.');
    return { action: 'say', message, hintLevel: null };
  }

  if (obs?.isAtari) {
    if (attempt >= 3) {
      return {
        action: 'show_liberties',
        message: `${colorTr(obs.targetColor)} grubun açık kalan nefes noktasına birlikte bakalım.`,
        hintLevel: null,
      };
    }
    const hintLevel = hintLevelFor(attempt);
    const status = context?.studentModel?.status;
    let message;
    if (status === 'mastered') {
      // Bu kavramda zaten güvenilir — uzun/destekleyici anlatıma gerek yok.
      message = 'Son nefes noktasını gözden kaçırdın. Tekrar dene.';
    } else if (hintLevel === 1) {
      message = retrievedText || 'Rakip taşın kalan nefes noktasını tekrar bulmaya çalış.';
    } else {
      message = `${colorTr(obs.targetColor)} grubun artık yalnızca tek nefes noktası var — o boş komşuyu bul.`;
    }
    return { action: 'give_hint', message, hintLevel };
  }

  // v0.6 — atari YOK ama yine de yanlış cevap verildi (ör. saf nefes
  // noktası tanıma adımı, bkz. v0.5.1). Retrieval eşleştiyse bunu bir
  // sözlü ipucu olarak kullan; eşleşmediyse mevcut genel mesaj korunur.
  if (evalResult === 'incorrect' && retrievedText) {
    return { action: 'give_hint', message: retrievedText, hintLevel: 1 };
  }

  return { action: 'say', message: 'Tahtaya tekrar bak ve az önce anlatılanı uygulamaya çalış.', hintLevel: null };
}

export function createMockTeacherProvider() {
  return {
    name: 'mock',
    async generateTeacherResponse(context) {
      const startedAt = Date.now();
      const response = mockResponseFor(context);
      return {
        ok: true,
        raw: JSON.stringify(response),
        error: null,
        latencyMs: Date.now() - startedAt,
        provider: 'mock',
      };
    },
  };
}
