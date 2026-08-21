/**
 * scenes/boardZones.js
 *
 * Sahne #3'ün ("Taşların Nefesi") serbest nefes keşfi için saf, DOM'suz
 * konum sınıflandırması. RuleEngine'in GERÇEK nefes sayısını YENİDEN
 * HESAPLAMAZ/ÖNGÖRMEZ — yalnız pedagojik bir etiket üretir ("köşe" /
 * "kenar" / "iç bölge"), sahne modülünün hangi bölge türlerinin
 * görüldüğünü (exploration takibi) izlemesine yardımcı olur.
 *
 * Gerçek nefes sayısı HER ZAMAN adapters/sceneBoardAdapter.js'in
 * getLibertiesAt() → core/ruleEngine.js zincirinden gelir.
 */

/**
 * @param {{row:number, col:number, size:number}} point
 * @returns {'corner'|'edge'|'interior'}
 */
export function classifyBoardZone({ row, col, size }) {
  const onRowEdge = row === 0 || row === size - 1;
  const onColEdge = col === 0 || col === size - 1;
  if (onRowEdge && onColEdge) return 'corner';
  if (onRowEdge || onColEdge) return 'edge';
  return 'interior';
}

/** Boş bir tahtada, TEK bir taş için beklenen pedagojik nefes sayısı —
    yalnız Studio Diagnostics ve testlerin çapraz-doğrulaması için;
    sahne modülü ASLA bu sabitleri gerçek RuleEngine sonucunun YERİNE
    kullanmaz (bkz. dosya başı notu). */
export const EXPECTED_LIBERTY_COUNT_BY_ZONE = { corner: 2, edge: 3, interior: 4 };
