// Ingestão de Challenger ATP / WTA 125 do mirror Sackmann (só tourney_level 'C', sem odds).
// Uso: import { loadChallenger } from './ingest-sackmann.js'
import { parseCsv, ROUND_ORDER } from './ingest.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';
const fileFor = (year, tour) =>
  tour === 'WTA' ? `wta/wta_matches_qual_itf_${year}.csv` : `atp/atp_matches_qual_chall_${year}.csv`;

const tourFileFor = (year, tour) =>
  tour === 'WTA' ? `wta/wta_matches_${year}.csv` : `atp/atp_matches_${year}.csv`;

/** Map de nome completo → nº de partidas no MAIN DRAW de tour (Sackmann atp_matches/wta_matches).
 *  Serve p/ desambiguar homônimos de Challenger por volume (quem realmente é o jogador de tour). */
export async function loadTourNameCounts(from, to, tour = 'ATP') {
  const counts = new Map();
  const bump = (n) => { if (n) counts.set(n, (counts.get(n) || 0) + 1); };
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);
  await Promise.all(years.map(async (y) => {
    try {
      const url = `${BASE}/${tourFileFor(y, tour)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
      for (const row of parseCsv(await res.text())) { bump(row.winner_name); bump(row.loser_name); }
    } catch (e) { console.warn(`aviso: tour Sackmann ${tour} ${y} ignorado (${e.message})`); }
  }));
  return counts;
}

/** Comparador da ordem cronológica REAL de uma partida: data → rodada → nº do jogo.
 *
 *  Por que não basta a data: `tourney_date` é a data de INÍCIO do torneio, então todas
 *  as partidas dele têm a mesma. Como o sort do JS é estável, ordenar só por data
 *  preserva a ordem das LINHAS do arquivo — e essa ordem não é confiável: o Sackmann
 *  passou a listar a final PRIMEIRO (ATP a partir de 2024, WTA de 2022; 100% dos 533
 *  torneios ATP de 2024+). O Elo processava a final antes das rodadas que levaram a ela.
 *
 *  Por que não basta o `match_num`: ele contradiz a rodada em 89 dos 2.446 torneios
 *  (3,6%). O pior caso real é a FINAL com número MENOR que a semifinal (atp 2017-7699:
 *  SF 299-300, F 270; atp 2019-6490: F 238). Há também torneios em que o main draw
 *  começa em 1 e o quali está em 255+ (atp 2015-6250).
 *
 *  Medido nos CSVs de 2013-2026 — pares de partidas fora de ordem:
 *    ordem do arquivo ......... 587.022
 *    só match_num .............  41.666
 *    rodada + match_num .......       0   <- esta
 *
 *  A rodada é a verdade; o `match_num` só desempata dentro dela. Partidas de tour
 *  (tennis-data) não têm `ord`/`num` e não precisam — já trazem a data de cada partida.
 *  Os `?? 0` existem só para o sort não virar NaN. */
export function byChronology(a, b) {
  return a.dateInt - b.dateInt || (a.ord ?? 0) - (b.ord ?? 0) || (a.num ?? 0) - (b.num ?? 0);
}

/** Texto CSV → partidas de Challenger/125 (só level 'C'). Puro (testável). */
export function challengerMatches(text) {
  const out = [];
  for (const row of parseCsv(text)) {
    if (row.tourney_level !== 'C') continue;
    const dateInt = parseInt(row.tourney_date, 10);
    const num = parseInt(row.match_num, 10);
    const surface = (row.surface || '').toLowerCase() || null;
    if (!Number.isFinite(dateInt) || !surface || !row.winner_name || !row.loser_name) continue;
    out.push({
      dateInt,
      // ord/num definem a ordem dentro do torneio — ver byChronology.
      // Round desconhecido cai em 3 (R32, o meio do torneio): errar para o meio é menos
      // pior que jogar a partida para antes do quali (0) ou depois da final (7).
      ord: ROUND_ORDER[row.round] ?? 3,
      num: Number.isFinite(num) ? num : 0,
      surface,
      winnerFull: row.winner_name,
      loserFull: row.loser_name,
    });
  }
  return out;
}

/** Baixa um ano (IO). Ano faltando → lança (tratado por loadChallenger). */
export async function fetchChallengerYear(year, tour = 'ATP') {
  const url = `${BASE}/${fileFor(year, tour)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  return challengerMatches(await res.text());
}

/** Carrega um intervalo de anos, em ordem cronológica. Tolera ano faltando. */
export async function loadChallenger(from, to, tour = 'ATP') {
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const chunks = await Promise.all(
    years.map(async (y) => {
      try { return await fetchChallengerYear(y, tour); }
      catch (e) { console.warn(`aviso: Challenger ${tour} ${y} ignorado (${e.message})`); return []; }
    })
  );
  return chunks.flat().sort(byChronology);
}
