// Motor de leitura de confrontos: transforma os ratings do modelo numa análise
// honesta (probabilidade calibrada, favorito, forças por superfície, confiança).
// Funções puras sobre os objetos de jogador do model.json. Testado em tests/analysis.test.js.
import { expectedScore, blendSurface, calibrate } from './model-math.js';

/** Rating combinado (geral + superfície) de um jogador numa superfície. */
export function blendedRating(player, surface) {
  const surf = player[surface];
  return blendSurface(player.elo, surf ?? player.elo, 0.5);
}

/** Probabilidade calibrada de A vencer B na superfície. */
export function matchProbability(playerA, playerB, surface, T) {
  const raw = expectedScore(blendedRating(playerA, surface), blendedRating(playerB, surface));
  return calibrate(raw, T);
}

/** Rótulo da margem, a partir da probabilidade do favorito (≥0.5). */
export function marginLabel(favProb) {
  if (favProb < 0.55) return 'equilibrado';
  if (favProb < 0.65) return 'leve favorito';
  if (favProb < 0.78) return 'favorito claro';
  return 'favoritão';
}

/** Como o jogador se sai naquela superfície vs. o próprio nível geral. */
export function surfaceRead(player, surface) {
  const surfMatches = player.matchesBySurface?.[surface] ?? 0;
  const surfElo = player[surface] ?? player.elo;
  const delta = Math.round(surfElo - player.elo);
  if (surfMatches < 15) return { tag: 'poucos dados', delta, surfMatches };
  if (delta >= 40) return { tag: 'forte', delta, surfMatches };
  if (delta <= -40) return { tag: 'fraco', delta, surfMatches };
  return { tag: 'neutro', delta, surfMatches };
}

/** Nível de confiança da leitura, conforme volume de dados dos dois jogadores. */
export function confidenceLevel(playerA, playerB, surface) {
  const minMatches = Math.min(playerA.matches ?? 0, playerB.matches ?? 0);
  const minSurf = Math.min(
    playerA.matchesBySurface?.[surface] ?? 0,
    playerB.matchesBySurface?.[surface] ?? 0
  );
  if (minMatches < 30 || minSurf < 10) {
    return { level: 'baixa', reason: 'poucos jogos de histórico para um dos jogadores' };
  }
  if (minMatches < 80 || minSurf < 25) {
    return { level: 'média', reason: 'histórico moderado nesta superfície' };
  }
  return { level: 'alta', reason: 'amplo histórico para os dois jogadores' };
}

/** Tags de força/fraqueza do jogador (saque/devolução + superfície) a partir dos dados. */
export function playerTags(player) {
  const tags = [];
  const s = player.serve;
  if (s) {
    if (s.servePtsWonPct >= 0.68) tags.push({ t: 'Saque forte', kind: 'strength' });
    else if (s.servePtsWonPct > 0 && s.servePtsWonPct < 0.61) tags.push({ t: 'Saque fraco', kind: 'weakness' });
    if (s.acePct >= 0.11) tags.push({ t: 'Muitos aces', kind: 'strength' });
    if (s.returnPtsWonPct >= 0.4) tags.push({ t: 'Devolvedor forte', kind: 'strength' });
    else if (s.returnPtsWonPct > 0 && s.returnPtsWonPct < 0.34) tags.push({ t: 'Devolve pouco', kind: 'weakness' });
    if (s.bpSavedPct >= 0.66) tags.push({ t: 'Salva break points', kind: 'strength' });
    else if (s.bpSavedPct > 0 && s.bpSavedPct < 0.58) tags.push({ t: 'Vacila em break point', kind: 'weakness' });
  }
  for (const [surf, label] of [['clay', 'no saibro'], ['hard', 'na dura'], ['grass', 'na grama']]) {
    const e = player[surf];
    if (e == null) continue;
    const d = e - player.elo;
    if (d >= 60) tags.push({ t: `Especialista ${label}`, kind: 'strength' });
    else if (d <= -60) tags.push({ t: `Rende menos ${label}`, kind: 'relative' });
  }
  return tags;
}

