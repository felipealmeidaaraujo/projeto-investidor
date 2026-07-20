// Sondagem dos dados do tennis-data.co.uk: até onde vão, quão frescos, com odds e placar de set.
// Uso: node pipeline/data-freshness.js [anoInicio] [anoFim]
import { loadTennisData } from './ingest-tennisdata.js';

const FROM = Number(process.argv[2]) || 2023;
const TO = Number(process.argv[3]) || 2026;

const ymd = (n) => `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}`;

async function probe(tour) {
  const matches = await loadTennisData(FROM, TO, tour);
  const byYear = {};
  for (const m of matches) {
    const y = Math.floor(m.dateInt / 10000);
    const b = (byYear[y] ??= { n: 0, odds: 0, set1: 0, bfe: 0, min: Infinity, max: 0 });
    b.n++;
    if ((m.psw && m.psl) || (m.avgw && m.avgl)) b.odds++;
    if (m.bfew && m.bfel) b.bfe++;
    if (m.w1 != null && m.l1 != null) b.set1++;
    b.min = Math.min(b.min, m.dateInt);
    b.max = Math.max(b.max, m.dateInt);
  }
  console.log(`\n=== ${tour} ===`);
  console.log('ano     jogos   c/odds   c/Betfair  c/placar-set   período');
  for (const y of Object.keys(byYear).sort()) {
    const b = byYear[y];
    const pct = (x) => `${((x / b.n) * 100).toFixed(0)}%`;
    console.log(
      `${y}   ${String(b.n).padStart(6)}   ${pct(b.odds).padStart(5)}    ${pct(b.bfe).padStart(6)}     ${pct(b.set1).padStart(6)}       ${ymd(b.min)} → ${ymd(b.max)}`
    );
  }
}

async function main() {
  console.log(`Puxando ${FROM}–${TO} do tennis-data.co.uk...`);
  await probe('ATP');
  await probe('WTA');
  console.log('\nc/odds = tem odd de fechamento (Pinnacle ou média). c/Betfair = tem odd da Betfair Exchange.');
  console.log('c/placar-set = tem o placar do 1º set (pros métodos condicionais).');
}

main();
