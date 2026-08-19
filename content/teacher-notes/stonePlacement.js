/**
 * content/teacher-notes/stonePlacement.js
 *
 * RAG v0.6 — "stone_placement" kavramı için yerel öğretim notu havuzu.
 *
 * Saf veri. Board-spesifik hiçbir gerçek İÇERMEZ (koordinat, "doğru cevap"
 * vb.) — yalnız genel pedagojik bilgi (bkz. spesifikasyon §13). Go
 * gerçeğinin kaynağı hâlâ core/ruleEngine.js'tir, bu dosya değil.
 */

export const STONE_PLACEMENT_NOTES = [
  {
    id: 'stone_placement-explain-01',
    concept: 'stone_placement',
    stage: 'instruction',
    purpose: 'explain',
    text: 'Taşlar karelerin içine değil, çizgilerin kesişim noktalarına yerleştirilir.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'stone_placement-hint-01',
    concept: 'stone_placement',
    stage: 'guided_practice',
    purpose: 'hint',
    studentStatus: ['not_started', 'learning'],
    text: 'Tahtadaki herhangi bir boş kesişim noktasına dokunabilirsin — henüz doğru/yanlış bir seçim yok.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'stone_placement-confirm-01',
    concept: 'stone_placement',
    stage: 'guided_practice',
    purpose: 'confirm',
    text: 'Doğru — taşlar tam olarak böyle, çizgilerin kesiştiği noktalara konur.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
];
