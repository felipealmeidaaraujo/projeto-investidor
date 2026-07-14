// Núcleo do modelo Elo por superfície (estilo FiveThirtyEight / Tennis Abstract).
// A matemática pura compartilhada com o app vive em web/src/model-math.js.
export { expectedScore, blendSurface } from '../web/src/model-math.js';

/** Fator K decrescente com a experiência: 250/(m+5)^0.4. m = partidas já jogadas. */
export function kFactor(matchesPlayed) {
  return 250 / (matchesPlayed + 5) ** 0.4;
}

/** Novo rating = antigo + K*(resultado - esperado). resultado ∈ {0,1}. */
export function updateRating(rating, actual, expected, k) {
  return rating + k * (actual - expected);
}
