// Calibração por "temperatura" sobre o logit — corrige super/sub-confiança do modelo.
// sigmoid/logit/calibrate vêm do módulo compartilhado; aqui fica só o ajuste (fit).
import { calibrate } from '../web/src/model-math.js';
import { logLoss } from './metrics.js';

export { sigmoid, logit, calibrate } from '../web/src/model-math.js';

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
