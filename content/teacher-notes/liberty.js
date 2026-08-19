/**
 * content/teacher-notes/liberty.js
 * RAG v0.6 — "liberty" (nefes noktası) kavramı için yerel öğretim notu havuzu.
 * Saf veri, board-spesifik gerçek YOK (bkz. spesifikasyon §13).
 */

export const LIBERTY_NOTES = [
  {
    id: 'liberty-explain-01',
    concept: 'liberty',
    stage: 'instruction',
    purpose: 'explain',
    text: 'Bir taşın yatay ve dikey komşu boş noktalarına nefes noktası denir. Çapraz noktalar sayılmaz.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'liberty-hint-01',
    concept: 'liberty',
    stage: 'guided_practice',
    purpose: 'hint',
    studentStatus: ['not_started', 'learning'],
    text: 'Taşın yatay ve dikey komşularına odaklan. Çapraz noktaları nefes noktası olarak sayma.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'liberty-reinforce-01',
    concept: 'liberty',
    stage: 'guided_practice',
    purpose: 'reinforce',
    studentStatus: ['provisional', 'mastered'],
    priority: 5,
    text: 'Nefes noktalarını zaten iyi tanıyorsun — bu kez taşın veya grubun TÜM boş komşularını tek tek gözden geçir.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'liberty-confirm-01',
    concept: 'liberty',
    stage: 'guided_practice',
    purpose: 'confirm',
    text: 'Doğru! Bu nokta taşın veya grubun gerçek bir nefes noktasıydı.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
];
