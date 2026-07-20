// Correção empírica da odd justa AO VIVO nas fronteiras de set.
//
// POR QUÊ: o motor de Markov ([inplay.js]) assume que todo ponto é igual e independente.
// Não é. Ganhar ou perder um set carrega informação sobre quem está melhor NAQUELE DIA —
// e o modelo ignora isso, comprimindo o impacto do set. Medimos o tamanho exato do erro.
//
// MEDIÇÃO: `pipeline/live-calibration.js`, 19/07/2026, tennis-data 2013–2026,
// 27.128 partidas ATP e 31.741 WTA (só melhor-de-3). Favorito definido pela odd de
// FECHAMENTO (visão do mercado, sem vazamento); estado e desfecho pelo placar set a set.
//
// O QUE ELA MOSTRA: o modelo SUBESTIMA quem ganhou o 1º set (+1 a +3pp) e SUPERESTIMA
// quem o perdeu (−4 a −7,5pp). O viés é simétrico, o que reforça que é real.
//
// Células com amostra < 300 foram descartadas na origem (aparecem como null) — sem
// correção é melhor que correção de ruído. Funções puras. Testado em tests/live-correction.test.js.

/** Faixas de favoritismo pré-jogo (limite inferior de cada faixa). */
export const BAND_LOWS = [0.5, 0.6, 0.7, 0.8, 0.9];
export const BAND_LABELS = ['50–60%', '60–70%', '70–80%', '80–90%', '90%+'];

// Por circuito → estado de sets (ótica do favorito) → faixa. {real, model, n} ou null.
export const CORRECTION_TABLE = {
  ATP: {
    '1-0': [
      { real: 0.8021, model: 0.7848, n: 4578 },
      { real: 0.8631, model: 0.8405, n: 5121 },
      { real: 0.9127, model: 0.8920, n: 4133 },
      { real: 0.9454, model: 0.9375, n: 2511 },
      { real: 0.9769, model: 0.9737, n: 780 },
    ],
    '0-1': [
      { real: 0.2373, model: 0.2861, n: 3995 },
      { real: 0.3124, model: 0.3591, n: 3246 },
      { real: 0.4013, model: 0.4486, n: 1899 },
      { real: 0.5214, model: 0.5596, n: 748 },
      null,
    ],
    '1-1': [
      { real: 0.5208, model: 0.5352, n: 3433 },
      { real: 0.5917, model: 0.6000, n: 3174 },
      { real: 0.6698, model: 0.6702, n: 2147 },
      { real: 0.7303, model: 0.7475, n: 953 },
      null,
    ],
  },
  WTA: {
    '1-0': [
      { real: 0.8169, model: 0.7841, n: 5140 },
      { real: 0.8684, model: 0.8403, n: 5897 },
      { real: 0.9089, model: 0.8921, n: 5106 },
      { real: 0.9501, model: 0.9378, n: 3288 },
      { real: 0.9837, model: 0.9729, n: 1043 },
    ],
    '0-1': [
      { real: 0.2268, model: 0.2851, n: 4639 },
      { real: 0.2971, model: 0.3591, n: 3638 },
      { real: 0.3752, model: 0.4503, n: 2068 },
      { real: 0.4906, model: 0.5595, n: 799 },
      null,
    ],
    '1-1': [
      { real: 0.5143, model: 0.5346, n: 3743 },
      { real: 0.5882, model: 0.5994, n: 3434 },
      { real: 0.6447, model: 0.6710, n: 2347 },
      { real: 0.7380, model: 0.7491, n: 1038 },
      null,
    ],
  },
};

const EPS = 1e-6;
const clamp01 = (p) => Math.min(1 - EPS, Math.max(EPS, p));
const logit = (p) => Math.log(clamp01(p) / (1 - clamp01(p)));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** Índice da faixa de favoritismo. Espera prob do FAVORITO (≥ 0,5). */
export function bandIndex(favPreProb) {
  if (!Number.isFinite(favPreProb) || favPreProb < 0.5 || favPreProb > 1) return -1;
  let i = 0;
  for (let k = 0; k < BAND_LOWS.length; k++) if (favPreProb >= BAND_LOWS[k]) i = k;
  return i;
}

/** Estado de sets na ótica do favorito → chave medida, ou null se não medimos esse estado. */
export function stateKey(favSets, dogSets) {
  const k = `${favSets}-${dogSets}`;
  return k === '1-0' || k === '0-1' || k === '1-1' ? k : null;
}

/**
 * Corrige a probabilidade do FAVORITO pré-jogo com o viés medido no estado atual.
 * A correção é um deslocamento em log-odds (mantém o resultado entre 0 e 1 e preserva
 * a dinâmica de dentro do set que o Markov calculou).
 *
 * Devolve sempre { prob, applied, ... }: quando não há célula medida, `prob` volta
 * intacta e `applied` é false — nunca inventa correção.
 */
export function correctFavProb({ tour, favPreProb, favSets, dogSets, bestOf, modelProbFav }) {
  const out = { prob: modelProbFav, applied: false, reason: null, real: null, model: null, n: null, band: null };
  if (!Number.isFinite(modelProbFav)) return { ...out, prob: modelProbFav, reason: 'sem probabilidade' };
  if (bestOf !== 3) return { ...out, reason: 'medimos só melhor-de-3' };

  const key = stateKey(favSets, dogSets);
  if (!key) return { ...out, reason: 'estado sem medição' };

  const idx = bandIndex(favPreProb);
  const cell = idx >= 0 ? CORRECTION_TABLE[tour]?.[key]?.[idx] : null;
  if (!cell) return { ...out, reason: 'amostra insuficiente nesta faixa' };

  const shift = logit(cell.real) - logit(cell.model);
  return {
    prob: sigmoid(logit(modelProbFav) + shift),
    applied: true,
    reason: null,
    real: cell.real,
    model: cell.model,
    n: cell.n,
    band: BAND_LABELS[idx],
    deltaPp: (cell.real - cell.model) * 100,
  };
}
