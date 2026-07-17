// Gera web/matches.json (~3 anos, ATP+WTA, tour + Challenger) pra forma/descanso/H2H.
// Usa a MESMA canonicalização do train (loadCombinedMatches, FROM=2013) → nomes consistentes
// com o modelo. Rode: node pipeline/matches.js
import { writeFile } from 'node:fs/promises';
import { loadCombinedMatches, DEFAULT_FROM } from './combined-matches.js';

function ymdOf(d) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

const FROM = DEFAULT_FROM; // mesmo início do train, pra a canonicalização de nomes bater

async function build() {
  const cutoff = ymdOf(new Date(Date.now() - 3 * 365 * 86400000)); // emite ~3 anos (tour)
  const challCutoff = ymdOf(new Date(Date.now() - 2 * 365 * 86400000)); // Challenger: ~2 anos (peso)
  const nowYear = new Date().getUTCFullYear();
  const out = { generatedAt: new Date().toISOString(), count: 0, matches: [] };

  for (const tour of ['ATP', 'WTA']) {
    let all = [];
    try {
      all = await loadCombinedMatches(FROM, nowYear, tour);
    } catch (e) {
      console.warn(`${tour} ignorado: ${e.message}`);
      continue;
    }
    for (const m of all) {
      if (!m.dateInt || !m.surface || !m.winner || !m.loser) continue;
      const lim = m.src === 'chall' ? challCutoff : cutoff;
      if (m.dateInt < lim) continue;
      // `num` (match_num) só existe no Challenger, e só ele precisa: as partidas de um
      // torneio compartilham a data, então é ele que ordena as rodadas entre si (ver
      // byChronology em ingest-sackmann.js e o desempate em scouting.js:recentForm).
      // Omitido no tour, que já tem data por partida — evita ~8% de peso à toa no JSON.
      const linha = { date: m.dateInt, surface: m.surface, tour, winner: m.winner, loser: m.loser };
      if (m.num) linha.num = m.num;
      out.matches.push(linha);
    }
  }

  out.matches.sort((a, b) => a.date - b.date || (a.num ?? 0) - (b.num ?? 0));
  out.count = out.matches.length;
  if (out.count === 0) {
    console.warn('matches.json: 0 partidas — mantendo o arquivo anterior.');
    return;
  }
  await writeFile(new URL('../web/matches.json', import.meta.url), JSON.stringify(out));
  console.log(`matches.json: ${out.count} partidas (tour desde ${cutoff}, challenger desde ${challCutoff})`);
}

build();
