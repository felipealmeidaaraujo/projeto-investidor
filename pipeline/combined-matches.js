// Fonte única das partidas combinadas (tennis-data tour + Challenger Sackmann) com nomes canônicos.
// Usado por train.js (Elo) e matches.js (scouting) — garante nomes IDÊNTICOS nos dois.
import { loadTennisData } from './ingest-tennisdata.js';
import { loadChallenger } from './ingest-sackmann.js';
import { buildChallengerNames } from '../web/src/match-names.js';

export const DEFAULT_FROM = 2013; // início da janela de treino/scouting — fonte única p/ nomes consistentes

/** Carrega tour + Challenger de um circuito no intervalo, canonicaliza os nomes do Challenger
 *  contra o universo do tour, e devolve as partidas ordenadas por data, cada uma com `src`
 *  ('tour' | 'chall'). */
export async function loadCombinedMatches(from, to, tour) {
  const [tourMatches, challRaw] = await Promise.all([
    loadTennisData(from, to, tour),
    loadChallenger(from, to, tour),
  ]);
  for (const m of tourMatches) m.src = 'tour';

  const tourNames = new Set();
  for (const m of tourMatches) { tourNames.add(m.winner); tourNames.add(m.loser); }
  const tourPlayers = [...tourNames].map((name) => ({ name }));

  const challFullNames = [...new Set(challRaw.flatMap((m) => [m.winnerFull, m.loserFull]))];
  const canonMap = buildChallengerNames(challFullNames, tourPlayers);
  const chall = challRaw.map((m) => ({
    dateInt: m.dateInt,
    surface: m.surface,
    winner: canonMap.get(m.winnerFull),
    loser: canonMap.get(m.loserFull),
    src: 'chall',
  }));

  return [...tourMatches, ...chall].sort((a, b) => a.dateInt - b.dateInt);
}
