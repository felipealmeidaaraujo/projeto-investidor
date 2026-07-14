// Núcleo do modelo Elo por superfície (estilo FiveThirtyEight / Tennis Abstract).
// Funções puras — testadas em tests/elo.test.js.

/** Probabilidade de A vencer B pela diferença de Elo (logística base 10, escala 400). */
export function expectedScore(eloA, eloB) {
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

/** Fator K decrescente com a experiência: 250/(m+5)^0.4. m = partidas já jogadas. */
export function kFactor(matchesPlayed) {
  return 250 / (matchesPlayed + 5) ** 0.4;
}

/** Novo rating = antigo + K*(resultado - esperado). resultado ∈ {0,1}. */
export function updateRating(rating, actual, expected, k) {
  return rating + k * (actual - expected);
}

/** Combina Elo geral e Elo de superfície. surfaceWeight=0.5 → média (default). */
export function blendSurface(overallElo, surfaceElo, surfaceWeight = 0.5) {
  return surfaceWeight * surfaceElo + (1 - surfaceWeight) * overallElo;
}
