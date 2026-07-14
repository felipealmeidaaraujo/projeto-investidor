// Métricas de qualidade probabilística (honestidade do modelo). Funções puras.
// preds = array de { p, outcome } — p ∈ [0,1], outcome ∈ {0,1}.

/** Log-loss (pune excesso de confiança). Menor = melhor. */
export function logLoss(preds) {
  if (!preds.length) return 0;
  const EPS = 1e-15;
  let s = 0;
  for (const { p, outcome } of preds) {
    const q = Math.min(1 - EPS, Math.max(EPS, p));
    s += -(outcome * Math.log(q) + (1 - outcome) * Math.log(1 - q));
  }
  return s / preds.length;
}

/** Brier score (erro quadrático médio). Menor = melhor. */
export function brier(preds) {
  if (!preds.length) return 0;
  let s = 0;
  for (const { p, outcome } of preds) s += (p - outcome) ** 2;
  return s / preds.length;
}

/** Acurácia usando 0.5 como corte. */
export function accuracy(preds) {
  if (!preds.length) return 0;
  let correct = 0;
  for (const { p, outcome } of preds) if ((p >= 0.5 ? 1 : 0) === outcome) correct++;
  return correct / preds.length;
}

/** Curva de calibração: agrupa em nbins faixas e retorna prob prevista vs observada. */
export function calibrationBins(preds, nbins = 10) {
  const bins = Array.from({ length: nbins }, () => ({ sumP: 0, sumO: 0, n: 0 }));
  for (const { p, outcome } of preds) {
    const idx = Math.min(nbins - 1, Math.max(0, Math.floor(p * nbins)));
    bins[idx].sumP += p;
    bins[idx].sumO += outcome;
    bins[idx].n += 1;
  }
  return bins.map((b, i) => ({
    bin: i,
    avgPred: b.n ? b.sumP / b.n : null,
    avgOutcome: b.n ? b.sumO / b.n : null,
    count: b.n,
  }));
}
