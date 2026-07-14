// Demo do motor ao vivo: mostra como a odd justa se MOVE com o placar de um confronto.
// Uso: node pipeline/live.js "Nome A" "Nome B" [hard|clay|grass] [atp|wta]
import { readFile } from 'node:fs/promises';
import { analyzeMatch } from '../web/src/analysis.js';
import { impliedServeProbs, winProbFromState } from '../web/src/inplay.js';

const [qa, qb, surface = 'hard', tour = 'atp'] = process.argv.slice(2);
const model = JSON.parse(await readFile(new URL(`../web/model-${tour.toLowerCase()}.json`, import.meta.url)));
const find = (q) =>
  model.players.find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
const a = find(qa);
const b = find(qb);

const pre = analyzeMatch(a, b, surface, model);
const base = tour.toLowerCase() === 'wta' ? 0.56 : 0.64;
const { pA, pB } = impliedServeProbs(pre.probA, { base, bestOf: 3 });

const cenarios = [
  ['Início do jogo (0-0)', { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true }],
  [`${a.name} quebra e faz 3-1 no 1º set`, { setsA: 0, setsB: 0, gamesA: 3, gamesB: 1, serverIsA: false }],
  [`${a.name} vence o 1º set`, { setsA: 1, setsB: 0, gamesA: 0, gamesB: 0, serverIsA: true }],
  [`${b.name} quebra: ${a.name} 1-3 no 1º set`, { setsA: 0, setsB: 0, gamesA: 1, gamesB: 3, serverIsA: true }],
  [`${b.name} vence o 1º set`, { setsA: 0, setsB: 1, gamesA: 0, gamesB: 0, serverIsA: true }],
  [`Empate 1 set a 1, 3-3 no 3º`, { setsA: 1, setsB: 1, gamesA: 3, gamesB: 3, serverIsA: true }],
];

console.log(`\n🎾 ${a.name} vs ${b.name} (${surface}, ${tour.toUpperCase()})`);
console.log(`Prob pré-jogo: ${a.name} ${(pre.probA * 100).toFixed(1)}%  →  força de saque estimada ${(pA * 100).toFixed(0)}% / ${(pB * 100).toFixed(0)}%`);
console.log('─'.repeat(70));
console.log('cenário'.padEnd(42) + `${a.name.split(' ')[0]}%`.padStart(8) + '  odd A / odd B');
console.log('─'.repeat(70));
for (const [label, st] of cenarios) {
  const p = winProbFromState(st, pA, pB, 3);
  const oddA = (1 / p).toFixed(2);
  const oddB = (1 / (1 - p)).toFixed(2);
  console.log(label.padEnd(42) + `${(p * 100).toFixed(1)}`.padStart(7) + `   ${oddA} / ${oddB}`);
}
console.log('─'.repeat(70));
console.log('Leitura: se o mercado se afastar MUITO da odd justa após um game, pode ser sobre-reação.\n');
