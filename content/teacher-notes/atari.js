/**
 * content/teacher-notes/atari.js
 * RAG v0.6 — "atari" kavramı için yerel öğretim notu havuzu.
 * Saf veri, board-spesifik gerçek YOK (bkz. spesifikasyon §13).
 */

export const ATARI_NOTES = [
  {
    id: 'atari-explain-01',
    concept: 'atari',
    stage: 'instruction',
    purpose: 'explain',
    text: 'Bir taş ya da grup yalnızca tek bir nefes noktasında kaldığında atari durumundadır.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'atari-hint-01',
    concept: 'atari',
    stage: 'guided_practice',
    purpose: 'hint',
    studentStatus: ['not_started', 'learning'],
    text: 'Rakip taşın çevresindeki nefes noktalarını tek tek say — kaç tanesi hâlâ boş?',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'atari-reinforce-01',
    concept: 'atari',
    stage: 'guided_practice',
    purpose: 'reinforce',
    studentStatus: ['provisional', 'mastered'],
    priority: 5,
    text: 'Atariyi zaten tanıyorsun — bu kez grubun SON kalan boş noktasına odaklan.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'atari-confirm-01',
    concept: 'atari',
    stage: 'guided_practice',
    purpose: 'confirm',
    text: 'Doğru — bu grup gerçekten atari durumundaydı, son nefes noktasını buldun.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
];
