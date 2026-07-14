// Lógica financeira do Projeto Investidor.
// Funções puras (sem estado) — testadas em tests/finance.test.js.
// Convenção: odds sempre em formato DECIMAL (europeu). p = probabilidade (0..1).

/** Valor esperado por unidade de stake (back). EV = p*odds - 1. */
export function evFraction(p, odds) {
  return p * odds - 1;
}

/** Odd mínima para o EV atingir um limiar de valor. (1 + limiar) / p. */
export function minValueOdd(p, threshold = 0) {
  return (1 + threshold) / p;
}

/** Fração ótima de Kelly = (p*odds - 1) / (odds - 1). Nunca negativa (0 = não apostar). */
export function kellyFraction(p, odds) {
  const edge = p * odds - 1;
  if (edge <= 0 || odds <= 1) return 0;
  return edge / (odds - 1);
}

/**
 * Stake sugerido pela banca via Kelly fracionário, com teto opcional e piso 0.
 * @param {{bankroll:number, p:number, odds:number, fraction?:number, capFraction?:number|null}} o
 */
export function stakeKelly({ bankroll, p, odds, fraction = 0.25, capFraction = null }) {
  const raw = bankroll * kellyFraction(p, odds) * fraction;
  const capped = capFraction != null ? Math.min(raw, bankroll * capFraction) : raw;
  return Math.max(0, capped);
}

/** Probabilidade implícita bruta (com margem) de uma odd. */
export function impliedProb(odds) {
  return 1 / odds;
}

/** Remove a margem (overround) de um mercado de 2 vias → [pA, pB] que somam 1. */
export function deMarginTwoWay(oddsA, oddsB) {
  const a = 1 / oddsA;
  const b = 1 / oddsB;
  const s = a + b;
  return [a / s, b / s];
}

/** Valor (%) da odd pega vs. uma referência (fechamento OU odd justa ao vivo). Back e lay. */
export function clvPct(oddsTaken, oddsRef, side = 'back') {
  return side === 'lay' ? (oddsRef / oddsTaken - 1) * 100 : (oddsTaken / oddsRef - 1) * 100;
}

/** A odd pega superou a referência? (back: maior é melhor; lay: menor é melhor) */
export function beatClose(oddsTaken, oddsRef, side = 'back') {
  return side === 'lay' ? oddsTaken < oddsRef : oddsTaken > oddsRef;
}
