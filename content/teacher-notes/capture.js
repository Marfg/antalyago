/**
 * content/teacher-notes/capture.js
 * RAG v0.6 — "capture" (taş alma) kavramı için yerel öğretim notu havuzu.
 * Saf veri, board-spesifik gerçek YOK (bkz. spesifikasyon §13).
 */

export const CAPTURE_NOTES = [
  {
    id: 'capture-explain-01',
    concept: 'capture',
    stage: 'instruction',
    purpose: 'explain',
    text: 'Bir taşın veya grubun tüm nefes noktaları doldurulduğunda o taş/grup tahtadan kalkar.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'capture-hint-01',
    concept: 'capture',
    stage: 'guided_practice',
    purpose: 'hint',
    studentStatus: ['not_started', 'learning'],
    text: 'Bir taşı almak için rakibin son nefes noktasını kapatman gerekir.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'capture-reinforce-01',
    concept: 'capture',
    stage: 'guided_practice',
    purpose: 'reinforce',
    studentStatus: ['provisional', 'mastered'],
    priority: 5,
    text: 'Taş almayı biliyorsun — grup birden fazla taştan oluşuyorsa hepsinin AYNI ANDA kalkacağını unutma.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
  {
    id: 'capture-confirm-01',
    concept: 'capture',
    stage: 'guided_practice',
    purpose: 'confirm',
    text: 'Mükemmel — son nefes noktasını kapatarak taşı doğru şekilde aldın.',
    sourceType: 'curriculum_note',
    sourceRef: 'internal',
  },
];
