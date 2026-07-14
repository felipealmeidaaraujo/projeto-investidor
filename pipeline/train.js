// Treina o modelo Elo em todo o histórico e salva web/model.json (o "cérebro" que o app usa).
// Uso: node pipeline/train.js [anoInicio] [anoFim]
import { writeFile } from 'node:fs/promises';
import { EloEngine } from './elo-engine.js';
import { loadYears } from './ingest.js';
import { fitTemperature } from './calibrate.js';

const FROM = Number(process.argv[2]) || 2010;
const TO = Number(process.argv[3]) || 2024;
const MIN_MATCHES = 20;
const warmupInt = (FROM + 3) * 10000;
const splitInt = (TO - 3) * 10000;

console.log(`Baixando ATP ${FROM}–${TO}...`);
const matches = await loadYears(FROM, TO);
console.log(`${matches.length} partidas. Treinando...`);

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
  engine.processMatch({ winner: m.winner, loser: m.loser, surface: m.surface });
}

const T = fitTemperature(fitPreds);
const r = (x) => (x == null ? null : Math.round(x));

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
  }))
  .filter((p) => p.matches >= MIN_MATCHES)
  .sort((a, b) => b.elo - a.elo);

const model = {
  generatedAt: new Date().toISOString(),
  tour: 'ATP',
  yearsFrom: FROM,
  yearsTo: TO,
  calibrationT: T,
  playerCount: players.length,
  players,
};

await writeFile(new URL('../web/model.json', import.meta.url), JSON.stringify(model));
console.log(`\nmodel.json salvo: ${players.length} jogadores, T=${T}\n`);

console.log('=== TOP 15 POR ELO (teste de sanidade) ===');
players.slice(0, 15).forEach((p, i) =>
  console.log(`${String(i + 1).padStart(2)}. ${p.name.padEnd(22)} Elo ${p.elo}  (hard ${p.hard ?? '—'} / clay ${p.clay ?? '—'} / grass ${p.grass ?? '—'})`)
);
