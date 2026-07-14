// Formatação para pt-BR.
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(n) {
  return brl.format(n ?? 0);
}

/** Valor com sinal explícito (+/−) para P/L. */
export function formatSignedBRL(n) {
  const v = n ?? 0;
  const s = brl.format(Math.abs(v));
  if (v > 0) return '+' + s;
  if (v < 0) return '−' + s;
  return s;
}

/** Fração (0.25) → "25,0%". */
export function formatPctFrac(frac, digits = 1) {
  return (frac * 100).toFixed(digits).replace('.', ',') + '%';
}

/** Número já em % (5) → "+5,0%". */
export function formatSignedPct(pct, digits = 1) {
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return sign + Math.abs(pct).toFixed(digits).replace('.', ',') + '%';
}
