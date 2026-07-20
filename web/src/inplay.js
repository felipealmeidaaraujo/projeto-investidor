// Motor AO VIVO: probabilidade de vencer a PARTIDA a partir de qualquer placar.
// Modelo hierárquico do tênis: ponto (saque) → game → set → partida.
// pA / pB = probabilidade de cada jogador ganhar um ponto NO PRÓPRIO SAQUE.
// Funções puras — testado em tests/inplay.test.js.

/** Probabilidade de o sacador MANTER o game (hold), dado p = ganhar o ponto no saque. */
export function holdProb(p) {
  const q = 1 - p;
  const denom = p * p + q * q;
  const deuce = denom > 0 ? (p * p) / denom : 0;
  return p ** 4 * (1 + 4 * q + 10 * q * q) + 20 * p ** 3 * q ** 3 * deuce;
}

/**
 * P(o SACADOR vencer o game a partir de um placar de pontos qualquer.
 * pts em "pontos ganhos" (0,1,2,3,4…), não em 15/30/40 — 3×3 é o deuce.
 * Generaliza holdProb(), que é este mesmo cálculo a partir de 0-0.
 *
 * Existe porque a nossa justa só sabia o placar ENTRE games, enquanto o preço da Betfair
 * já embute 15-40. Isso fabricava divergência falsa exatamente no break point.
 */
export function gameWinProb(p, sPts = 0, rPts = 0) {
  if (!Number.isFinite(p) || p < 0 || p > 1) return null;
  const s = Math.max(0, Math.trunc(sPts));
  const r = Math.max(0, Math.trunc(rPts));
  const q = 1 - p;
  const denom = p * p + q * q;
  const deuce = denom > 0 ? (p * p) / denom : 0; // daqui em diante, vantagem alterna

  const memo = new Map();
  function rec(a, b) {
    if (a >= 4 && a - b >= 2) return 1;
    if (b >= 4 && b - a >= 2) return 0;
    if (a >= 3 && b >= 3) {
      if (a === b) return deuce;              // deuce
      return a > b ? p + q * deuce : p * deuce; // vantagem do sacador / do devolvedor
    }
    const key = a * 10 + b;
    if (memo.has(key)) return memo.get(key);
    const v = p * rec(a + 1, b) + q * rec(a, b + 1);
    memo.set(key, v);
    return v;
  }
  return rec(s, r);
}

/** P(A vence o tiebreak) — primeiro a 7, vantagem de 2. aFirst = A saca o 1º ponto.
 *  startA/startB permitem entrar com o tiebreak já em andamento. */
function tiebreakProb(pA, pB, aFirst, startA = 0, startB = 0) {
  const winBoth = pA * (1 - pB);
  const loseBoth = (1 - pA) * pB;
  const deuceA = winBoth + loseBoth > 0 ? winBoth / (winBoth + loseBoth) : 0.5;
  const memo = new Map();
  const serverIsA = (pts) => {
    let first;
    if (pts === 0) first = true;
    else first = Math.floor((pts - 1) / 2) % 2 === 1;
    return first ? aFirst : !aFirst;
  };
  function rec(a, b) {
    if (a >= 7 && a - b >= 2) return 1;
    if (b >= 7 && b - a >= 2) return 0;
    if (a === b && a >= 6) return deuceA; // 6-6 → deuce
    const key = a * 100 + b;
    if (memo.has(key)) return memo.get(key);
    const pWinA = serverIsA(a + b) ? pA : 1 - pB;
    const r = pWinA * rec(a + 1, b) + (1 - pWinA) * rec(a, b + 1);
    memo.set(key, r);
    return r;
  }
  return rec(startA, startB);
}

/** P(A vence o SET) a partir de um placar de games, com o sacador do próximo game conhecido. */
function setWinProb(pA, pB, gamesA, gamesB, serverIsA) {
  const memo = new Map();
  function rec(ga, gb, servA) {
    if (ga >= 6 && ga - gb >= 2) return 1;
    if (gb >= 6 && gb - ga >= 2) return 0;
    if (ga === 6 && gb === 6) return tiebreakProb(pA, pB, servA);
    if (ga === 7) return 1;
    if (gb === 7) return 0;
    const key = (servA ? 10000 : 0) + ga * 100 + gb;
    if (memo.has(key)) return memo.get(key);
    const hold = servA ? holdProb(pA) : holdProb(pB);
    const aWinsGame = servA ? hold : 1 - hold;
    const r = aWinsGame * rec(ga + 1, gb, !servA) + (1 - aWinsGame) * rec(ga, gb + 1, !servA);
    memo.set(key, r);
    return r;
  }
  return rec(gamesA, gamesB, serverIsA);
}

