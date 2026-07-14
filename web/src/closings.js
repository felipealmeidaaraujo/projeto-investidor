// Casa trades PRÉ-JOGO (Match Odds) com os fechamentos Pinnacle (tennis-data). Funções puras.
import { matchesModelName } from './match-names.js';
import { clvPct } from './finance.js';

/** Data ISO ('2026-07-12T14:30') → inteiro AAAAMMDD (ou null). */
export function ymd(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : null;
}

function ymdToDate(n) {
  return new Date(Date.UTC(Math.floor(n / 10000), Math.floor((n % 10000) / 100) - 1, n % 100));
}
function daysBetween(a, b) {
  return Math.abs((ymdToDate(a) - ymdToDate(b)) / 86400000);
}

/** Acha a odd de fechamento do lado apostado, ou null. */
export function matchClosing(trade, closings, { windowDays = 4 } = {}) {
  if (trade.market !== 'Match Odds' || trade.entryType !== 'pre') return null;
  if (!trade.players?.a || !trade.players?.b || !trade.side) return null;
  if (typeof trade.oddClose === 'number') return null;
  const td = ymd(trade.date);
  if (td == null) return null;

  const sidePlayer = trade.side === 'a' ? trade.players.a : trade.players.b;
  const otherPlayer = trade.side === 'a' ? trade.players.b : trade.players.a;

  let best = null;
  let bestDist = Infinity;
  for (const c of closings) {
    if (c.date == null) continue;
    const dist = daysBetween(td, c.date);
    if (dist > windowDays) continue;
    const sideIsWinner = matchesModelName(sidePlayer, c.winner) && matchesModelName(otherPlayer, c.loser);
    const sideIsLoser = matchesModelName(sidePlayer, c.loser) && matchesModelName(otherPlayer, c.winner);
    if (!sideIsWinner && !sideIsLoser) continue;
    // fechamento do lado apostado: Betfair Exchange → média do mercado → Max
    const oddClose = sideIsWinner ? (c.bfew ?? c.avgw ?? c.maxw) : (c.bfel ?? c.avgl ?? c.maxl);
    if (!Number.isFinite(oddClose)) continue;
    if (dist < bestDist) { bestDist = dist; best = { oddClose }; }
  }
  return best;
}

/** Patches {id, oddClose, clv} dos trades que casaram (clv com a direção do trade). */
export function closingPatches(trades, closings) {
  const patches = [];
  for (const t of trades) {
    const m = matchClosing(t, closings);
    if (m) patches.push({ id: t.id, oddClose: m.oddClose, clv: clvPct(t.oddEntry, m.oddClose, t.dir || 'back') });
  }
  return patches;
}
