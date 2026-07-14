// Agregação de estatísticas dos trades. Funções puras.
// Testado em tests/stats.test.js.
import { clvPct } from './finance.js';

/** Resumo geral: contagem, P/L, ROI, win rate e CLV médio. */
export function summarize(trades) {
  let totalPL = 0;
  let totalStaked = 0;
  let greens = 0;
  let reds = 0;
  let clvSum = 0;
  let clvCount = 0;

  for (const t of trades) {
    totalPL += t.pl ?? 0;
    totalStaked += t.stake ?? 0;
    if (t.result === 'green') greens++;
    else if (t.result === 'red') reds++;
    if (typeof t.oddEntry === 'number' && typeof t.oddClose === 'number') {
      clvSum += clvPct(t.oddEntry, t.oddClose);
      clvCount++;
    }
  }

  const resolved = greens + reds;
  return {
    count: trades.length,
    totalPL,
    totalStaked,
    roi: totalStaked > 0 ? totalPL / totalStaked : 0,
    greens,
    reds,
    winRate: resolved > 0 ? greens / resolved : 0,
    avgClvPct: clvCount > 0 ? clvSum / clvCount : 0,
  };
}

/** Soma o P/L dos trades de um dia (YYYY-MM-DD) — base do stop-loss diário. */
export function plOnDate(trades, dateStr) {
  return trades
    .filter((t) => typeof t.date === 'string' && t.date.slice(0, 10) === dateStr)
    .reduce((acc, t) => acc + (t.pl ?? 0), 0);
}

/** Status do stop-loss diário: limite, perda do dia, fração usada e se foi atingido. */
export function stopLossStatus(config, trades, dayStr) {
  const limit = (config?.initial ?? 0) * (config?.dailyStopLossPct ?? 0);
  const plToday = plOnDate(trades, dayStr);
  const lossToday = plToday < 0 ? Math.abs(plToday) : 0;
  const used = limit > 0 ? Math.min(lossToday / limit, 1) : 0;
  return { limit, plToday, lossToday, used, hit: limit > 0 && lossToday >= limit };
}

/** Alerta anti-tilt: o último trade do dia foi um RED e o novo stake é maior (caçar prejuízo). */
export function tiltWarning(trades, dayStr, newStake) {
  const today = trades.filter((t) => typeof t.date === 'string' && t.date.slice(0, 10) === dayStr);
  const last = today[today.length - 1];
  if (!last) return false;
  return last.result === 'red' && newStake > (last.stake ?? 0);
}

/** Agrupa os trades por uma chave (mercado, superfície...) com P/L, ROI e win rate. */
export function segmentBy(trades, key) {
  const groups = {};
  for (const t of trades) {
    const k = t[key] ?? '—';
    const g = (groups[k] ??= { count: 0, pl: 0, staked: 0, greens: 0, reds: 0, roi: 0, winRate: 0 });
    g.count++;
    g.pl += t.pl ?? 0;
    g.staked += t.stake ?? 0;
    if (t.result === 'green') g.greens++;
    else if (t.result === 'red') g.reds++;
  }
  for (const g of Object.values(groups)) {
    g.roi = g.staked > 0 ? g.pl / g.staked : 0;
    const resolved = g.greens + g.reds;
    g.winRate = resolved > 0 ? g.greens / resolved : 0;
  }
  return groups;
}
