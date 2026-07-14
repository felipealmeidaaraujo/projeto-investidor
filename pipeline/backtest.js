// Backtest walk-forward: processa as partidas em ordem, prevê CADA jogo ANTES de
// atualizar os ratings (sem vazamento), e mede a calibração do modelo.
// Uso: node pipeline/backtest.js [anoInicio] [anoFim] [anoInicioPontuacao]
import { EloEngine } from './elo-engine.js';
import { loadYears } from './ingest.js';
import { logLoss, brier, accuracy, calibrationBins } from './metrics.js';

const FROM = Number(process.argv[2]) || 2010;
const TO = Number(process.argv[3]) || 2024;
const SCORE_FROM = Number(process.argv[4]) || FROM + 3; // aquecimento
const scoreFromInt = SCORE_FROM * 10000;

console.log(`Baixando ATP ${FROM}–${TO}...`);
const matches = await loadYears(FROM, TO);
console.log(`${matches.length} partidas carregadas. Aquecimento até ${SCORE_FROM - 1}, pontuando de ${SCORE_FROM} em diante.\n`);

const engine = new EloEngine();
const preds = [];
let skippedNoSurface = 0;

for (const m of matches) {
  if (!m.surface) { skippedNoSurface++; continue; }

  // Referência = favorito pelo rating atual (independente do resultado; empate desempata por nome)
  const rW = engine.rating(m.winner, m.surface);
  const rL = engine.rating(m.loser, m.surface);
  let fav, oth, outcome;
  if (rW > rL) { fav = m.winner; oth = m.loser; outcome = 1; }
  else if (rL > rW) { fav = m.loser; oth = m.winner; outcome = 0; }
  else if (m.winner < m.loser) { fav = m.winner; oth = m.loser; outcome = 1; }
  else { fav = m.loser; oth = m.winner; outcome = 0; }

  const p = engine.predict(fav, oth, m.surface);
  if (m.dateInt >= scoreFromInt) preds.push({ p, outcome });

  engine.processMatch({ winner: m.winner, loser: m.loser, surface: m.surface });
}

console.log(`Partidas pontuadas: ${preds.length}  (ignoradas por falta de superfície: ${skippedNoSurface})\n`);
console.log('=== QUALIDADE DAS PROBABILIDADES ===');
console.log(`Log-loss : ${logLoss(preds).toFixed(4)}   (referência de mercado ATP ≈ 0.55–0.58)`);
console.log(`Brier    : ${brier(preds).toFixed(4)}   (bookmaker ATP ≈ 0.198; bom Elo ≈ 0.20–0.22)`);
console.log(`Acurácia : ${(accuracy(preds) * 100).toFixed(1)}%   (favorito vence ≈ 65–70%)\n`);

console.log('=== CALIBRAÇÃO (prob prevista → frequência real) ===');
console.log('faixa      prevista   real     n');
for (const b of calibrationBins(preds, 10)) {
  if (!b.count) continue;
  const faixa = `${(b.bin * 10).toString().padStart(2)}–${b.bin * 10 + 10}%`;
  console.log(
    `${faixa.padEnd(9)}  ${(b.avgPred * 100).toFixed(1).padStart(6)}%  ${(b.avgOutcome * 100).toFixed(1).padStart(6)}%  ${String(b.count).padStart(6)}`
  );
}
