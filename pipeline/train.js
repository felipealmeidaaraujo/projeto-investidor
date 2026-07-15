// Treina o modelo Elo de um circuito (ATP ou WTA) combinando tennis-data (tour + odds/frescor)
// com Challenger/125 do mirror Sackmann. Marca ativos e o nível de origem de cada jogador.
// Uso: node pipeline/train.js [ATP|WTA] [anoInicio] [anoFim]
import { writeFile } from 'node:fs/promises';
import { EloEngine } from './elo-engine.js';
import { loadTennisData } from './ingest-tennisdata.js';
import { loadChallenger } from './ingest-sackmann.js';
import { buildChallengerNames } from '../web/src/match-names.js';
import { fitTemperature } from './calibrate.js';

const TOUR = (process.argv[2] || 'ATP').toUpperCase();
const FROM = Number(process.argv[3]) || 2013;
const TO = Number(process.argv[4]) || new Date().getFullYear();
const MIN_MATCHES = 20;
const warmupInt = (FROM + 2) * 10000;
const splitInt = (TO - 3) * 10000;

console.log(`Baixando ${TOUR} ${FROM}–${TO} (tennis-data + Challenger Sackmann)...`);
const tour = await loadTennisData(FROM, TO, TOUR);
for (const m of tour) m.src = 'tour';

// universo de nomes do tour, p/ canonicalizar os nomes do Sackmann (quem transita unifica)
const tourNames = new Set();
for (const m of tour) { tourNames.add(m.winner); tourNames.add(m.loser); }
const tourPlayers = [...tourNames].map((name) => ({ name }));

const challRaw = await loadChallenger(FROM, TO, TOUR);
const challFullNames = [...new Set(challRaw.flatMap((m) => [m.winnerFull, m.loserFull]))];
const canonMap = buildChallengerNames(challFullNames, tourPlayers);
const chall = challRaw.map((m) => ({
  dateInt: m.dateInt,
  surface: m.surface,
  winner: canonMap.get(m.winnerFull),
  loser: canonMap.get(m.loserFull),
  src: 'chall',
}));

const matches = [...tour, ...chall].sort((a, b) => a.dateInt - b.dateInt);
const maxDate = matches[matches.length - 1].dateInt;
console.log(`${tour.length} tour + ${chall.length} challenger = ${matches.length} partidas (até ${maxDate}). Treinando ${TOUR}...`);

const engine = new EloEngine();
const origin = new Map(); // name -> { tour, chall }
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
  const key = m.src === 'chall' ? 'chall' : 'tour';
  for (const nm of [m.winner, m.loser]) {
    const e = origin.get(nm) || { tour: 0, chall: 0 };
    e[key] += 1; origin.set(nm, e);
  }
  engine.processMatch({ winner: m.winner, loser: m.loser, surface: m.surface, dateInt: m.dateInt });
}

const T = fitTemperature(fitPreds);
const r = (x) => (x == null ? null : Math.round(x));
const activeCutoff = (Math.floor(maxDate / 10000) - 1) * 10000;

const players = [...engine.players.entries()]
  .map(([name, p]) => {
    const o = origin.get(name) || { tour: 0, chall: 0 };
    return {
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
      // empate (chall === tour) cai em 'tour': trata como circuito principal
      level: o.chall > o.tour ? 'challenger' : 'tour',
    };
  })
  .filter((p) => p.matches >= MIN_MATCHES)
  .sort((a, b) => b.elo - a.elo);

const model = {
  generatedAt: new Date().toISOString(),
  tour: TOUR,
  source: 'tennis-data.co.uk + sackmann-challenger',
  yearsFrom: FROM,
  yearsTo: TO,
  dataThrough: maxDate,
  calibrationT: T,
  activeCutoff,
  playerCount: players.length,
  activeCount: players.filter((p) => p.active).length,
  challengerCount: players.filter((p) => p.level === 'challenger').length,
  players,
};

await writeFile(new URL(`../web/model-${TOUR.toLowerCase()}.json`, import.meta.url), JSON.stringify(model));
console.log(`\nmodel-${TOUR.toLowerCase()}.json salvo: ${players.length} jogadores (${model.activeCount} ativos, ${model.challengerCount} challenger), T=${T}, dados até ${maxDate}\n`);

console.log(`=== TOP 12 ATIVOS ${TOUR} POR ELO ===`);
players.filter((p) => p.active).slice(0, 12).forEach((p, i) =>
  console.log(`${String(i + 1).padStart(2)}. ${p.name.padEnd(22)} Elo ${p.elo}  (hard ${p.hard ?? '—'} / clay ${p.clay ?? '—'} / grass ${p.grass ?? '—'})`)
);
