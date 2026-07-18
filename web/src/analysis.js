// Motor de leitura de confrontos: transforma os ratings do modelo numa análise
// honesta (probabilidade calibrada, favorito, forças por superfície, confiança).
// Funções puras sobre os objetos de jogador do model.json. Testado em tests/analysis.test.js.
import { expectedScore, blendSurface, calibrate } from './model-math.js';
import { ageAdjusted } from './age-curve.js';
import { inatividadeDias, decayAdjusted } from './decay-curve.js';

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
// Abaixo disso a amostra da superfície é ruído, não sinal — vale para a leitura
// (surfaceRead) E para os selos (playerTags), que precisam concordar.
const MIN_SURFACE_MATCHES = 15;

export function surfaceRead(player, surface) {
  const surfMatches = player.matchesBySurface?.[surface] ?? 0;
  const surfElo = player[surface] ?? player.elo;
  const delta = Math.round(surfElo - player.elo);
  if (surfMatches < MIN_SURFACE_MATCHES) return { tag: 'poucos dados', delta, surfMatches };
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

/** Limiares de tag de saque por circuito (= cortes das bandas, pra não contradizer). */
const SERVE_TAG_THRESHOLDS = {
  ATP: { serveHi: 0.68, serveLo: 0.61, ace: 0.11, retHi: 0.40, retLo: 0.34, bpHi: 0.66, bpLo: 0.58 },
  WTA: { serveHi: 0.594, serveLo: 0.537, ace: 0.064, retHi: 0.454, retLo: 0.413, bpHi: 0.583, bpLo: 0.506 },
};

/** Tags de força/fraqueza do jogador (saque/devolução + superfície), com limiares por circuito. */
export function playerTags(player, tour = 'ATP') {
  const tags = [];
  const s = player.serve;
  const T = SERVE_TAG_THRESHOLDS[tour] ?? SERVE_TAG_THRESHOLDS.ATP;
  if (s) {
    if (s.servePtsWonPct >= T.serveHi) tags.push({ t: 'Saque forte', kind: 'strength' });
    else if (s.servePtsWonPct > 0 && s.servePtsWonPct < T.serveLo) tags.push({ t: 'Saque fraco', kind: 'weakness' });
    if (s.acePct >= T.ace) tags.push({ t: 'Muitos aces', kind: 'strength' });
    if (s.returnPtsWonPct >= T.retHi) tags.push({ t: 'Devolvedor forte', kind: 'strength' });
    else if (s.returnPtsWonPct > 0 && s.returnPtsWonPct < T.retLo) tags.push({ t: 'Devolve pouco', kind: 'weakness' });
    if (s.bpSavedPct >= T.bpHi) tags.push({ t: 'Salva break points', kind: 'strength' });
    else if (s.bpSavedPct > 0 && s.bpSavedPct < T.bpLo) tags.push({ t: 'Vacila em break point', kind: 'weakness' });
  }
  for (const [surf, label] of [['clay', 'no saibro'], ['hard', 'na dura'], ['grass', 'na grama']]) {
    const e = player[surf];
    if (e == null) continue;
    // Amostra pequena: o Elo da superfície fica preso perto do prior (ruído). O selo é
    // uma afirmação categórica — sem jogos suficientes, não crava (mesma régua do surfaceRead).
    if ((player.matchesBySurface?.[surf] ?? 0) < MIN_SURFACE_MATCHES) continue;
    const d = e - player.elo;
    if (d >= 60) tags.push({ t: `Especialista ${label}`, kind: 'strength' });
    else if (d <= -60) tags.push({ t: `Rende menos ${label}`, kind: 'relative' });
  }
  return tags;
}

/** Leitura completa do confronto.
 *  `level` (opcional) é o nível do torneio ('tour'|'challenger'); quando ausente,
 *  deriva do nível dos jogadores. A curva de idade só roda em nível 'tour'.
 *  `refDate` (AAAAMMDD, opcional) habilita o decay de inatividade em Challenger. */
export function analyzeMatch(playerA, playerB, surface, model, level, refDate) {
  const T = model.calibrationT ?? 1;
  const bruta = matchProbability(playerA, playerB, surface, T);

  // Nível efetivo: o do torneio quando informado (grade); senão, deriva do nível dos jogadores.
  // Barra o ajuste só se ALGUM jogador for explicitamente 'challenger' — quem não tem o campo
  // (fixture de teste, jogador custom) conta como tour, preservando o comportamento anterior.
  const nivelEfetivo =
    level ?? (playerA.level === 'challenger' || playerB.level === 'challenger' ? 'challenger' : 'tour');
  const aplicaIdade = nivelEfetivo === 'tour';

  // A "sombra": o ajuste que o modelo faria no tour. Calculado sempre, para explicar a supressão.
  const shadow = ageAdjusted(bruta, playerA.bio?.age, playerB.bio?.age, model.tour);

  let probA, ageAdjust, ageSuppressed;
  if (aplicaIdade || !shadow?.adjusted) {
    // Aplica normalmente (tour), ou não havia ajuste de qualquer forma (WTA, mesma idade, sem bio).
    ageAdjust = shadow;
    probA = shadow ? shadow.prob : bruta;
    ageSuppressed = null;
  } else {
    // Havia ajuste (ATP + gap), mas o nível Challenger o barra: suprime e guarda a sombra.
    probA = bruta;
    ageAdjust = { prob: bruta, base: bruta, delta: 0, gap: shadow.gap, adjusted: false };
    ageSuppressed = { gap: shadow.gap, wouldDelta: shadow.delta };
  }

  // Decay por inatividade — só Challenger ATP; exclusivo com a idade (que só roda em tour).
  // Sem refDate (chamada sem data do confronto) o decay não roda — a inatividade é indeterminada.
  let decayAdjust = null;
  if (nivelEfetivo === 'challenger' && refDate != null) {
    const inatA = inatividadeDias(refDate, playerA.lastDate);
    const inatB = inatividadeDias(refDate, playerB.lastDate);
    const d = decayAdjusted(probA, inatA, inatB, model.tour);
    if (d?.adjusted) { probA = d.prob; decayAdjust = d; }
  }

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
    ageAdjust,
    ageSuppressed,
    decayAdjust,
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
    // hi = quem tem o piso maior. O fecho relaciona esse piso com o favorito real.
    let fecho;
    if (flipped) fecho = 'a mão vira.';
    else if (hi.name === r.favorite) fecho = 'reforça o favorito.';
    else fecho = 'o piso favorece o azarão, mas não vira a mão.';
    piso = `${hi.name} ${hi.surfaceElo} · ${lo.name} ${lo.surfaceElo} no ${surf} — ${fecho}`;
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

/** Faixas de referência de saque/devolução por circuito (frações 0–1), dos dados reais. */
const SERVE_BANDS = {
  ATP: {
    servePtsWonPct: { lo: 0.610, mid: 0.634, hi: 0.680 },
    firstInPct: { lo: 0.590, mid: 0.626, hi: 0.670 },
    acePct: { lo: 0.050, mid: 0.073, hi: 0.110 },
    returnPtsWonPct: { lo: 0.340, mid: 0.357, hi: 0.400 },
    bpSavedPct: { lo: 0.580, mid: 0.613, hi: 0.660 },
  },
  WTA: {
    servePtsWonPct: { lo: 0.537, mid: 0.558, hi: 0.594 },
    firstInPct: { lo: 0.585, mid: 0.627, hi: 0.686 },
    acePct: { lo: 0.020, mid: 0.033, hi: 0.064 },
    returnPtsWonPct: { lo: 0.413, mid: 0.431, hi: 0.454 },
    bpSavedPct: { lo: 0.506, mid: 0.542, hi: 0.583 },
  },
};
const BAND_LABEL = { elite: 'elite', high: 'acima da média', mid: 'na média', low: 'abaixo da média' };

/** Classifica um stat de saque na sua banda, conforme o circuito. */
export function serveBand(tour, key, value) {
  const b = SERVE_BANDS[tour]?.[key];
  if (!b || !(value > 0)) return null;
  const band = value >= b.hi ? 'elite' : value >= b.mid ? 'high' : value >= b.lo ? 'mid' : 'low';
  return { band, label: BAND_LABEL[band] };
}
