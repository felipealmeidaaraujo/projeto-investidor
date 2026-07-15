// Funções puras que leem o placar (score do Sackmann) e derivam padrões de jogo.
// O score é sempre da perspectiva do VENCEDOR da partida. Testado em tests/game-patterns.test.js.

/** "6-4 3-6 7-6(5)" -> { sets:[{w,l,tb}], walkover, incomplete }.
 *  w/l = games do vencedor/perdedor da partida naquele set; tb = placar do tie-break (ou null). */
export function parseScore(score) {
  const raw = (score || '').trim();
  if (!raw) return { sets: [], walkover: false, incomplete: false };
  if (/^w\/o$/i.test(raw) || /walkover/i.test(raw)) return { sets: [], walkover: true, incomplete: true };
  const incomplete = /\b(ret|def|abn|abd)\b/i.test(raw);
  const sets = [];
  for (const tok of raw.split(/\s+/)) {
    const m = tok.match(/^(\d+)-(\d+)(?:\((\d+)\))?$/);
    if (!m) continue;
    sets.push({ w: Number(m[1]), l: Number(m[2]), tb: m[3] != null ? Number(m[3]) : null });
  }
  return { sets, walkover: false, incomplete };
}

/** O jogador ganhou o 1º set? `playerWon` diz se ele é o vencedor da partida (perspectiva do score). */
export function firstSetWonByPlayer(parsed, playerWon) {
  const s = parsed.sets[0];
  if (!s) return false;
  const winnerTookSet = s.w > s.l;
  return playerWon ? winnerTookSet : !winnerTookSet;
}

/** Virada: o jogador venceu a PARTIDA tendo perdido o 1º set. Só o vencedor pode virar. */
export function isComeback(parsed, playerWon) {
  return playerWon === true && parsed.sets.length > 0 && !firstSetWonByPlayer(parsed, true);
}

const rate = (num, den) => ({ pct: den ? Math.round((num / den) * 100) : null, n: den });

/** Um tie-break do ponto de vista do jogador: ele o venceu?
 *  No set com tb != null, o vencedor da partida ganhou o TB sse w > l naquele set. */
function tieBreaksFor(parsed, playerWon) {
  let won = 0, total = 0;
  for (const s of parsed.sets) {
    if (s.tb == null) continue;
    total++;
    const winnerTookTb = s.w > s.l;
    if (playerWon ? winnerTookTb : !winnerTookTb) won++;
  }
  return { won, total };
}

/** Agrega os padrões de estilo de um jogador a partir dos jogos dele.
 *  games: [{ won:boolean, score:string, minutes:number|null }]. */
export function stylePatterns(games) {
  let firstWon = 0, firstN = 0;
  let comebackWon = 0, comebackN = 0;
  let deciderWon = 0, deciderN = 0;
  let tbWon = 0, tbN = 0;
  let minSum = 0, minN = 0;
  for (const g of games) {
    const p = parseScore(g.score);
    if (!p.sets.length) continue;
    const gotFirst = firstSetWonByPlayer(p, g.won);
    firstN++; if (gotFirst) firstWon++;
    if (!gotFirst) { comebackN++; if (g.won) comebackWon++; }
    if (p.sets.length >= 3) { deciderN++; if (g.won) deciderWon++; }
    const tb = tieBreaksFor(p, g.won);
    tbN += tb.total; tbWon += tb.won;
    if (Number.isFinite(g.minutes)) { minSum += g.minutes; minN++; }
  }
  return {
    firstSet: rate(firstWon, firstN),
    comeback: rate(comebackWon, comebackN),
    decider: rate(deciderWon, deciderN),
    tieBreak: rate(tbWon, tbN),
    avgMinutes: minN ? Math.round(minSum / minN) : null,
  };
}
