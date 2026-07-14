// Matemática pura do modelo, compartilhada entre o pipeline (Node) e o app (navegador).
// Fonte única da verdade — importada por pipeline/elo.js, pipeline/calibrate.js e web/src/analysis.js.

/** Probabilidade de A vencer B pela diferença de Elo (logística base 10, escala 400). */
export function expectedScore(eloA, eloB) {
  return 1 / (1 + 10 ** ((eloB - eloA) / 400));
}

/** Combina Elo geral e Elo de superfície. surfaceWeight=0.5 → média (default). */
export function blendSurface(overallElo, surfaceElo, surfaceWeight = 0.5) {
  return surfaceWeight * surfaceElo + (1 - surfaceWeight) * overallElo;
}

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function logit(p) {
  const EPS = 1e-9;
  const q = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(q / (1 - q));
}

/** Calibração por temperatura: p_calibrada = sigmoid(logit(p)/T). */
export function calibrate(p, T) {
  return sigmoid(logit(p) / T);
}
