// Calibração por "temperatura" sobre o logit — corrige super/sub-confiança do modelo.
// p_calibrada = sigmoid(logit(p) / T). T>1 suaviza; T<1 acentua. T=1 é identidade.
import { logLoss } from './metrics.js';

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function logit(p) {
  const EPS = 1e-9;
  const q = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(q / (1 - q));
}

export function calibrate(p, T) {
  return sigmoid(logit(p) / T);
}

/** Encontra a temperatura T que minimiza o log-loss (busca em grade). */
export function fitTemperature(preds) {
  let best = 1;
  let bestLoss = Infinity;
  for (let T = 0.5; T <= 3.0001; T += 0.01) {
    const loss = logLoss(preds.map(({ p, outcome }) => ({ p: calibrate(p, T), outcome })));
    if (loss < bestLoss) {
      bestLoss = loss;
      best = T;
    }
  }
  return Math.round(best * 100) / 100;
}
