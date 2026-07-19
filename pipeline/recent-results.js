// Gera web/recent-results.json: os resultados ENCERRADOS dos últimos dias, direto do
// Flashscore (fonte fresca), pra complementar o matches.json histórico (tennis-data/Sackmann,
// que tem lag de ~1-2 semanas). Assim forma recente, descanso e H2H ficam atualizados.
// Nomes canonicalizados contra o modelo (só quem casa entra — o app só usa esses).
// Uso: node pipeline/recent-results.js
import { writeFile, readFile } from 'node:fs/promises';
import { fetchResults } from './flashscore.js';
import { findModelPlayer } from '../web/src/match-names.js';

const DAYS = 14; // dias pra trás (cobre a lacuna do histórico)

async function build() {
  const models = {
    ATP: JSON.parse(await readFile(new URL('../web/model-atp.json', import.meta.url))),
    WTA: JSON.parse(await readFile(new URL('../web/model-wta.json', import.meta.url))),
  };
  const out = { generatedAt: new Date().toISOString(), source: 'flashscore', count: 0, matches: [] };
  const seen = new Set();
  const nameCache = new Map(); // "TOUR|nome cru" -> nome canônico | null
  const canon = (tour, raw) => {
    const key = `${tour}|${raw}`;
    if (nameCache.has(key)) return nameCache.get(key);
    const p = findModelPlayer(raw, models[tour].players);
    const name = p ? p.name : null;
    nameCache.set(key, name);
    return name;
  };

  let fetchedDays = 0;
  for (let off = 0; off >= -DAYS; off--) {
    let results;
    try { results = await fetchResults(off); fetchedDays++; }
    catch (e) { console.warn(`dia ${off} ignorado: ${e.message}`); continue; }
    for (const r of results) {
      if (!models[r.tour]) continue;
      const winner = canon(r.tour, r.winner);
      const loser = canon(r.tour, r.loser);
      if (!winner || !loser) continue; // fora do modelo: o app não usaria mesmo
      const key = `${r.date}|${r.tour}|${winner}|${loser}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.matches.push({ date: r.date, surface: r.surface, tour: r.tour, winner, loser });
    }
  }

  out.matches.sort((a, b) => a.date - b.date);
  out.count = out.matches.length;
  if (!fetchedDays || out.count === 0) {
    console.warn('recent-results: nada capturado — mantendo o arquivo anterior.');
    return;
  }
  await writeFile(new URL('../web/recent-results.json', import.meta.url), JSON.stringify(out));
  console.log(`recent-results.json: ${out.count} resultados casados (${fetchedDays} dias do Flashscore).`);
}

build();
