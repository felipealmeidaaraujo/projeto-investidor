// Gera data/peak-2010-2019.json — o melhor ranking de cada jogador entre 2010 e 2019.
// RODA UMA VEZ, à mão. NÃO entra no cron: essa história não muda mais.
// Uso: node pipeline/peak-cache-build.js
import { writeFile } from 'node:fs/promises';
import { parseRankingRows } from './rankings.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';

async function peakOf(tour) {
  const t = tour.toLowerCase();
  const res = await fetch(`${BASE}/${t}/${t}_rankings_10s.csv`);
  if (!res.ok) throw new Error(`${t}_rankings_10s.csv: HTTP ${res.status}`);
  const rows = parseRankingRows(await res.text());
  const peak = {};
  for (const r of rows) {
    const cur = peak[r.id];
    if (cur === undefined || r.rank < cur[0]) peak[r.id] = [r.rank, r.date];
  }
  console.log(`${t}: ${rows.length} linhas -> ${Object.keys(peak).length} jogadores com pico em 2010-2019`);
  return peak;
}

async function main() {
  // Sem filtrar por "quem está ativo hoje": filtrar economizaria 152 KB e criaria
  // um bug — quem sumir e voltar em 2027 ficaria sem pico.
  const out = { atp: await peakOf('ATP'), wta: await peakOf('WTA') };
  const url = new URL('../data/peak-2010-2019.json', import.meta.url);
  const json = JSON.stringify(out);
  await writeFile(url, json);
  console.log(`\ndata/peak-2010-2019.json salvo: ${(json.length / 1024).toFixed(0)} KB`);
}

main();
