// Gera web/matches.json com o histórico de partidas (~3 anos, ATP+WTA) pra forma/descanso/H2H.
// Rode: node pipeline/matches.js
import { writeFile } from 'node:fs/promises';
import { fetchTennisDataYear } from './ingest-tennisdata.js';

function ymdOf(d) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

async function build() {
  const cutoff = ymdOf(new Date(Date.now() - 3 * 365 * 86400000)); // ~3 anos
  const nowYear = new Date().getUTCFullYear();
  const years = [];
  for (let y = Math.floor(cutoff / 10000); y <= nowYear; y++) years.push(y);
  const out = { generatedAt: new Date().toISOString(), count: 0, matches: [] };
  for (const tour of ['ATP', 'WTA']) {
    for (const year of years) {
      let matches = [];
      try {
        matches = await fetchTennisDataYear(year, tour);
      } catch (e) {
        console.warn(`${tour} ${year} ignorado: ${e.message}`);
        continue;
      }
      for (const m of matches) {
        if (!m.dateInt || m.dateInt < cutoff || !m.winner || !m.loser) continue;
        out.matches.push({ date: m.dateInt, surface: m.surface, tour, winner: m.winner, loser: m.loser });
      }
    }
  }
  out.matches.sort((a, b) => a.date - b.date);
  out.count = out.matches.length;
  if (out.count === 0) {
    console.warn('matches.json: 0 partidas — mantendo o arquivo anterior.');
    return;
  }
  await writeFile(new URL('../web/matches.json', import.meta.url), JSON.stringify(out));
  console.log(`matches.json: ${out.count} partidas desde ${cutoff}`);
}

build();
