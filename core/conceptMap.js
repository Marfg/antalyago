/**
 * core/conceptMap.js
 *
 * Merkezi, genişletilebilir kavram listesi — Student Model v0.5.
 *
 * Bu dosya kasıtlı olarak küçük tutuldu: yeni bir kavram eklemek (ör.
 * ileride 'ko') yalnızca bu listeyi ve LESSON_DEFAULT_CONCEPT eşlemesini
 * güncellemeyi gerektirir, core/studentModel.js veya event derivation
 * kodunun kendisini değil.
 *
 * Not: core/teacherContext.js'in LESSON_CONCEPT eşlemesi (l2→liberty,
 * l3→capture) BİLEREK burada birleştirilmedi — o, LLM'e giden "bu ders
 * hangi konu" özetidir (kaba taneli). Buradaki liste Student Model'in
 * PER-ETKİLEŞİM izlediği daha ince taneli kavramlardır (atari, capture'dan
 * AYRI bir kova). İkisi farklı amaçlara hizmet eder — bkz. kapanış
 * raporu "Concept mapping" bölümü.
 *
 * Saf: yan etkisi yok.
 */

export const KNOWN_CONCEPTS = ['stone_placement', 'liberty', 'atari', 'capture'];

// Bir dersin, o an tespit edilen atari/capture olmadığında varsayılan
// kavramı (ör. l1'in "herhangi bir yere taş koy" adımı → stone_placement).
const LESSON_DEFAULT_CONCEPT = { l1: 'stone_placement', l2: 'liberty', l3: 'capture' };

export function defaultConceptForLesson(lessonId) {
  return LESSON_DEFAULT_CONCEPT[lessonId] ?? 'stone_placement';
}