/** P(A vence um set começando do 0-0, média sobre quem saca primeiro. */
function setWinFromStart(pA, pB) {
  return 0.5 * setWinProb(pA, pB, 0, 0, true) + 0.5 * setWinProb(pA, pB, 0, 0, false);
}

/**
 * P(A vencer a PARTIDA) a partir de um estado ao vivo.
 * state = { setsA, setsB, gamesA, gamesB, serverIsA, ptsA, ptsB }. bestOf = 3 ou 5.
 *
 * ptsA/ptsB são os pontos do game EM ANDAMENTO (0,1,2,3,4… — 3×3 é deuce; no tiebreak,
 * os pontos do tiebreak). Omitidos ou 0-0, o cálculo é o de sempre: fronteira de game.
 * Com eles, o número passa a valer NO MEIO do game — que é onde o preço da Betfair vive.
 */
export function winProbFromState(state, pA, pB, bestOf = 3) {
  const setsToWin = bestOf === 5 ? 3 : 2;
  const { setsA = 0, setsB = 0, gamesA = 0, gamesB = 0, serverIsA = true, ptsA = 0, ptsB = 0 } = state;
  if (setsA >= setsToWin) return 1;
  if (setsB >= setsToWin) return 0;

  const setStart = setWinFromStart(pA, pB);
  const memo = new Map();
  function fromSets(sA, sB) {
    if (sA >= setsToWin) return 1;
    if (sB >= setsToWin) return 0;
    const key = sA * 10 + sB;
    if (memo.has(key)) return memo.get(key);
    const r = setStart * fromSets(sA + 1, sB) + (1 - setStart) * fromSets(sA, sB + 1);
    memo.set(key, r);
    return r;
  }

  const pts = Math.max(0, Math.trunc(ptsA)) + Math.max(0, Math.trunc(ptsB)) > 0;
  let curSet;
  if (!pts) {
    curSet = setWinProb(pA, pB, gamesA, gamesB, serverIsA);
  } else if (gamesA === 6 && gamesB === 6) {
    // No 6-6 os pontos são do TIEBREAK, e vencê-lo já fecha o set.
    curSet = tiebreakProb(pA, pB, serverIsA, Math.trunc(ptsA), Math.trunc(ptsB));
  } else {
    // Game em andamento: resolve o game pelos pontos e segue do placar de games resultante.
    const sp = serverIsA ? pA : pB;                       // força de saque de quem saca
    const hold = gameWinProb(sp, serverIsA ? ptsA : ptsB, serverIsA ? ptsB : ptsA);
    const seSegura = serverIsA
      ? setWinProb(pA, pB, gamesA + 1, gamesB, false)
      : setWinProb(pA, pB, gamesA, gamesB + 1, true);
    const seQuebra = serverIsA
      ? setWinProb(pA, pB, gamesA, gamesB + 1, false)
      : setWinProb(pA, pB, gamesA + 1, gamesB, true);
    curSet = hold * seSegura + (1 - hold) * seQuebra;
  }
  return curSet * fromSets(setsA + 1, setsB) + (1 - curSet) * fromSets(setsA, setsB + 1);
}

/**
 * Deriva as forças de saque (pA, pB) a partir da probabilidade pré-jogo alvo,
 * mantendo o nível médio do circuito (base). Consistente com o modelo Elo.
 */
export function impliedServeProbs(target, { base = 0.64, bestOf = 3 } = {}) {
  const clamp = (x) => Math.min(0.95, Math.max(0.5, x));
  const startProb = (delta) =>
    winProbFromState({ setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true }, clamp(base + delta), clamp(base - delta), bestOf);
  let lo = -0.25;
  let hi = 0.25;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (startProb(mid) < target) lo = mid;
    else hi = mid;
  }
  const delta = (lo + hi) / 2;
  return { pA: clamp(base + delta), pB: clamp(base - delta) };
}

const OVERREACTION_BANDS = [
  { min: 40, level: 'forte' },
  { min: 25, level: 'moderada' },
  { min: 15, level: 'leve' },
];

