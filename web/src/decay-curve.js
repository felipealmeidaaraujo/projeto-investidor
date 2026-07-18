// Correção do viés de INATIVIDADE do Elo: o modelo superestima quem volta de pausa longa
// (o Elo fica congelado no nível de antes da ausência). Função pura. Aplicada DEPOIS do
// calibrationT, na probabilidade servida. Espelho de age-curve.js — a idade roda só no tour,
// o decay só no Challenger; nunca no mesmo jogo.
//
// O QUE FOI MEDIDO (walk-forward 2013-2026, ATP combined; teste out-of-sample 2024-26):
//   viés monótono na inatividade (180+ dias: −6pp; 365+: −9pp), placebo nulo. O ganho da
//   correção PAGA só no CHALLENGER (+0,00060, IC95 [0,00041; 0,00078]); no tour ATP (N=297)
//   e na WTA o IC cruza zero. Ver docs/superpowers/specs/2026-07-18-decay-inatividade-design.md.
//
// ATENÇÃO: o coeficiente é o ERRO DESTE Elo, não uma constante da natureza. Se o K, o prior
// 1500 ou a fórmula mudarem, a medição precisa ser REFEITA.
// O teste tests/engine-fingerprint.test.js FALHA automaticamente se o motor mudar sem esta
// medição ser refeita — não depende mais de boa-fé.

/** Ganho de logit por unidade de "ferrugem", contra quem volta. Só ATP; WTA não paga fora
 *  da amostra (IC cruza zero). Aplicado SÓ em Challenger — o gate vive em analyzeMatch. */
const DECAY_COEF = { ATP: 0.50, WTA: 0 };

/** Fingerprint do motor Elo contra o qual o DECAY_COEF acima foi medido. O guarda-corpo em
 *  tests/engine-fingerprint.test.js falha se o motor mudar sem esta constante ser atualizada
 *  (o que só deve acontecer DEPOIS de refazer a medição da spec 2026-07-18-decay-inatividade). */
export const ENGINE_FP_MEDIDO = '3dd5d0b4';

const RAMP_START = 90;   // dias sem jogar antes de a ferrugem começar (o viés é nulo em 0-90)
const RAMP_SPAN = 365;   // dias para a ferrugem ir de 0 a 1

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clamp = (p) => Math.min(0.9999, Math.max(0.0001, p));
const pct = (p) => `${(p * 100).toFixed(1).replace('.', ',')}%`;
const toDays = (i) => Date.UTC(Math.floor(i / 10000), (Math.floor(i / 100) % 100) - 1, i % 100) / 86400000;

/** "Ferrugem" acumulada: 0 até 90 dias, sobe linearmente até 1 em ~1,25 ano. */
const ferrugem = (inat) => (inat == null || !Number.isFinite(inat)) ? 0 : Math.min(1, Math.max(0, (inat - RAMP_START) / RAMP_SPAN));

/** Dias entre duas datas AAAAMMDD (referência − último jogo). null se faltar alguma. */
export function inatividadeDias(refDateInt, lastDateInt) {
  if (!refDateInt || !lastDateInt) return null;
  return toDays(refDateInt) - toDays(lastDateInt);
}

/** Corrige a probabilidade de A vencer pelo viés de inatividade. Antissimétrico, sem
 *  intercepto (como age-curve). Só mexe quando há DIFERENÇA de ferrugem entre os dois.
 *  @returns {{prob, base, delta, inatA, inatB, adjusted}|null} */
export function decayAdjusted(prob, inatA, inatB, tour) {
  if (prob == null || !Number.isFinite(prob)) return null;
  const semAjuste = { prob, base: prob, delta: 0, inatA: inatA ?? null, inatB: inatB ?? null, adjusted: false };
  const coef = DECAY_COEF[tour];
  if (!coef) return semAjuste; // WTA (0) ou tour desconhecido
  const termo = ferrugem(inatB) - ferrugem(inatA); // positivo = B mais enferrujado → A ganha
  if (termo === 0) return semAjuste;
  const ajustada = sigmoid(logit(clamp(prob)) + coef * termo);
  return { prob: ajustada, base: prob, delta: ajustada - prob, inatA: inatA ?? null, inatB: inatB ?? null, adjusted: true };
}

/** A linha que explica o ajuste no card. Nomeia quem volta (o mais parado). null sem ajuste. */
export function decayAdjustText(decayAdjust, nomeMaisParado) {
  if (!decayAdjust || !decayAdjust.adjusted) return null;
  const { inatA, inatB, base } = decayAdjust;
  const maisParadoEhA = (inatA ?? 0) >= (inatB ?? 0);
  const meses = Math.round((maisParadoEhA ? inatA : inatB) / 30);
  const baseMaisParado = maisParadoEhA ? base : 1 - base; // a prob sem o ajuste do jogador nomeado
  return `Ajustado por inatividade: ${nomeMaisParado} volta de ${meses} meses sem jogar — o modelo superestima quem volta de pausa longa em Challenger. Sem o ajuste: ${pct(baseMaisParado)}.`;
}
