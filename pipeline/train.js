// Treina o modelo Elo com dados ATUAIS (tennis-data.co.uk, 2013–2026) e salva web/model.json.
// Marca quem está ATIVO (jogou recentemente) para o app focar em quem joga hoje.
// Uso: node pipeline/train.js [anoInicio] [anoFim]
import { writeFile } from 'node:fs/promises';
import { EloEngine } from './elo-engine.js';
import { loadTennisData } from './ingest-tennisdata.js';
import { fitTemperature } from './calibrate.js';

const FROM = Number(process.argv[2]) || 2013;
const TO = Number(process.argv[3]) || 2026;
const MIN_MATCHES = 20;
const warmupInt = (FROM + 2) * 10000;
const splitInt = (TO - 3) * 10000;

console.log(`Baixando ATP ${FROM}–${TO} (tennis-data.co.uk, atual)...`);
const matches = await loadTennisData(FROM, TO, 'ATP');
const maxDate = matches[matches.length - 1].dateInt;
console.log(`${matches.length} partidas (até ${maxDate}). Treinando...`);

const engine = new EloEngine();
const fitPreds = [];
for (const m of matches) {
  if (!m.surface) continue;
  const rW = engine.rating(m.winner, m.surface);
  const rL = engine.rating(m.loser, m.surface);
  let favP, favOut;
  if (rW > rL) { favP = engine.predict(m.winner, m.loser, m.surface); favOut = 1; }
  else if (rL > rW) { favP = engine.predict(m.loser, m.winner, m.surface); favOut = 0; }
  else if (m.winner < m.loser) { favP = engine.predict(m.winner, m.loser, m.surface); favOut = 1; }
  else { favP = engine.predict(m.loser, m.winner, m.surface); favOut = 0; }
  if (m.dateInt >= warmupInt && m.dateInt < splitInt) fitPreds.push({ p: favP, outcome: favOut });
  engine.processMatch({ winner: m.winner, loser: m.loser, surface: m.surface, dateInt: m.dateInt });
}

const T = fitTemperature(fitPreds);
const r = (x) => (x == null ? null : Math.round(x));
// Ativo = jogou no último ~ano e meio (do ano anterior ao mais recente em diante)
const activeCutoff = (Math.floor(maxDate / 10000) - 1) * 10000;

const players = [...engine.players.entries()]
  .map(([name, p]) => ({
    name,
    elo: r(p.overall),
    hard: r(p.surfaces.hard),
    clay: r(p.surfaces.clay),
    grass: r(p.surfaces.grass),
    matches: p.matches,
    matchesBySurface: {
      hard: p.surfaceMatches.hard ?? 0,
      clay: p.surfaceMatches.clay ?? 0,
      grass: p.surfaceMatches.grass ?? 0,
    },
    lastDate: p.lastDate,
    active: p.lastDate >= activeCutoff,
  }))
  .filter((p) => p.matches >= MIN_MATCHES)
  .sort((a, b) => b.elo - a.elo);

const model = {
  generatedAt: new Date().toISOString(),
  tour: 'ATP',
  source: 'tennis-data.co.uk',
  yearsFrom: FROM,
  yearsTo: TO,
  dataThrough: maxDate,
  calibrationT: T,
  activeCutoff,
  playerCount: players.length,
  activeCount: players.filter((p) => p.active).length,
  players,
};

await writeFile(new URL('../web/model.json', import.meta.url), JSON.stringify(model));
console.log(`\nmodel.json salvo: ${players.length} jogadores (${model.activeCount} ativos), T=${T}, dados até ${maxDate}\n`);

console.log('=== TOP 15 ATIVOS POR ELO (quem joga hoje) ===');
players.filter((p) => p.active).slice(0, 15).forEach((p, i) =>
  console.log(`${String(i + 1).padStart(2)}. ${p.name.padEnd(18)} Elo ${p.elo}  (hard ${p.hard ?? '—'} / clay ${p.clay ?? '—'} / grass ${p.grass ?? '—'})  último: ${p.lastDate}`)
);
