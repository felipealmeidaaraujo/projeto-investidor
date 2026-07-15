// Enriquece os modelos (ATP/WTA) com padrões de estilo/pressão e bio, a partir do Sackmann.
// Uso: node pipeline/patterns-ingest.js
import { readFile, writeFile } from 'node:fs/promises';
import { parseCsv } from './ingest.js';
import { matchPlayer } from '../web/src/match-names.js';
import { toEnrichedMatch, groupByPlayer, buildProfile } from './patterns.js';

const BASE = 'https://raw.githubusercontent.com/Aneeshers/tennis-sackmann-archive/main';
const MIN_GAMES = 10;

const filesFor = (year, tour) =>
  tour === 'WTA'
    ? [`wta/wta_matches_${year}.csv`, `wta/wta_matches_qual_itf_${year}.csv`]
    : [`atp/atp_matches_${year}.csv`, `atp/atp_matches_qual_chall_${year}.csv`];

async function loadEnriched(from, to, tour) {
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);
  const all = [];
  await Promise.all(
    years.flatMap((y) =>
      filesFor(y, tour).map(async (f) => {
        try {
          const res = await fetch(`${BASE}/${f}`);
          if (!res.ok) return;
          for (const row of parseCsv(await res.text())) all.push(toEnrichedMatch(row));
        } catch (e) {
          console.warn(`aviso: ${f} ignorado (${e.message})`);
        }
      })
    )
  );
  return all;
}

async function enrich(modelFile, tour) {
  const url = new URL(modelFile, import.meta.url);
  const model = JSON.parse(await readFile(url));
  const to = new Date().getFullYear();
  const from = to - 2;
  console.log(`Padrões ${tour} ${from}–${to}...`);
  const matches = await loadEnriched(from, to, tour);
  const byName = groupByPlayer(matches);

  const byPlayer = new Map();
  for (const [fullName, entries] of byName) {
    const p = matchPlayer(fullName, model.players);
    if (!p) continue;
    if (!byPlayer.has(p.name)) byPlayer.set(p.name, []);
    byPlayer.get(p.name).push(...entries);
  }

  let n = 0;
  for (const p of model.players) {
    const entries = byPlayer.get(p.name);
    if (!entries || entries.length < MIN_GAMES) continue;
    const prof = buildProfile(entries);
    p.style = prof.style;
    p.pressure = prof.pressure;
    p.bio = prof.bio;
    n++;
  }
  await writeFile(url, JSON.stringify(model));
  console.log(`${modelFile}: ${n} jogadores com padrões (de ${matches.length} jogos, ${byName.size} nomes).`);
}

async function main() {
  await enrich('../web/model-atp.json', 'ATP');
  await enrich('../web/model-wta.json', 'WTA');
}

main();
