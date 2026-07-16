// Momento de carreira: em ascensão / no auge / estável / em declínio.
// Funções puras. Regra de clareza: o número vai sempre embutido no texto (ver careerText).
//
// A regra foi calibrada em 813 ativos ATP e 366 WTA — cada constante tem um motivo:
//
// PONTOS e não posição no ranking: a razão de posição é estruturalmente incapaz no topo.
//   Partindo do #5, a razão máxima possível é 5,0 e a mínima 0,005 — quem começa o ano no
//   top 10 tem 0% de chance de sair "Em ascensão" e 40% de sair "Em declínio". Por posição,
//   Pegula #3->#4 saía "Em declínio" e Swiatek #7->#3 saía "Em ascensão".
// T = 1,5: em 1,3 a Sabalenka (#1->#1, razão 0,787) fica a 0,018 de ser publicada como
//   "Em declínio"; em 2,0 quem caiu pela metade (Musetti, Gauff) sairia "Estável".
// PORTÃO de 50 pontos: sem ele, Darian King (1 -> 7 pontos) sai "Em ascensão".
//   Um piso de ganho absoluto criaria absurdo pior (162 casos de queda >=100 posições
//   virando "parado").
// RÉGUA ADITIVA do auge: peak*1.25 pune quem foi bom — para o Alcaraz (pico #1) a folga
//   vira zero e ele sairia "Estável" sendo #2 do mundo.
//
// IMPORTANTE: isto DESCREVE os últimos 12 meses. Medido em 118.214 partidas: o rótulo
// não antecipa vitórias além do que o Elo já sabe. Não é previsão.

const T = 1.5;              // razão de pontos que separa ascensão/declínio
const PONTOS_MIN = 50;      // portão: abaixo disso não jogou tênis suficiente
const FOLGA_PCT = 0.25;     // folga do auge, como fração do pico
const FOLGA_MIN = 3;
const FOLGA_MAX = 20;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Está no pico da carreira, ou perto o bastante? Folga de 25% do pico, entre 3 e 20 posições. */
export function noAuge(rank, peak) {
  if (rank == null || peak == null) return false;
  return rank <= peak + clamp(Math.round(FOLGA_PCT * peak), FOLGA_MIN, FOLGA_MAX);
}

/** Classifica o momento. Nunca lança; ausência de dado vira `reason`, nunca "estável". */
export function careerMoment(career) {
  if (!career || career.rank == null) return { moment: null, reason: 'sem-dados', ratio: null };
  if (career.rank12m == null || career.points12m == null) return { moment: null, reason: 'sem-historico', ratio: null };
  if (Math.max(career.points, career.points12m) < PONTOS_MIN) return { moment: null, reason: 'pouco-tenis', ratio: null };

  // points12m === 0 dá Infinity de propósito: quem saiu do zero subiu mesmo.
  // O texto trata esse caso à parte para não escrever "subiu Infinityx".
  const ratio = career.points / career.points12m;
  if (ratio >= T) return { moment: 'ascensao', reason: null, ratio };
  if (ratio <= 1 / T) return { moment: 'declinio', reason: null, ratio };
  // Guarda: hoje inalcançável (o buildTrajectories sempre dá um pico a quem está no
  // ranking), mas existe para que uma mudança futura no pipeline não vire fallback
  // silencioso — ausência de dado tem que virar estado próprio com motivo, nunca "estável".
  if (career.peak == null) return { moment: null, reason: 'sem-dados', ratio };
  if (noAuge(career.rank, career.peak)) return { moment: 'auge', reason: null, ratio };
  return { moment: 'estavel', reason: null, ratio };
}
