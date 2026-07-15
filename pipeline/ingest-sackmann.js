// Ingestão de Challenger ATP / WTA 125 do mirror Sackmann (só tourney_level 'C', sem odds).
// Uso: import { loadChallenger } from './ingest-sackmann.js'
import { parseCsv } from './ingest.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';
const fileFor = (year, tour) =>
  tour === 'WTA' ? `wta/wta_matches_qual_itf_${year}.csv` : `atp/atp_matches_qual_chall_${year}.csv`;

/** Texto CSV → partidas de Challenger/125 (só level 'C'). Puro (testável). */
export function challengerMatches(text) {
  const out = [];
  for (const row of parseCsv(text)) {
    if (row.tourney_level !== 'C') continue;
    const dateInt = parseInt(row.tourney_date, 10);
    const surface = (row.surface || '').toLowerCase() || null;
    if (!Number.isFinite(dateInt) || !surface || !row.winner_name || !row.loser_name) continue;
    out.push({ dateInt, surface, winnerFull: row.winner_name, loserFull: row.loser_name });
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

/** Carrega um intervalo de anos, ordenado por data. Tolera ano faltando. */
export async function loadChallenger(from, to, tour = 'ATP') {
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const chunks = await Promise.all(
    years.map(async (y) => {
      try { return await fetchChallengerYear(y, tour); }
      catch (e) { console.warn(`aviso: Challenger ${tour} ${y} ignorado (${e.message})`); return []; }
    })
  );
  return chunks.flat().sort((a, b) => a.dateInt - b.dateInt);
}
