// Modo operação: o estado do jogo que você está acompanhando, guardado por partida.
//
// POR QUÊ: operar é um laço curto repetido — game acontece, registra, lê o preço, decide.
// Tudo aqui existe pra esse laço custar o mínimo de toques. E o estado sobrevive a fechar
// e reabrir o jogo, pra dar pra acompanhar duas ou três partidas alternando.
//
// Funções puras (o armazenamento é injetado). Testado em tests/operar.test.js.
import { tickSize } from './ladder.js';

export const OP_KEY = 'investidor.operacao';
const MAX_PARTIDAS = 10; // guarda as últimas; o resto é lixo de sessões antigas

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Move a odd UM degrau da escada da Betfair. dir > 0 sobe, dir < 0 desce.
 * Entre um game e outro o preço anda pouco — dois toques em vez do teclado inteiro.
 */
export function oddTick(odd, dir) {
  if (!Number.isFinite(odd) || odd < 1.01 || !dir) return null;
  if (dir > 0) {
    const passo = tickSize(odd);
    return passo == null ? null : round2(Math.min(1000, odd + passo));
  }
  // Descendo, o degrau válido é o da faixa de baixo quando se está bem no limite.
  const passo = tickSize(odd - 1e-9) ?? tickSize(odd);
  return passo == null ? null : round2(Math.max(1.01, odd - passo));
}

/** Identidade da partida no armazenamento. */
export function opKey(a, b) {
  return `${String(a ?? '').trim()}|${String(b ?? '').trim()}`;
}

function lerTudo(storage) {
  try {
    const raw = storage?.getItem(OP_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** Estado guardado desta partida, ou null. */
export function loadOp(storage, key) {
  const tudo = lerTudo(storage);
  const reg = tudo[key];
  return reg && typeof reg === 'object' ? reg.live ?? null : null;
}

/** Guarda o estado desta partida, descartando as mais antigas além do teto. */
export function saveOp(storage, key, live, agora = 0) {
  if (!key || !live) return;
  const tudo = lerTudo(storage);
  tudo[key] = { live, at: agora };
  const chaves = Object.keys(tudo);
  if (chaves.length > MAX_PARTIDAS) {
    chaves
      .sort((x, y) => (tudo[x].at ?? 0) - (tudo[y].at ?? 0))
      .slice(0, chaves.length - MAX_PARTIDAS)
      .forEach((k) => delete tudo[k]);
  }
  try {
    storage?.setItem(OP_KEY, JSON.stringify(tudo));
  } catch {
    /* cota estourada: seguir sem persistir é melhor que quebrar a operação */
  }
}

/** Apaga o estado guardado desta partida (ao zerar a operação). */
export function clearOp(storage, key) {
  const tudo = lerTudo(storage);
  if (!(key in tudo)) return;
  delete tudo[key];
  try {
    storage?.setItem(OP_KEY, JSON.stringify(tudo));
  } catch { /* idem */ }
}
