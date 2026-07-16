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

const SPIKE_MIN = 60; // % do ganho de 12 meses vindo de uma semana só

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 1685 -> "1.685" (separador de milhar do pt-BR, sem depender de locale). */
const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** 20260608 -> "08/06/2026" */
const dia = (d) => `${String(d % 100).padStart(2, '0')}/${String(Math.floor(d / 100) % 100).padStart(2, '0')}/${Math.floor(d / 10000)}`;
/** 20250609 -> "junho de 2025" */
const mesAno = (d) => `${MESES[(Math.floor(d / 100) % 100) - 1]} de ${Math.floor(d / 10000)}`;
const ano = (d) => Math.floor(d / 10000);
/** 2.6 -> "2,6" */
const dec = (x) => x.toFixed(1).replace('.', ',');

/** Momento de carreira -> {label, detail, warn} para o card. null se não há dado.
 *  O número vai sempre embutido — nenhum rótulo aparece nu. */
export function careerText(career) {
  if (!career) return null;
  const m = careerMoment(career);
  const { rank, points, rank12m, points12m, peak, peakDate, date12m, spikePct, spikeDate } = career;

  if (m.reason === 'sem-dados') return null;
  if (m.reason === 'sem-historico') {
    const quando = date12m ? `em ${mesAno(date12m)}` : 'há um ano';
    return { label: 'Sem histórico', warn: null,
      detail: `não tinha ranking ${quando}, então não dá para dizer o momento. Hoje está no #${rank}.` };
  }
  if (m.reason === 'pouco-tenis') {
    return { label: 'Pouco tênis no período', warn: null,
      detail: `não passou de ${num(Math.max(points, points12m))} pontos nos últimos 12 meses; não dá para falar em momento de carreira.` };
  }

  // aviso de subida concentrada: só para quem subiu (quem caiu não tem "subida")
  const warn = m.moment === 'ascensao' && spikePct != null && spikePct >= SPIKE_MIN && spikeDate
    ? `Cuidado: ${spikePct}% da subida veio de uma semana só — em ${dia(spikeDate)}.`
    : null;

  if (m.moment === 'ascensao') {
    const detail = points12m === 0
      ? `não tinha pontos em ${date12m ? mesAno(date12m) : 'um ano atrás'}; hoje tem ${num(points)}. Saiu do #${rank12m} e está no #${rank}.`
      : `os pontos subiram ${dec(m.ratio)}x em 12 meses (${num(points12m)} → ${num(points)}). Saiu do #${rank12m} e está no #${rank}.`;
    return { label: 'Em ascensão', detail, warn };
  }

  if (m.moment === 'declinio') {
    return { label: 'Em declínio', warn: null,
      detail: `perdeu ${Math.round((1 - m.ratio) * 100)}% dos pontos em 12 meses (${num(points12m)} → ${num(points)}). Era #${rank12m}, está no #${rank}.` };
  }

  // auge e estável citam o pico — e o ANO do pico é obrigatório
  const delta = Math.round((m.ratio - 1) * 100);
  const variacao = `Os pontos mudaram ${delta >= 0 ? '+' : ''}${delta}% em 12 meses (${num(points12m)} → ${num(points)}).`;

  if (m.moment === 'auge') {
    if (rank === peak) {
      return { label: 'No auge', warn: null,
        detail: `está no #${rank}, o melhor ranking da carreira, alcançado em ${ano(peakDate)}.` };
    }
    return { label: 'No auge', warn: null,
      detail: `está no #${rank}; seu melhor foi #${peak}, em ${ano(peakDate)}. ${variacao}` };
  }

  return { label: 'Estável', warn: null,
    detail: `os pontos mudaram ${delta >= 0 ? '+' : ''}${delta}% em 12 meses (${num(points12m)} → ${num(points)}); está no #${rank}, longe do melhor da carreira (#${peak}, em ${ano(peakDate)}).` };
}
