/**
 * core/handicapLadder.js
 *
 * Robot gücü sabittir; oyuncu handikap merdiveninde ilerler. Yeni oyuncu dört
 * taşla başlar, her galibiyet bir basamak çıkarır, yenilgi basamağı değiştirmez.
 * Saf: localStorage'a yalnız çağıran dokunur.
 */

export const LADDER_STORAGE_KEY = 'antalyago.robotLadder.v1';
const VERSION = 1;

const STAR_POINTS = [{ x: 2, y: 2 }, { x: 6, y: 6 }, { x: 6, y: 2 }, { x: 2, y: 6 }];

export const LADDER = Object.freeze([
  Object.freeze({ id: 'h4', title: 'Dört taşla', lead: 'Tahtada dört taşın hazır. Kazanırsan sonraki oyuna üç taşla başlarsın.', stones: 4, komi: 0.5 }),
  Object.freeze({ id: 'h3', title: 'Üç taşla', lead: 'Tahtada üç taşın hazır. Kazanırsan sonraki oyuna iki taşla başlarsın.', stones: 3, komi: 0.5 }),
  Object.freeze({ id: 'h2', title: 'İki taşla', lead: 'Tahtada iki taşın hazır. Kazanırsan sonraki oyunda boş tahtaya ilk taşı sen koyarsın.', stones: 2, komi: 0.5 }),
  Object.freeze({ id: 'h1', title: 'İlk hamle senin', lead: 'Tahta boş, ilk taşı sen koyuyorsun. Kazanırsan robotla eşit şartlarda oynarsın.', stones: 0, komi: 0.5 }),
  Object.freeze({ id: 'even', title: 'Eşit oyun', lead: 'Eşit şartlardasın: ilk taş senin, robota 6,5 puan yazılır.', stones: 0, komi: 6.5 }),
]);

export function createLadder() {
  return { version: VERSION, level: 0, wins: 0, games: 0 };
}

export function loadLadder(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.version !== VERSION) return createLadder();
    const counts = [value.level, value.wins, value.games];
    if (!counts.every(n => Number.isInteger(n) && n >= 0) || value.level >= LADDER.length) return createLadder();
    return { version: VERSION, level: value.level, wins: value.wins, games: value.games };
  } catch {
    return createLadder();
  }
}

/** Basamağın oyun ayarı: { stones:[{x,y}], komi, title, index, total }. */
export function gameSettings(ladder) {
  const step = LADDER[ladder.level];
  return {
    stones: STAR_POINTS.slice(0, step.stones).map(p => ({ ...p })),
    komi: step.komi,
    title: step.title,
    lead: step.lead,
    index: ladder.level,
    total: LADDER.length,
  };
}

/** Biten oyunu işler. @returns {{ladder:object, advanced:boolean, top:boolean}} */
export function recordResult(ladder, won) {
  const current = loadLadder(ladder);
  const next = { ...current, games: current.games + 1, wins: current.wins + (won ? 1 : 0) };
  const canAdvance = won && next.level < LADDER.length - 1;
  if (canAdvance) next.level += 1;
  return { ladder: next, advanced: canAdvance, top: next.level === LADDER.length - 1 };
}
