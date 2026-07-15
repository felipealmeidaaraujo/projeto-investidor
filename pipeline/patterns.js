// Estruturação e agregação dos jogos enriquecidos do Sackmann para o motor de padrões.
// Funções puras testadas em tests/patterns.test.js.
import { stylePatterns, pressurePatterns } from './game-patterns.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const intOf = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

/** Uma linha do CSV Sackmann (objeto do parseCsv) -> bio + stats de um lado.
 *  bioP = 'winner'/'loser' (metadados); statP = 'w'/'l' (estatísticas). */
function side(row, bioP, statP) {
  return {
    name: row[`${bioP}_name`] || null,
    id: row[`${bioP}_id`] || null,
    hand: row[`${bioP}_hand`] || null,
    ht: num(row[`${bioP}_ht`]),
    age: num(row[`${bioP}_age`]),
    ioc: row[`${bioP}_ioc`] || null,
    rank: intOf(row[`${bioP}_rank`]),
    seed: intOf(row[`${bioP}_seed`]),
    svGms: num(row[`${statP}_SvGms`]) || 0,
    bpSaved: num(row[`${statP}_bpSaved`]) || 0,
    bpFaced: num(row[`${statP}_bpFaced`]) || 0,
  };
}

/** Uma linha do CSV Sackmann -> jogo enriquecido com bio e stats dos dois lados. */
export function toEnrichedMatch(row) {
  return {
    dateInt: intOf(row.tourney_date),
    level: row.tourney_level || null,
    surface: (row.surface || '').toLowerCase() || null,
    score: row.score || '',
    minutes: num(row.minutes),
    bestOf: intOf(row.best_of) ?? 3,
    winner: side(row, 'winner', 'w'),
    loser: side(row, 'loser', 'l'),
  };
}

/** Monta o jogo na perspectiva de um lado ('winner'|'loser') para o motor de padrões. */
export function playerSideGame(match, sideKey) {
  const won = sideKey === 'winner';
  const me = won ? match.winner : match.loser;
  const opp = won ? match.loser : match.winner;
  return {
    won,
    score: match.score,
    minutes: match.minutes,
    bpFaced: me.bpFaced,
    bpSaved: me.bpSaved,
    svGms: me.svGms,
    oppBpFaced: opp.bpFaced,
    oppBpSaved: opp.bpSaved,
  };
}

/** Agrupa jogos enriquecidos por nome completo -> [{ game, bio, dateInt }]. Ignora sem placar. */
export function groupByPlayer(matches) {
  const byName = new Map();
  const add = (name, entry) => {
    if (!name) return;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(entry);
  };
  for (const m of matches) {
    if (!m.score) continue;
    add(m.winner.name, { game: playerSideGame(m, 'winner'), bio: m.winner, dateInt: m.dateInt });
    add(m.loser.name, { game: playerSideGame(m, 'loser'), bio: m.loser, dateInt: m.dateInt });
  }
  return byName;
}
