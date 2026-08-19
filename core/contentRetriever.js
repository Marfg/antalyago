/**
 * core/contentRetriever.js
 *
 * RAG v0.6 — deterministik, embedding'siz içerik alma katmanı.
 *
 *   Structured query → local content store → deterministic retrieval →
 *   selected content
 *
 * Bilinçli olarak YOK: embedding, vector similarity, reranking, semantic
 * search. Veri şekli (query: concept/stage/studentStatus/purpose, entry:
 * text/tags/concept/stage/purpose) ileride semantic retrieval eklenmesine
 * ENGEL OLMAYACAK şekilde tasarlandı, ama bu sürüm yalnız alan eşleşmesi
 * kullanır (bkz. spesifikasyon §3/§28).
 *
 * Saf: DOM yok, API yok, localStorage yok, provider yok. Girdi: query +
 * entries dizisi. Çıktı: yeni bir sonuç nesnesi, hiçbir yan etki.
 */

import { KNOWN_CONCEPTS } from './conceptMap.js';

export const MAX_RETRIEVAL_ITEMS = 2;

/**
 * Purpose deterministik olarak TEK bu fonksiyondan belirlenir (bkz.
 * spesifikasyon §8 — "magic conditional'ları farklı dosyalara dağıtma").
 *
 * instruction stage         → explain
 * evaluation correct        → confirm
 * evaluation incorrect
 *   + learning/not_started/bilinmiyor → hint
 *   + provisional/mastered            → reinforce
 * (diğer tüm durumlar)       → explain
 *
 * @param {{stage:?string, evaluationResult:?string, studentStatus:?string}} params
 * @returns {'explain'|'hint'|'reinforce'|'confirm'}
 */
export function resolvePurpose({ stage, evaluationResult, studentStatus } = {}) {
  if (stage === 'instruction') return 'explain';
  if (evaluationResult === 'correct') return 'confirm';
  if (evaluationResult === 'incorrect') {
    return (studentStatus === 'provisional' || studentStatus === 'mastered') ? 'reinforce' : 'hint';
  }
  return 'explain';
}

/**
 * Mevcut deterministik sistemden (concept/stage/Student Model/evaluation)
 * structured retrieval query'sini üretir. LLM bu query'yi ASLA üretmez.
 *
 * @param {{concept:string, stage:?string, studentStatus:?string, evaluationResult:?string}} params
 */
export function buildRetrievalQuery({ concept, stage = null, studentStatus = null, evaluationResult = null }) {
  return {
    concept,
    stage,
    studentStatus: studentStatus ?? null,
    evaluation: evaluationResult ?? null,
    purpose: resolvePurpose({ stage, evaluationResult, studentStatus }),
  };
}

function matchesStatus(entry, studentStatus) {
  if (!Array.isArray(entry.studentStatus) || entry.studentStatus.length === 0) return true; // wildcard — herkese uygun
  if (!studentStatus) return false; // entry belirli bir status istiyor ama bilinmiyor
  return entry.studentStatus.includes(studentStatus);
}

function scoreEntry(entry, { stage, studentStatus, purpose }) {
  let score = 0;
  if (entry.purpose === purpose) score += 40;
  if (entry.stage === stage) score += 20;
  if (matchesStatus(entry, studentStatus)) score += 10;
  score += (typeof entry.priority === 'number' ? entry.priority : 0) * 0.1;
  return score;
}

function reasonFor(entry, { stage, studentStatus, purpose }) {
  return {
    concept: true, // bu noktaya kadar zaten concept'e göre filtrelendi
    purpose: entry.purpose === purpose,
    stage: entry.stage === stage,
    studentStatus: matchesStatus(entry, studentStatus),
  };
}

function rankAndSlice(matches, query) {
  const scored = matches.map(entry => ({ entry, score: scoreEntry(entry, query) }));
  scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  return scored.slice(0, MAX_RETRIEVAL_ITEMS).map(({ entry, score }) => ({
    id: entry.id,
    text: entry.text,
    score,
    reason: reasonFor(entry, query),
  }));
}

/**
 * Deterministik retrieval. Fallback merdiveni HER ZAMAN concept'i sabit
 * tutar — farklı bir concept'e asla düşmez (bkz. spesifikasyon §11).
 *
 * @param {object} params
 * @param {{concept:string, stage:?string, studentStatus:?string, purpose:string}} params.query
 * @param {Array<object>} params.entries — genelde core/contentStore.js'in TEACHING_NOTES'u
 * @returns {{matched:boolean, items:Array<{id:string,text:string,score:number,reason:object}>, fallbackLevel:'exact'|'concept+purpose+stage'|'concept+purpose'|'concept'|'none'}}
 */
export function retrieveContent({ query, entries }) {
  const concept = query?.concept;
  if (!concept || !KNOWN_CONCEPTS.includes(concept) || !Array.isArray(entries) || !entries.length) {
    return { matched: false, items: [], fallbackLevel: 'none' };
  }

  const byConcept = entries.filter(e => e.concept === concept);
  if (!byConcept.length) return { matched: false, items: [], fallbackLevel: 'none' };

  const { stage, studentStatus, purpose } = query;
  const ladder = [
    { level: 'exact', test: e => e.purpose === purpose && e.stage === stage && matchesStatus(e, studentStatus) },
    { level: 'concept+purpose+stage', test: e => e.purpose === purpose && e.stage === stage },
    { level: 'concept+purpose', test: e => e.purpose === purpose },
    { level: 'concept', test: () => true },
  ];

  for (const { level, test } of ladder) {
    const matches = byConcept.filter(test);
    if (matches.length) {
      return { matched: true, items: rankAndSlice(matches, { stage, studentStatus, purpose }), fallbackLevel: level };
    }
  }

  return { matched: false, items: [], fallbackLevel: 'none' };
}
