// Lê um confronto pelo modelo treinado (ferramenta de linha de comando + demo).
// Uso: node pipeline/read.js "Nome A" "Nome B" [hard|clay|grass] [atp|wta]
import { readFile } from 'node:fs/promises';
import { analyzeMatch } from '../web/src/analysis.js';

const [qa, qb, surface = 'hard', tour = 'atp'] = process.argv.slice(2);
const model = JSON.parse(await readFile(new URL(`../web/model-${tour.toLowerCase()}.json`, import.meta.url)));
const find = (q) =>
  model.players.find((p) => p.name.toLowerCase() === q.toLowerCase()) ||
  model.players.find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
const a = find(qa);
const b = find(qb);
if (!a || !b) {
  console.error(`Não encontrei: ${!a ? qa : qb}`);
  process.exit(1);
}

const pct = (x) => (x * 100).toFixed(1) + '%';
const r = analyzeMatch(a, b, surface, model);

console.log(`\n🎾 ${a.name}  vs  ${b.name}   (${surface})`);
console.log('─'.repeat(52));
for (const s of [r.a, r.b]) {
  console.log(`${s.name.padEnd(22)} Elo ${s.elo} / ${surface} ${s.surfaceElo ?? '—'} → força ${s.blended}  [${s.surfaceRead.tag}${s.surfaceRead.delta ? ' ' + (s.surfaceRead.delta > 0 ? '+' : '') + s.surfaceRead.delta : ''}]`);
}
console.log('─'.repeat(52));
console.log(`Favorito : ${r.favorite}  (${pct(r.favoriteProb)}) — ${r.marginLabel}`);
console.log(`Prob     : ${a.name} ${pct(r.probA)}  |  ${b.name} ${pct(r.probB)}`);
console.log(`Odd justa: ${a.name} ${r.fairOddA.toFixed(2)}  |  ${b.name} ${r.fairOddB.toFixed(2)}`);
console.log(`Confiança: ${r.confidence.level}  (${r.confidence.reason})\n`);