/**
 * Sobre-reação: compara a odd de mercado com a odd justa de um jogador.
 * divPct > 0 = mercado paga mais que o justo (subestima → valor em BACK nele).
 * divPct < 0 = mercado paga menos (superestima → valor em LAY nele).
 * level null = divergência < 15% (odd em linha). null se odds inválidas.
 */
export function overreaction(fairOdd, marketOdd) {
  if (!Number.isFinite(fairOdd) || fairOdd <= 1 || !Number.isFinite(marketOdd) || marketOdd <= 1) return null;
  const divPct = (marketOdd / fairOdd - 1) * 100;
  const abs = Math.abs(divPct);
  const band = OVERREACTION_BANDS.find((b) => abs >= b.min);
  return { divPct, level: band ? band.level : null, back: divPct > 0 };
}

/**
 * Probabilidade "limpa" do 1º jogador a partir do PAR de odds do mercado, tirando a margem.
 * Precisa das duas: com uma só não dá pra separar a probabilidade da margem embutida.
 */
export function devigPair(oddA, oddB) {
  if (!Number.isFinite(oddA) || !Number.isFinite(oddB) || oddA <= 1 || oddB <= 1) return null;
  const a = 1 / oddA;
  const b = 1 / oddB;
  return a / (a + b);
}

/**
 * A comissão da Betfair incide sobre o LUCRO, então ela cria uma "zona morta" em torno da
 * odd justa onde nenhum lado dá lucro. Retorna os limites dessa zona:
 *   layMax  = maior odd em que ainda vale LANÇAR (lay) — acima disso o lay perde;
 *   backMin = menor odd em que ainda vale BANCAR (back) — abaixo disso o back perde.
 * Entre os dois, qualquer divergência é ilusão: a comissão come inteira.
 */
export function commissionZone(fairOdd, commission = 0.065) {
  if (!Number.isFinite(fairOdd) || fairOdd <= 1) return null;
  if (!Number.isFinite(commission) || commission < 0 || commission >= 1) return null;
  return {
    layMax: 1 + (fairOdd - 1) * (1 - commission),
    backMin: 1 + (fairOdd - 1) / (1 - commission),
  };
}

/**
 * EV LÍQUIDO do lado que a divergência indica, já com a comissão, SEMPRE por unidade de
 * CAPITAL EM RISCO — pra back e lay significarem a mesma coisa e poderem ser comparados.
 *
 * Bancando, o que se arrisca é o stake (1). Lançando, é a RESPONSABILIDADE (odd−1): quem
 * lança a 5.00 arrisca 4 pra ganhar 1. Dividir os dois pelo mesmo denominador era o erro —
 * inflava/desinflava o lay e estragava o dimensionamento de posição.
 *
 * Invariante que os testes travam: bancar A é o mesmo trade que lançar B no par devigado,
 * então os dois têm que devolver o MESMO ev.
 *
 * `covers` diz se sobra algo depois da comissão (o sinal não muda com o denominador).
 */
export function netEdge(fairOdd, marketOdd, commission = 0.065) {
  const zone = commissionZone(fairOdd, commission);
  if (!zone || !Number.isFinite(marketOdd) || marketOdd <= 1) return null;
  const p = 1 / fairOdd; // prob justa de o jogador vencer
  const back = marketOdd > fairOdd;
  const liability = marketOdd - 1;
  const ev = back
    // Bancando 1: ganha (odd−1) com prob p, já sem a comissão sobre o lucro; perde 1 com (1−p).
    ? p * liability * (1 - commission) - (1 - p)
    // Lançando: ganha 1 (o stake do outro) com (1−p), menos comissão; paga a liability com p.
    // Dividido pela liability = retorno sobre o que você de fato coloca em risco.
    : ((1 - p) * (1 - commission) - p * liability) / liability;
  return { back, ev, covers: ev > 0, liability, ...zone };
}

/** Odd justa ao vivo de A e B, dado a prob pré-jogo de A (target) e o placar. */
export function liveFairOdds(preProbA, state, { base = 0.64, bestOf = 3 } = {}) {
  const { pA, pB } = impliedServeProbs(preProbA, { base, bestOf });
  const probA = winProbFromState(state, pA, pB, bestOf);
  const probB = 1 - probA;
  return {
    probA,
    probB,
    fairOddA: probA > 0 ? 1 / probA : Infinity,
    fairOddB: probB > 0 ? 1 / probB : Infinity,
  };
}
