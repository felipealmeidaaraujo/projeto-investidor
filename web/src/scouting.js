// Deriva forma recente, dias de descanso e H2H a partir do histórico de partidas (matches.json).
// Funções puras. Nomes no formato do modelo ("Sobrenome I.").

function ymdToDate(n) {
  return new Date(Date.UTC(Math.floor(n / 10000), Math.floor((n % 10000) / 100) - 1, n % 100));
}
function daysBetween(a, b) {
  return Math.round(Math.abs((ymdToDate(a) - ymdToDate(b)) / 86400000));
}

/** Últimas n partidas do jogador (mais recente primeiro): vitórias, derrotas e a lista. */
export function recentForm(matches, name, n = 10) {
  const mine = matches
    .filter((m) => m.winner === name || m.loser === name)
    .slice()
    .sort((a, b) => b.date - a.date)
    .slice(0, n)
    .map((m) => ({ date: m.date, won: m.winner === name, surface: m.surface, opp: m.winner === name ? m.loser : m.winner }));
  return {
    wins: mine.filter((r) => r.won).length,
    losses: mine.filter((r) => !r.won).length,
    results: mine,
  };
}

/** Dias entre a última partida do jogador e asOfYmd, ou null se não há partida. */
export function restDays(matches, name, asOfYmd) {
  let last = null;
  for (const m of matches) {
    if (m.winner === name || m.loser === name) last = last == null ? m.date : Math.max(last, m.date);
  }
  if (last == null) return null;
  // sem Math.abs: se a última partida for hoje/futura (fuso/glitch), 0 em vez de negativo.
  return Math.max(0, Math.round((ymdToDate(asOfYmd) - ymdToDate(last)) / 86400000));
}

/** Confrontos diretos entre A e B: total, vitórias de cada, por superfície e o último. */
export function headToHead(matches, aName, bName) {
  const games = matches.filter(
    (m) => (m.winner === aName && m.loser === bName) || (m.winner === bName && m.loser === aName)
  );
  const bySurface = {};
  let aWins = 0, bWins = 0, last = null;
  for (const m of games) {
    const aWon = m.winner === aName;
    if (aWon) aWins++; else bWins++;
    const s = (bySurface[m.surface] ??= { a: 0, b: 0 });
    if (aWon) s.a++; else s.b++;
    if (last == null || m.date > last.date) last = { date: m.date, winner: m.winner, loser: m.loser, surface: m.surface };
  }
  return { total: games.length, aWins, bWins, bySurface, last };
}
