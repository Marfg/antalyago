/**
 * core/contentStore.js
 *
 * RAG v0.6 — content/teacher-notes/*.js'teki HAM içerik dizilerini
 * toplar ve core/contentValidation.js ile doğrular. Yalnız GEÇERLİ
 * entry'ler `TEACHING_NOTES` olarak dışa açılır; geçersizler sessizce
 * `TEACHING_NOTES_DIAGNOSTICS`'e düşer — bir yazım hatası retrieval'i
 * ASLA bozmaz (bkz. spesifikasyon §14).
 *
 * content/ klasörü kasıtlı olarak SAF VERİ kalır (hiçbir import taşımaz);
 * doğrulama sorumluluğu tamamen core/'da.
 */

import { STONE_PLACEMENT_NOTES } from '../content/teacher-notes/stonePlacement.js';
import { LIBERTY_NOTES } from '../content/teacher-notes/liberty.js';
import { ATARI_NOTES } from '../content/teacher-notes/atari.js';
import { CAPTURE_NOTES } from '../content/teacher-notes/capture.js';
import { validateContentSet } from './contentValidation.js';

const RAW_NOTES = [
  ...STONE_PLACEMENT_NOTES,
  ...LIBERTY_NOTES,
  ...ATARI_NOTES,
  ...CAPTURE_NOTES,
];

const { valid, invalid, duplicateIds } = validateContentSet(RAW_NOTES);

export const TEACHING_NOTES = valid;
export const TEACHING_NOTES_DIAGNOSTICS = invalid;
export const TEACHING_NOTES_DUPLICATE_IDS = duplicateIds;
