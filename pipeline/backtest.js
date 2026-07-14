// Backtest walk-forward + calibração out-of-sample.
// Processa as partidas em ordem, prevê CADA jogo ANTES de atualizar (sem vazamento),
// ajusta a temperatura em anos de TREINO e mede a melhora em anos de TESTE.
// Uso: node pipeline/backtest.js [anoInicio] [anoFim] [anoPontuacao] [anoSplitTeste]
import { EloEngine } from './elo-engine.js';
import { loadYears } from './ingest.js';
import { logLoss, brier, accuracy, calibrationBins } from './metrics.js';
import { fitTemperature, calibrate } from './calibrate.js';

const FROM = Number(process.argv[2]) || 2010;
const TO = Number(process.argv[3]) || 2024;
const SCORE_FROM = Number(process.argv[4]) || FROM + 3;
const SPLIT = Number(process.argv[5]) || TO - 3; // teste = últimos anos
const scoreFromInt = SCORE_FROM * 10000;
const splitInt = SPLIT * 10000;

function printMetrics(label, preds) {
  console.log(`${label.padEnd(26)} log-loss ${logLoss(preds).toFixed(4)}   Brier ${brier(preds).toFixed(4)}   acurácia ${(accuracy(preds) * 100).toFixed(1)}%   (n=${preds.length})`);
}
function printCalib(label, preds) {
  console.log(`\n${label}\nfaixa      prevista   real     n`);
  for (const b of calibrationBins(preds, 10)) {
    if (!b.count) continue;
    const faixa = `${(b.bin * 10).toString().padStart(2)}–${b.bin * 10 + 10}%`;
    console.log(`${faixa.padEnd(9)}  ${(b.avgPred * 100).toFixed(1).padStart(6)}%  ${(b.avgOutcome * 100).toFixed(1).padStart(6)}%  ${String(b.count).padStart(6)}`);
  }
}

console.log(`Baixando ATP ${FROM}–${TO}...`);
const matches = await loadYears(FROM, TO);
console.log(`${matches.length} partidas. Aquecimento até ${SCORE_FROM - 1}; treino de calibração ${SCORE_FROM}–${SPLIT - 1}; TESTE ${SPLIT}–${TO}.\n`);

const engine = new EloEngine();
const preds = [];
for (const m of matches) {
  if (!m.surface) continue;
  const rW = engine.rating(m.winner, m.surface);
  const rL = engine.rating(m.loser, m.surface);
  let fav, oth, outcome;
  if (rW > rL) { fav = m.winner; oth = m.loser; outcome = 1; }
  else if (rL > rW) { fav = m.loser; oth = m.winner; outcome = 0; }
  else if (m.winner < m.loser) { fav = m.winner; oth = m.loser; outcome = 1; }
  else { fav = m.loser; oth = m.winner; outcome = 0; }
  const p = engine.predict(fav, oth, m.surface);
  if (m.dateInt >= scoreFromInt) preds.push({ p, outcome, dateInt: m.dateInt });
  engine.processMatch({ winner: m.winner, loser: m.loser, surface: m.surface });
}

const fitSet = preds.filter((x) => x.dateInt < splitInt);
const testSet = preds.filter((x) => x.dateInt >= splitInt);
const T = fitTemperature(fitSet);
const testCal = testSet.map(({ p, outcome }) => ({ p: calibrate(p, T), outcome }));

console.log('=== MÉTRICAS (conjunto de TESTE, out-of-sample) ===');
printMetrics('Modelo cru:', testSet);
printMetrics(`Modelo calibrado (T=${T}):`, testCal);
console.log('\nReferências: bookmaker ATP ≈ Brier 0.198 · favorito vence ≈ 65–70%');

printCalib('=== CALIBRAÇÃO — CRU (teste) ===', testSet);
printCalib(`=== CALIBRAÇÃO — CALIBRADO T=${T} (teste) ===`, testCal);
