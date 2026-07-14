// Gera web/closings.json com os fechamentos Pinnacle das últimas ~10 semanas (ATP+WTA).
// Roda no robô (GitHub Actions) e localmente: node pipeline/closings.js
import { writeFile } from 'node:fs/promises';
import { fetchTennisDataYear } from './ingest-tennisdata.js';

function ymdOf(d) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

async function build() {
  const cutoff = ymdOf(new Date(Date.now() - 70 * 86400000)); // ~10 semanas
  const nowYear = new Date().getUTCFullYear();
  const cutoffYear = Math.floor(cutoff / 10000);
  // Se a janela cruza a virada de ano (jan–mar), busca também o ano anterior.
  const years = cutoffYear < nowYear ? [cutoffYear, nowYear] : [nowYear];
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
        // fechamento: Betfair Exchange (mercado do Felipe) → média → Max
        out.matches.push({ date: m.dateInt, surface: m.surface, tour, winner: m.winner, loser: m.loser, bfew: m.bfew, bfel: m.bfel, avgw: m.avgw, avgl: m.avgl, maxw: m.maxw, maxl: m.maxl });
      }
    }
  }
  out.matches.sort((a, b) => a.date - b.date);
  out.count = out.matches.length;
  if (out.count === 0) {
    console.warn('closings.json: 0 partidas (download falhou?) — mantendo o arquivo anterior.');
    return;
  }
  await writeFile(new URL('../web/closings.json', import.meta.url), JSON.stringify(out));
  console.log(`closings.json: ${out.count} partidas desde ${cutoff}`);
}

build();
