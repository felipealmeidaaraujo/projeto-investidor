// Construção de um trade a partir dos inputs do formulário. Funções puras.
import { clvPct } from './finance.js';

/** P/L com sinal a partir do resultado: green=+valor, red=−valor, zerei=0. */
export function resolvePL(result, amount) {
  const a = Math.abs(amount || 0);
  if (result === 'green') return a;
  if (result === 'red') return -a;
  return 0;
}

/**
 * Monta o objeto de trade pronto pra salvar.
 * @param {object} input - { market, surface, oddEntry, oddClose?, stake, result, plAmount, emotion }
 * @param {{id:string, date:string}} meta - id e data (injetados para facilitar teste)
 */
export function makeTrade(input, meta) {
  const pl = resolvePL(input.result, input.plAmount);
  const trade = {
    id: meta.id,
    date: meta.date,
    market: input.market,
    surface: input.surface,
    oddEntry: input.oddEntry,
    stake: input.stake,
    result: input.result,
    pl,
    emotion: input.emotion,
  };
  if (typeof input.oddClose === 'number') {
    trade.oddClose = input.oddClose;
    trade.clv = clvPct(input.oddEntry, input.oddClose);
  }
  return trade;
}
