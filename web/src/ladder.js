// Escada do próximo game: pra onde o preço vai se o sacador segurar, e se for quebrado.
//
// POR QUÊ: trader não pensa em probabilidade, pensa em MOVIMENTO. Saber antes do game
// quanto a odd anda em cada desfecho é o que define tamanho de posição e se vale abrir —
// e identifica os poucos games do jogo em que o preço realmente se mexe (nos outros,
// operar é pagar spread). Não inventa sinal: é a aritmética do próprio motor, exposta.
//
// Funções puras. Testado em tests/ladder.test.js.

/** Degraus da escada de odds da Betfair (de, até, passo). */
const TICK_BANDS = [
  [1.01, 2, 0.01], [2, 3, 0.02], [3, 4, 0.05], [4, 6, 0.1], [6, 10, 0.2],
  [10, 20, 0.5], [20, 30, 1], [30, 50, 2], [50, 100, 5], [100, 1000, 10],
];

/** Tamanho do degrau naquela faixa de odd. */
export function tickSize(odd) {
  if (!Number.isFinite(odd) || odd < 1.01) return null;
  for (const [from, to, step] of TICK_BANDS) if (odd >= from && odd < to) return step;
  return odd >= 1000 ? 10 : null;
}

/** Posição absoluta na escada, contada em degraus desde 1.01. */
function tickIndex(odd) {
  const o = Math.min(Math.max(odd, 1.01), 1000);
  let idx = 0;
  for (const [from, to, step] of TICK_BANDS) {
    if (o <= from) break;
    idx += (Math.min(o, to) - from) / step;
  }
  return idx;
}

/** Quantos degraus da escada separam duas odds (sinal = direção). */
export function ticksBetween(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1.01 || to < 1.01) return null;
  return Math.round(tickIndex(to) - tickIndex(from));
}

const setsToWin = (bestOf) => (bestOf === 5 ? 3 : 2);
const setDone = (x, y) => (x >= 6 && x - y >= 2) || x === 7;

/** A partida já acabou neste placar de sets? */
export function matchOver(state, bestOf = 3) {
  const w = setsToWin(bestOf);
  return (state?.setsA ?? 0) >= w || (state?.setsB ?? 0) >= w;
}

/** No 6-6 o "próximo game" é o tie-break — muda o vocabulário na tela. */
export function isTiebreak(state) {
  return (state?.gamesA ?? 0) === 6 && (state?.gamesB ?? 0) === 6;
}

/** Avança um game. `serverWins` = o sacador venceu. Fecha o set e zera os games quando cabe. */
export function stepGame(state, serverWins) {
  const { setsA = 0, setsB = 0, gamesA = 0, gamesB = 0, serverIsA = true } = state || {};
  let ga = gamesA;
  let gb = gamesB;
  if (serverIsA === !!serverWins) ga++;
  else gb++;
  let sa = setsA;
  let sb = setsB;
  if (setDone(ga, gb)) { sa++; ga = 0; gb = 0; }
  else if (setDone(gb, ga)) { sb++; ga = 0; gb = 0; }
  // O saque alterna a cada game (e no início do set seguinte, também).
  return { setsA: sa, setsB: sb, gamesA: ga, gamesB: gb, serverIsA: !serverIsA };
}

/**
 * Os dois estados possíveis depois do próximo game.
 * Devolve null quando a partida já acabou (não há próximo game).
 */
export function nextGameStates(state, bestOf = 3) {
  if (!state || matchOver(state, bestOf)) return null;
  return {
    hold: stepGame(state, true),
    broken: stepGame(state, false),
    tiebreak: isTiebreak(state),
  };
}
