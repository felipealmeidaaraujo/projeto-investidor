// Motor de leitura de confrontos: transforma os ratings do modelo numa análise
// honesta (probabilidade calibrada, favorito, forças por superfície, confiança).
// Funções puras sobre os objetos de jogador do model.json. Testado em tests/analysis.test.js.
import { expectedScore, blendSurface, calibrate } from './model-math.js';

/** Rating combinado (geral + superfície) de um jogador numa superfície. */
export function blendedRating(player, surface) {
  const surf = player[surface];
  return blendSurface(player.elo, surf ?? player.elo, 0.5);
}

/** Probabilidade calibrada de A vencer B na superfície. */
export function matchProbability(playerA, playerB, surface, T) {
  const raw = expectedScore(blendedRating(playerA, surface), blendedRating(playerB, surface));
  return calibrate(raw, T);
}

/** Rótulo da margem, a partir da probabilidade do favorito (≥0.5). */
export function marginLabel(favProb) {
  if (favProb < 0.55) return 'equilibrado';
  if (favProb < 0.65) return 'leve favorito';
  if (favProb < 0.78) return 'favorito claro';
  return 'favoritão';
}

/** Como o jogador se sai naquela superfície vs. o próprio nível geral. */
export function surfaceRead(player, surface) {
  const surfMatches = player.matchesBySurface?.[surface] ?? 0;
  const surfElo = player[surface] ?? player.elo;
  const delta = Math.round(surfElo - player.elo);
  if (surfMatches < 15) return { tag: 'poucos dados', delta, surfMatches };
  if (delta >= 40) return { tag: 'forte', delta, surfMatches };
  if (delta <= -40) return { tag: 'fraco', delta, surfMatches };
  return { tag: 'neutro', delta, surfMatches };
}

/** Nível de confiança da leitura, conforme volume de dados dos dois jogadores. */
export function confidenceLevel(playerA, playerB, surface) {
  const minMatches = Math.min(playerA.matches ?? 0, playerB.matches ?? 0);
  const minSurf = Math.min(
    playerA.matchesBySurface?.[surface] ?? 0,
    playerB.matchesBySurface?.[surface] ?? 0
  );
  if (minMatches < 30 || minSurf < 10) {
    return { level: 'baixa', reason: 'poucos jogos de histórico para um dos jogadores' };
  }
  if (minMatches < 80 || minSurf < 25) {
    return { level: 'média', reason: 'histórico moderado nesta superfície' };
  }
  return { level: 'alta', reason: 'amplo histórico para os dois jogadores' };
}

/** Leitura completa do confronto. */
export function analyzeMatch(playerA, playerB, surface, model) {
  const T = model.calibrationT ?? 1;
  const probA = matchProbability(playerA, playerB, surface, T);
  const probB = 1 - probA;
  const favA = probA >= 0.5;

  return {
    surface,
    a: {
      name: playerA.name,
      elo: playerA.elo,
      surfaceElo: playerA[surface] ?? null,
      blended: Math.round(blendedRating(playerA, surface)),
      surfaceRead: surfaceRead(playerA, surface),
    },
    b: {
      name: playerB.name,
      elo: playerB.elo,
      surfaceElo: playerB[surface] ?? null,
      blended: Math.round(blendedRating(playerB, surface)),
      surfaceRead: surfaceRead(playerB, surface),
    },
    probA,
    probB,
    favorite: favA ? playerA.name : playerB.name,
    underdog: favA ? playerB.name : playerA.name,
    favoriteProb: favA ? probA : probB,
    marginLabel: marginLabel(favA ? probA : probB),
    confidence: confidenceLevel(playerA, playerB, surface),
    fairOddA: 1 / probA,
    fairOddB: 1 / probB,
  };
}
