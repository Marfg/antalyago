/**
 * home/heroModes.js
 *
 * Ana sayfa açılış dersinin modları. Tahta dizilimleri ve metinler ders
 * sahnelerinin kendi modüllerinden gelir (Sahne 8-15); burada yalnız ana
 * sayfa motorunun (home/heroBoard.js) oynatacağı adımlara çevrilir. Böylece
 * örnekler tek kaynaktan gelir, kopyası tutulmaz.
 *
 * Modül, ziyaretçi mod seçiciye ilk yaklaştığında yüklenir.
 *
 * Adım biçimi:
 *   { cap, btn?, setup?: taşlar, marks?: işaretler, play?: otomatik hamleler,
 *     task?: { kind, color, targets, ... } }
 *   task.kind: 'answer' (doğru nokta), 'rule' (kural motorunun verdiği
 *   gerekçe: SUICIDE/KO), 'region' (oyun sonu alanları).
 */
import { STAGES } from '../scenes/illegalNativePolicy.js?v=2026-10-29.modlar';
import { getKoRuleMoments } from '../scenes/koRulePolicy.js?v=2026-10-29.modlar';
import { getEndgameCountingMoment } from '../scenes/endgameCountingPolicy.js?v=2026-10-29.modlar';
import { getTwoEyesMoments } from '../scenes/twoEyesPolicy.js?v=2026-10-29.modlar';
import { CONNECTION_SHAPES, CONNECTION_OFFSET } from '../scenes/connectionShapesPolicy.js?v=2026-10-29.modlar';
import { LADDER_SCENARIOS } from '../scenes/ladderScenarioData.js?v=2026-10-29.modlar';
import { NET_FORMS } from '../scenes/netScenarioData.js?v=2026-10-29.modlar';
import { SNAP_STEPS, buildScenario } from '../scenes/snapbackLessonPolicy.js?v=2026-10-29.modlar';

const color = c => (c === 'B' || c === 'black' ? 'black' : 'white');
/** Sahnelerin farklı nokta biçimlerini ({x,y}, {row,col}, [x,y]) tek biçime çevirir. */
const pt = p => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x ?? p.col, y: p.y ?? p.row });
const stone = s => ({ ...pt(s), color: color(s.color) });
const stones = list => list.map(stone);
const strip = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function illegalMode() {
  const stage = STAGES[0];
  return {
    id: 'yasak', label: 'Yasak hamle', steps: [{
      cap: stage.prompt,
      setup: stones(stage.stones),
      task: {
        kind: 'rule', reason: 'SUICIDE', color: 'black', all: true,
        targets: stage.targets.map(t => ({ ...pt(t), label: t.label })),
        found: (t, n, total) => `${t.label}: siyah taşın burada hiç nefesi olmaz. ${n}/${total}`,
        err: 'Bu noktaya siyah oynayabilir; taşın nefesi olur. Beyazların çevrelediği boşlukları dene.',
        ok: stage.conclusion,
      },
    }],
  };
}

function koMode() {
  const [reject, retake] = getKoRuleMoments();
  const capture = reject.scriptedMoves.map(m => ({ ...pt(m), color: color(m.color) }));
  const koPoint = pt(reject.koPoint);
  const ko = strip(reject.promptText);
  return {
    id: 'ko', label: 'Ko', steps: [
      { cap: ko.split('.')[0] + '. Siyah beyaz taşı alıyor.', btn: 'Siyah alsın', setup: stones(reject.board), after: capture },
      {
        cap: 'Şimdi beyaz olarak az önce alınan noktaya hemen geri oyna.',
        task: {
          kind: 'rule', reason: 'KO', color: 'white', targets: [koPoint],
          err: 'Beyazın alındığı noktayı dene: siyahın taşını hemen geri almak mümkün mü?',
          ok: 'Ko: beyaz hemen geri alamaz, tahta önceki pozisyona dönerdi. Önce başka bir yere oynamalı.',
          marks: [{ ...koPoint, type: 'ring-red' }],
        },
      },
      {
        cap: strip(retake.promptText).split('.').slice(0, 2).join('.') + '. Şimdi beyazla geri al.',
        setup: stones(retake.board),
        task: {
          kind: 'answer', color: 'white', targets: [pt(retake.koPoint)], place: true,
          err: 'Ko noktasına, siyah taşın tek nefesine oyna.',
          ok: 'Araya başka hamleler girince ko yeniden alınabilir.',
        },
      },
    ],
  };
}

