/**
 * scenes/topicsMap.js
 *
 * Öğrenme haritasının (Konular) saf veri katmanı — DOM yok. Registry
 * sırasını OLDUĞU GİBİ korur: bölümler yalnız bu sıranın ardışık
 * dilimlerine verilen başlıklardır, hiçbir konu yer değiştirmez ve yeni
 * kaydedilen bir konu bulunduğu yerin bölümüne kendiliğinden girer.
 * Kilit kuralı Konular listesinin eski kuralıyla aynıdır: tamamlanan,
 * o an açık olan ve sıradaki (ilk tamamlanmamış) konu seçilebilir.
 */

export const TOPIC_SECTIONS = [
  { title: 'Tahta ve nefes', blurb: 'Taşlar nereye konur, nasıl nefes alır.', startsAt: 'scene-01-board-intro' },
  { title: 'Taş alma', blurb: 'Son nefesi kapat, taşı tahtadan al.', startsAt: 'scene-06-capture-basics' },
  { title: 'Oyunun kuralları', blurb: 'Yasak hamleler, ko ve oyunun sonu.', startsAt: 'scene-08-illegal-moves' },
  { title: 'Yaşam ve taktik', blurb: 'Canlı gruplar ve klasik taktikler.', startsAt: 'scene-11-two-eyes' },
];

/**
 * Konuları registry sırasında bölümlere ayırır. Bir bölüm, `startsAt`
 * konusu listede göründüğü anda başlar; ilk bölümden önce gelen konular
 * ilk bölüme yazılır. Boş kalan bölümler atlanır.
 * @param {Array<{id:string}>} scenes registry.list() sırası
 * @returns {Array<{title:string, blurb:string, scenes:Array}>}
 */
export function groupTopics(scenes, sections = TOPIC_SECTIONS) {
  const starts = new Map(sections.map((section, i) => [section.startsAt, i]));
  const groups = sections.map(({ title, blurb }) => ({ title, blurb, scenes: [] }));
  let current = 0;
  for (const scene of scenes) {
    if (starts.has(scene.id)) current = Math.max(current, starts.get(scene.id));
    groups[current].scenes.push(scene);
  }
  return groups.filter(group => group.scenes.length);
}

/**
 * Her konu için harita durumu: 'done' (tamamlandı), 'active' (şu an açık),
 * 'next' (sıradaki, seçilebilir) veya 'locked'. Açık olan konu daha önce
 * tamamlanmışsa (tekrar modu) 'done' kalır; `current` ayrıca işaretlenir.
 * @returns {{states: Map<string,'done'|'active'|'next'|'locked'>, current: string|null, next: object|null, completedCount: number}}
 */
export function topicStates(scenes, completedIds, activeId) {
  const done = new Set(completedIds);
  const next = scenes.find(scene => !done.has(scene.id)) ?? null;
  const states = new Map();
  for (const scene of scenes) {
    if (done.has(scene.id)) states.set(scene.id, 'done');
    else if (scene.id === activeId) states.set(scene.id, 'active');
    else if (scene.id === next?.id) states.set(scene.id, 'next');
    else states.set(scene.id, 'locked');
  }
  const completedCount = scenes.filter(scene => done.has(scene.id)).length;
  return { states, current: activeId ?? null, next, completedCount };
}
