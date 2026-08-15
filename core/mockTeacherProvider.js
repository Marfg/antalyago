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
 */

function colorTr(color) {
  return color === 'white' ? 'Beyaz' : 'Siyah';
}

function hintLevelFor(attempt) {
  if (attempt <= 1) return 1;
  if (attempt === 2) return 2;
  return 3;
}

function mockResponseFor(context) {
  const attempt = context?.student?.attempt ?? 1;
  const evalResult = context?.evaluation?.result;
  const obs = context?.boardObservation;

  if (evalResult === 'correct') {
    const count = context?.evaluation?.capturedCount ?? 0;
    const message = count > 1
      ? `Harika! ${count} taşı birden yakaladın — grubun son nefes noktasını doğru buldun.`
      : 'Harika! Taşın son nefes noktasını doğru buldun.';
    return { action: 'say', message, hintLevel: null };
  }

  if (obs?.isAtari) {
    const hintLevel = hintLevelFor(attempt);
    let message;
    if (hintLevel === 1) {
      message = 'Rakip taşın kalan nefes noktasını tekrar bulmaya çalış.';
    } else if (hintLevel === 2) {
      message = `${colorTr(obs.targetColor)} grubun artık yalnızca tek nefes noktası var — o boş komşuyu bul.`;
    } else {
      message = `${colorTr(obs.targetColor)} grubun son nefes noktası: ${obs.remainingLiberties.join(', ')}.`;
    }
    return { action: 'give_hint', message, hintLevel };
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
