// Parser do placar formato Sackmann (ex.: "6-4 3-6 7-5", "7-6(5) 6-4").
// Retorna sets por lado (perspectiva do vencedor). Exclui abandonos/W.O.
// Puro. Testado em tests/score.test.js.

/** @returns {{valid:boolean, sets:number[][], winnerSets:number, loserSets:number}} */
export function parseScore(scoreStr) {
  const bad = { valid: false, sets: [], winnerSets: 0, loserSets: 0 };
  const s = (scoreStr || '').trim();
  if (!s || /\b(RET|W\/O|DEF|ABN|ABD|UNK|Walkover|Default)\b/i.test(s)) return bad;
  const sets = [];
  for (const tk of s.split(/\s+/)) {
    const m = tk.match(/^(\d+)-(\d+)(?:\([^)]*\))?$/);
    if (!m) return bad;
    sets.push([Number(m[1]), Number(m[2])]);
  }
  if (!sets.length) return bad;
  let winnerSets = 0, loserSets = 0;
  for (const [a, b] of sets) { if (a > b) winnerSets++; else if (b > a) loserSets++; }
  return { valid: true, sets, winnerSets, loserSets };
}
