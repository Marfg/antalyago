/**
 * Stüdyo çıktı adaptörü yetenekleri.
 *
 * Her giriş hangi Faz'da uygulanacağını ve mevcut durumu bildirir.
 * Desteklenmeyen adaptörler çağrılmamalıdır — bu modül kontrol noktasıdır.
 *
 * Status eşlemesi (StudioDocument → Problem Bank) kasıtlı olarak Faz E'ye
 * bırakılmıştır. "archived → rejected" ve "approved → verified" gibi
 * semantik eşlemeler yayın süreci tanımlandıktan sonra uygulanacaktır.
 */

export const OUTPUT_CAPABILITIES = Object.freeze({
  problemBank: {
    phase: 'E',
    supported: false,
    description: 'StudioDocument → content/problem-bank/problems/*.json',
    note: 'Status eşlemesi Faz E\'de tanımlanacak.',
  },
  lesson3d: {
    phase: 'E',
    supported: false,
    description: 'StudioDocument → ogren-3d.html LessonEngine step',
  },
  sgf: {
    phase: 'E',
    supported: true,
    description: 'StudioDocument → SGF dosyası',
    note: 'formatSGF() (studio/adapters/sgfAdapter.js) + AG-STUDIO desktop "SGF dışa aktar" butonu (S10C) üzerinden aktif.',
  },
  motion: {
    phase: 'F',
    supported: false,
    description: 'StudioDocument → motion/video zaman çizgisi JSON',
  },
  obsidian: {
    phase: 'E',
    supported: false,
    description: 'StudioDocument → Obsidian Markdown kaydı',
  },
  image: {
    phase: 'F',
    supported: false,
    description: 'StudioDocument → PNG/SVG tahta görseli',
  },
});

export function getCapability(outputType) {
  return OUTPUT_CAPABILITIES[outputType] ?? null;
}

export function isSupported(outputType) {
  return OUTPUT_CAPABILITIES[outputType]?.supported === true;
}