function endgameMode() {
  const m = getEndgameCountingMoment();
  const black = m.blackRegionPoints.map(pt), white = m.whiteRegionPoints.map(pt);
  return {
    id: 'oyun-sonu', label: 'Oyun sonu', steps: [{
      cap: 'Oyun bitti. Siyahın çevirdiği alana dokun.',
      setup: stones(m.board),
      task: {
        kind: 'region', regions: [
          { color: 'black', points: black, ok: `Siyahın alanı: ${black.length} nokta. Şimdi beyazın alanına dokun.` },
          { color: 'white', points: white, ok: `Beyazın alanı: ${white.length} nokta. ${m.infoText}` },
        ],
        err: 'Taşların çevirdiği boş noktalara dokun; önce siyahın alanı.',
      },
    }],
  };
}

function twoEyesMode() {
  const ex = getTwoEyesMoments();
  const labels = targets => targets.map((t, i) => ({ ...pt(t), type: 'label', text: 'AB'[i] }));
  const ruleStep = m => ({
    cap: m.prompt, setup: stones(m.board), marks: labels(m.targets),
    task: { kind: 'rule', reason: 'SUICIDE', color: color(m.turn), all: true, targets: m.targets.map(pt),
      found: (t, n, total) => (n < total ? `Beyaz giremez: taşının hiç nefesi kalmaz. ${n}/${total}` : m.success),
      err: 'İşaretli noktayı dene.', ok: m.success },
  });
  const move = ex[4];
  return {
    id: 'iki-goz', label: 'İki göz', steps: [
      ruleStep(ex[0]),
      ruleStep(ex[2]),
      { cap: move.prompt, setup: stones(move.board),
        task: { kind: 'answer', color: color(move.turn), targets: move.targets.map(pt), place: true, err: move.fb_err, ok: move.success } },
    ],
  };
}

function connectionMode() {
  const o = p => ({ x: p[0] + CONNECTION_OFFSET, y: p[1] + CONNECTION_OFFSET });
  const shape = s => {
    const b = s.branches[0];
    return [
      { cap: `${s.tr}: ${s.geometry}`, btn: b.label, setup: s.stones.map(p => ({ ...o(p), color: 'black' })),
        marks: s.markers.map(m => ({ ...o(m), type: 'label', text: m[2] })), after: [{ ...o(b.opp), color: 'white' }] },
      { cap: 'Siyahla bağlan: kalan ortak noktaya oyna.',
        task: { kind: 'answer', color: 'black', targets: [o(b.answer)], place: true,
          err: 'Beyazın girdiği noktanın eşini bul: taşları birleştiren diğer nokta.', ok: `Bağlandı. ${s.purpose}` } },
    ];
  };
  return { id: 'baglanti', label: 'Bağlantı', steps: [...shape(CONNECTION_SHAPES[0]), ...shape(CONNECTION_SHAPES[3])] };
}

function ladderMode() {
  const l = LADDER_SCENARIOS.basic;
  const [first, ...rest] = l.moves.map(stone);
  return {
    id: 'merdiven', label: 'Merdiven', steps: [{
      cap: 'Beyaz taşın iki nefesi var. Siyah olarak beyazı kenara doğru zikzak kaçmaya zorlayan yönden atari ver.',
      setup: stones(l.seed),
      task: { kind: 'answer', color: 'black', targets: [first], place: true, after: rest,
        err: 'Bu yönden beyaz rahatça kaçar. Diğer nefesi kapat.',
        ok: 'Merdiven: beyaz her kaçışta yeniden atariye düşer ve kenarda alınır.' },
    }],
  };
}

function netSnapMode() {
  const n = NET_FORMS.basic;
  const exit = n.exits[0], close = n.closures[`${exit.x},${exit.y}`];
  const snap = SNAP_STEPS[0], frames = buildScenario(snap).frames.map(f => f.move).filter(Boolean).map(stone);
  return {
    id: 'ag-snapback', label: 'Ağ · Snapback', steps: [
      { cap: 'Ağ (geta): beyazın iki çıkışı var. Siyahla çaprazdan ağı kur.', setup: stones(n.seed),
        task: { kind: 'answer', color: 'black', targets: [pt(n.net)], place: true,
          after: [{ ...pt(exit), color: 'white' }, stone(close)],
          err: 'Çıkışları önden kapatan çapraz noktayı ara.', ok: 'Ağ kapandı: beyaz hangi yöne kaçarsa kaçsın yakalanır.' } },
      { cap: `Snapback: ${snap.title}. Siyahla kurban taşını koy.`, setup: stones(snap.form.seed),
        task: { kind: 'answer', color: 'black', targets: [frames[0]], place: true, after: frames.slice(1),
          err: 'Beyazın tek nefesine, taş vermeyi göze alarak oyna.',
          ok: 'Beyaz kurbanı aldı; siyah aynı noktadan üç taşı geri aldı.' } },
    ],
  };
}

/** İlk mod (Taş alma) açılıştaki dersin kendisidir; motor onu ayrıca oynatır. */
export function buildModes() {
  return [illegalMode(), koMode(), endgameMode(), twoEyesMode(), connectionMode(), ladderMode(), netSnapMode()];
}