/** Leitura completa do confronto. */
export function analyzeMatch(playerA, playerB, surface, model) {
  const T = model.calibrationT ?? 1;
  const probA = matchProbability(playerA, playerB, surface, T);
  const probB = 1 - probA;
  const favA = probA >= 0.5;

  return {
    surface,
    a: {
      name: playerA.name,
      elo: playerA.elo,
      surfaceElo: playerA[surface] ?? null,
      blended: Math.round(blendedRating(playerA, surface)),
      surfaceRead: surfaceRead(playerA, surface),
    },
    b: {
      name: playerB.name,
      elo: playerB.elo,
      surfaceElo: playerB[surface] ?? null,
      blended: Math.round(blendedRating(playerB, surface)),
      surfaceRead: surfaceRead(playerB, surface),
    },
    probA,
    probB,
    favorite: favA ? playerA.name : playerB.name,
    underdog: favA ? playerB.name : playerA.name,
    favoriteProb: favA ? probA : probB,
    marginLabel: marginLabel(favA ? probA : probB),
    confidence: confidenceLevel(playerA, playerB, surface),
    fairOddA: 1 / probA,
    fairOddB: 1 / probB,
  };
}

/** Superfície → nome em pt-BR, para as frases da explicação. */
const SURFACE_PT = { clay: 'saibro', hard: 'quadra dura', grass: 'grama' };

/**
 * Frases dinâmicas ("no jogo:") que explicam os números do card de leitura.
 * Recebe o resultado de analyzeMatch. Puro e testável.
 */
export function buildReadingExplanation(r) {
  const surf = SURFACE_PT[r.surface] ?? r.surface;
  const a = r.a;
  const b = r.b;

  // Bloco Elo — quem está à frente no geral
  let elo;
  if (a.elo === b.elo) {
    elo = `${a.name} e ${b.name} estão empatados no Elo geral (${a.elo}).`;
  } else {
    const hi = a.elo > b.elo ? a : b;
    const lo = a.elo > b.elo ? b : a;
    elo = `${hi.name} ${hi.elo} · ${lo.name} ${lo.elo} — no geral, ${hi.name} vem à frente.`;
  }

  // Favorito por Elo geral vs. favorito de fato (força) → detecta inversão
  const favGeneralName = a.elo === b.elo ? null : (a.elo > b.elo ? a.name : b.name);
  const flipped = favGeneralName != null && favGeneralName !== r.favorite;

  // Bloco Piso — quem rende mais na superfície (trata piso ausente)
  let piso;
  if (a.surfaceElo == null || b.surfaceElo == null) {
    const semPiso = a.surfaceElo == null ? a : b;
    piso = `${semPiso.name} tem poucos jogos no ${surf}, então não há um Elo de piso confiável pra ele — a força dele usa só o Elo geral.`;
  } else {
    const hi = a.surfaceElo > b.surfaceElo ? a : b;
    const lo = a.surfaceElo > b.surfaceElo ? b : a;
    const fecho = flipped ? 'a mão vira.' : 'confirma o favorito.';
    piso = `No ${surf}: ${hi.name} ${hi.surfaceElo} · ${lo.name} ${lo.surfaceElo} — ${fecho}`;
  }

  // Bloco Força — a nota que decide, + favorito e %
  const favProbPct = Math.round(r.favoriteProb * 100);
  const extra = flipped ? ', mesmo tendo Elo geral menor' : '';
  const forca = `${a.name} ${a.blended} · ${b.name} ${b.blended}. Por isso, no ${surf} o favorito é ${r.favorite} — ${favProbPct}%${extra}.`;

  // Bloco (+/−) — delta e tag de cada um
  const tagPhrase = (side) => {
    const sr = side.surfaceRead;
    if (sr.tag === 'poucos dados') {
      return `${side.name} tem poucos jogos no ${surf} (piso pouco confiável)`;
    }
    if (sr.tag === 'neutro') {
      return `${side.name} joga em linha com o próprio nível`;
    }
    const sign = sr.delta > 0 ? '+' : '−';
    return `${side.name} (${sign}${Math.abs(sr.delta)}) ${sr.tag}`;
  };
  const delta = `${tagPhrase(a)}; ${tagPhrase(b)}.`;

  return { elo, piso, forca, delta, flipped };
}
