// Parser do feed proprietário do Flashscore (grade de tênis do dia) + fetch.
// Cobre ATP + WTA + Challenger e traz a superfície. Puro testado em tests/flashscore.test.js.

const SURFACE = { clay: 'clay', hard: 'hard', grass: 'grass', carpet: 'hard' };

/** "CHALLENGER MEN - SINGLES: Bunschoten (Netherlands), clay"
 *  -> { tour, singles, surface, tournament }. */
export function parseTournamentHeader(za) {
  const colon = za.indexOf(':');
  const cat = colon >= 0 ? za.slice(0, colon) : za;
  const rest = colon >= 0 ? za.slice(colon + 1).trim() : '';
  const singles = /singles/i.test(cat);
  const tour = /women|wta|girls|ladies/i.test(cat) ? 'WTA' : 'ATP';
  let surface = 'hard';
  let tournament = rest;
  const comma = rest.lastIndexOf(',');
  if (comma >= 0) {
    const word = rest.slice(comma + 1).trim().toLowerCase();
    if (SURFACE[word]) {
      surface = SURFACE[word];
      tournament = rest.slice(0, comma).trim();
    }
  }
  return { tour, singles, surface, tournament };
}

/** Código de status do Flashscore -> rótulo. */
export function statusFromCode(ab) {
  if (ab === '1') return 'SCHEDULED';
  if (ab === '2') return 'IN_PROGRESS';
  if (ab === '3') return 'FINISHED';
  return 'OTHER';
}
