// Correção do viés de idade do Elo: o modelo subestima o jogador mais novo.
// Função pura. Aplicada DEPOIS do calibrationT, na probabilidade já servida.
//
// O QUE FOI MEDIDO (walk-forward, 99.846 partidas 2018-2026, com o Elo já corrigido
// da ordenação cronológica — commit 317b3a0):
//   par jovem(≤23) × veterano(≥30), tour ATP: o modelo dá 49,4%, a realidade é 57,5%
//   → +8,16pp de erro (N=1.976, IC ±2,18). Com 12+ anos de gap: +10,47pp.
//   Placebo interno nulo (gap 0-2 anos: +0,52pp) e placebo externo nulo (permutando
//   as datas de nascimento 20x: z mediano −0,02). Não é ruído.
//
// TRÊS HIPÓTESES FALSIFICADAS antes de chegar aqui:
//   - K-factor: previa viés pior onde o K é MENOR; o dado diz 2,5x MAIOR onde o K é alto.
//   - Volume de carreira: nulo nos dois tours, e com sinais opostos entre eles.
//   - "Superconfiança": o calibrationT já é essa correção (o fit só-escala dá b=0,977).
//
// ATENÇÃO: estes coeficientes são o ERRO DESTE MODELO, não constantes da natureza.
// Se o K, o prior de entrada (1500) ou a fórmula do Elo mudarem, a medida precisa
// ser REFEITA. Ver docs/superpowers/specs/2026-07-17-vies-idade-elo-design.md.
// O teste tests/engine-fingerprint.test.js FALHA automaticamente se o motor mudar sem esta
// medição ser refeita — não depende mais de boa-fé.

/** Ganho de logit por ano de diferença de idade, a favor do mais novo.
 *  ATP 0,026: escolhido pelo melhor Brier FORA DA AMOSTRA (treino ≤2023, teste 2024-26,
 *  só tour, N=6.618): ganho +0,00149, IC95 [0,00077; 0,00223].
 *  WTA 0: o viés existe lá (+5,32pp) mas a correção NÃO paga fora da amostra
 *  (ganho −0,00025, IC95 [−0,00165; 0,00122] — cruza zero) e supercorrige os extremos.
 *  Viés existir e correção compensar são perguntas diferentes.
 *  Validado SÓ no nível TOUR (ATP principal). O gate por nível vive em analyzeMatch
 *  (web/src/analysis.js): em Challenger o ajuste é SUPRIMIDO, e a supressão é explicada
 *  na tela (ageSuppressedText). Ver docs/superpowers/specs/2026-07-17-nivel-torneio-grade-design.md. */
const AGE_COEF = { ATP: 0.026, WTA: 0 };

/** Fingerprint do motor Elo contra o qual o AGE_COEF acima foi medido. O guarda-corpo em
 *  tests/engine-fingerprint.test.js falha se o motor mudar sem esta constante ser atualizada
 *  (o que só deve acontecer DEPOIS de refazer a medição da spec 2026-07-17-vies-idade-elo). */
export const ENGINE_FP_MEDIDO = '3dd5d0b4';

/** Diferença de idade mínima para valer o ajuste (evita mexer por causa de arredondamento). */
const MIN_GAP_YEARS = 0.5;

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
// A probabilidade servida nunca é 0 nem 1: o logit estouraria, e "100% de chance" é
// uma afirmação que o modelo não pode fazer.
const clamp = (p) => Math.min(0.9999, Math.max(0.0001, p));

/** Corrige a probabilidade de A vencer pelo viés de idade.
 *  NÃO tem intercepto, de propósito: com um, p(A vs B) + p(B vs A) daria 1,0588 —
 *  os dois jogadores somariam 105,9% de chance de vencer. O intercepto também absorve
 *  o próprio efeito de idade (a₀ ≈ gap médio × coef), e foi esse artefato que fez uma
 *  medição anterior concluir que a correção "piorava" a WTA.
 *  A escala (b) fica em 1,0: o fit só-escala deu 0,977 — a tela já está calibrada.
 *  @returns {{prob, base, delta, gap, adjusted}|null} */
export function ageAdjusted(prob, ageA, ageB, tour) {
  if (prob == null || !Number.isFinite(prob)) return null;
  const semAjuste = { prob, base: prob, delta: 0, gap: null, adjusted: false };

  const coef = AGE_COEF[tour];
  if (!coef) return semAjuste; // WTA (0) ou tour desconhecido (undefined)
  if (!Number.isFinite(ageA) || !Number.isFinite(ageB)) return semAjuste;

  const gap = ageB - ageA; // positivo = A é mais novo
  if (Math.abs(gap) < MIN_GAP_YEARS) return { ...semAjuste, gap };

  const ajustada = sigmoid(logit(clamp(prob)) + coef * gap);
  return { prob: ajustada, base: prob, delta: ajustada - prob, gap, adjusted: true };
}

/** 0.5837 -> "58,4%" (uma casa, vírgula decimal do pt-BR). */
const pct = (p) => `${(p * 100).toFixed(1).replace('.', ',')}%`;

/** A linha que explica o ajuste no card. null quando não houve ajuste.
 *  A regra de clareza do projeto não deixa a probabilidade mudar em silêncio:
 *  o número mexeu, então o card diz quanto, por quê, e qual era antes. */
export function ageAdjustText(ageAdjust, nomeMaisNovo) {
  if (!ageAdjust || !ageAdjust.adjusted) return null;
  const anos = Math.abs(Math.round(ageAdjust.gap));
  // A prob "sem o ajuste" tem que ser a do MAIS NOVO (o jogador nomeado na frase).
  // `base` e a prob de A; quando o mais novo e o B (gap < 0), usa 1 - base.
  const baseMaisNovo = ageAdjust.gap > 0 ? ageAdjust.base : 1 - ageAdjust.base;
  return `Ajustado por idade: ${anos} anos de diferença — medimos que o modelo subestima o mais novo em confrontos assim, e o ${nomeMaisNovo} leva a correção. Sem o ajuste: ${pct(baseMaisNovo)}.`;
}

/** A linha que explica por que o ajuste de idade NÃO foi aplicado (nível Challenger).
 *  Simétrica a ageAdjustText: só existe quando o ajuste TERIA ocorrido (ATP + gap).
 *  null quando não houve supressão. */
export function ageSuppressedText(ageSuppressed, nomeMaisNovo) {
  if (!ageSuppressed) return null;
  const anos = Math.abs(Math.round(ageSuppressed.gap));
  const pp = `${(Math.abs(ageSuppressed.wouldDelta) * 100).toFixed(1).replace('.', ',')} pp`;
  return `Ajuste de idade não aplicado: ${anos} anos de diferença — no tour o modelo corrigiria a favor do ${nomeMaisNovo} em ~${pp}, mas este é um Challenger, nível onde a correção nunca foi validada (o Elo de Challenger é menos calibrado). A probabilidade acima está sem esse ajuste.`;
}
