// Estruturação e agregação dos jogos enriquecidos do Sackmann para o motor de padrões.
// Funções puras testadas em tests/patterns.test.js.
import { stylePatterns, pressurePatterns } from './game-patterns.js';
import { matchPlayer, normName } from '../web/src/match-names.js';

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

/** Perfil agregado de um jogador a partir das entries de groupByPlayer. */
export function buildProfile(entries) {
  const sorted = [...entries].sort((a, b) => a.dateInt - b.dateInt);
  const recent = sorted[sorted.length - 1];
  const games = entries.map((e) => e.game);
  return {
    games: entries.length,
    style: stylePatterns(games),
    pressure: pressurePatterns(games),
    bio: recent ? recent.bio : null,
  };
}

/** Para cada slot do modelo, decide quais nomes do Sackmann (chaves de `byName`) são da
 *  MESMA pessoa que o slot, resolvendo homônimos pelo player_id e pelo `p.fullName`.
 *
 *  Por que isto existe: `matchPlayer` casa por sobrenome + inicial, então "Yafan Wang",
 *  "Yuhan Wang" e "Yuping Wang" caem todas no slot "Wang Y.". Concatenar as três (o que o
 *  patterns-ingest fazia) colava o bio/estilo de uma pessoa arbitrária. Aqui:
 *   - 1 candidato → usa ele (não revalida contra fullName: formatos diferem entre fontes).
 *   - ≥2 candidatos, com p.fullName (resolvido pelo serve-stats, que roda antes) → o
 *     candidato cujo nome normaliza igual ao fullName.
 *   - ≥2 candidatos, sem fullName → merge se todos têm o MESMO bio.id (variantes de
 *     grafia da mesma pessoa); ids distintos (homônimos reais) → slot sem dono (sem bio).
 *  @param {Map<string, Array<{bio:{id:string}}>>} byName  nome Sackmann → entries
 *  @param {Array<{name:string, fullName?:string}>} players  jogadores do modelo
 *  @returns {Map<string, string[]>} p.name → [nomes Sackmann a usar]; slots sem dono ficam fora. */
export function resolveSlotOwners(byName, players) {
  const cand = new Map(); // p.name → [nome Sackmann]
  for (const full of byName.keys()) {
    const p = matchPlayer(full, players);
    if (!p) continue;
    if (!cand.has(p.name)) cand.set(p.name, []);
    cand.get(p.name).push(full);
  }
  const byModelName = new Map(players.map((p) => [p.name, p]));
  const owners = new Map();
  for (const [name, cs] of cand) {
    if (cs.length === 1) { owners.set(name, cs); continue; }
    const p = byModelName.get(name);
    if (p && p.fullName) {
      const dono = cs.find((f) => normName(f) === normName(p.fullName));
      if (dono) owners.set(name, [dono]);
    } else {
      const ids = new Set(cs.map((f) => byName.get(f)?.[0]?.bio?.id).filter((x) => x != null));
      if (ids.size === 1) owners.set(name, cs);
    }
  }
  return owners;
}
